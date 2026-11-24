import { LLMError } from "../types";

/** Provider response bodies can contain request data. Keep raw errors and keys out of the UI. */
export async function providerRequest<T>(provider: string, url: string, init: RequestInit, signal?: AbortSignal, timeoutMs = 60_000): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await fetch(url, { ...init, signal: combined });
    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403 ? "Check your API key and model access."
        : response.status === 429 ? "Rate limit reached. Try again shortly."
        : response.status === 400 || response.status === 404 ? "Check the model name and tool support."
        : "The provider is unavailable. Try again.";
      throw new LLMError(`${provider} (${response.status}): ${reason}`);
    }
    try {
      return await response.json() as T;
    } catch {
      signal?.throwIfAborted();
      if (timeout.aborted) throw new LLMError(`${provider} timed out. Try again.`);
      throw new LLMError(`${provider} returned an unreadable response. Try again.`);
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (timeout.aborted) throw new LLMError(`${provider} timed out. Try again.`);
    if (error instanceof LLMError) throw error;
    throw new LLMError(`${provider} could not be reached. Check your connection.`);
  }
}

export function toolInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LLMError("The assistant returned invalid tool arguments. Try again.");
  return value as Record<string, unknown>;
}
