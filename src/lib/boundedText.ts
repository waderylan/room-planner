export class BodyLimitError extends Error {
  constructor() {
    super("Response body exceeds its safety limit.");
    this.name = "BodyLimitError";
  }
}

/** Bound waiting itself, even if an adapter ignores its AbortSignal. */
export function withAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** A stalled read must observe cancellation even when the stream ignores its fetch signal. */
export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let chunks = 0;
  let text = "";
  const cancel = (reason?: unknown) => {
    // Cancellation is best-effort: a hostile stream's cancel callback may also stall.
    void reader.cancel(reason).catch(() => {});
  };
  let onAbort: (() => void) | undefined;
  const aborted = signal
    ? new Promise<never>((_resolve, reject) => {
        onAbort = () => {
          cancel(signal.reason);
          reject(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      })
    : null;
  try {
    while (true) {
      signal?.throwIfAborted();
      const pending = reader.read();
      const { done, value } = aborted
        ? await Promise.race([pending, aborted])
        : await pending;
      signal?.throwIfAborted();
      if (done) break;
      // Empty/tiny chunks can otherwise consume CPU indefinitely without reaching a byte cap.
      if (++chunks > 8192) {
        cancel();
        throw new BodyLimitError();
      }
      bytes += value.byteLength;
      if (bytes > maximum) {
        cancel();
        throw new BodyLimitError();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
