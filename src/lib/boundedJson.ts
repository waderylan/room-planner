import { BodyLimitError, readBoundedText } from "./boundedText";

/** Bound untrusted JSON before decoding or parsing it. Never include its contents in errors. */
export async function readBoundedJson<T = unknown>(
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    void response.body?.cancel().catch(() => {});
    throw new BodyLimitError();
  }
  return JSON.parse(await readBoundedText(response.body, maximumBytes, signal)) as T;
}
