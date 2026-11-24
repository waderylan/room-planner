import type { IncomingMessage } from "node:http";

export class NodeBodyError extends Error {
  readonly status: 400 | 408 | 413;
  constructor(status: 400 | 408 | 413, message: string) {
    super(message);
    this.name = "NodeBodyError";
    this.status = status;
  }
}

interface BodyOptions {
  maximumBytes: number;
  timeoutMs?: number;
}

/** On error, callers must close the connection after flushing their error response. */
export function readNodeBody(
  req: IncomingMessage,
  options: BodyOptions,
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (
    !Number.isInteger(options.maximumBytes) ||
    options.maximumBytes < 1 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new Error("Invalid request-body limits.");
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    let chunks = 0;
    const bytes = Buffer.alloc(options.maximumBytes);
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
      req.off("close", onClosed);
    };
    const fail = (error: NodeBodyError) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Stop further buffering; destroying here would suppress the HTTP error response.
      req.pause();
      const ignoreClosedSocketError = () => {};
      req.on("error", ignoreClosedSocketError);
      req.once("close", () => req.off("error", ignoreClosedSocketError));
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      if (settled) return;
      if (++chunks > 4096)
        return fail(new NodeBodyError(400, "Request body is too fragmented."));
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (size + value.byteLength > options.maximumBytes)
        return fail(new NodeBodyError(413, "Request is too large."));
      value.copy(bytes, size);
      size += value.byteLength;
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(bytes.subarray(0, size));
    };
    const onAborted = () =>
      fail(new NodeBodyError(400, "Request was interrupted."));
    const onError = () =>
      fail(new NodeBodyError(400, "Request was interrupted."));
    const onClosed = () => {
      if (!settled) onAborted();
    };
    const timer = setTimeout(
      () => fail(new NodeBodyError(408, "Request body timed out.")),
      timeoutMs,
    );
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.once("aborted", onAborted);
    req.once("close", onClosed);
    if (req.destroyed) onAborted();
    else if (req.readableEnded) onEnd();
    else if (Number(req.headers["content-length"]) > options.maximumBytes)
      fail(new NodeBodyError(413, "Request is too large."));
  });
}
