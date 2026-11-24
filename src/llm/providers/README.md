# src/llm/providers/

One adapter per LLM provider. Each exports a `call*` function with the same shape (defined by
`ProviderCallParams`/`ProviderResponse` in `../types`), translating the app's provider-neutral
messages and tool schemas into that vendor's REST API and normalizing the response (text +
tool calls) back. `agent.ts` picks one based on the user's selected provider. Errors are
surfaced as `LLMError`.

Every adapter accepts an `AbortSignal`. `request.ts` applies a request timeout and maps
provider failures to short error reasons without exposing raw response bodies. Gemini
keys travel in a request header, and function thought signatures survive tool round trips.

## Files

- `anthropic.ts` — Anthropic Messages API adapter (content blocks, `tool_use` blocks).
- `openai.ts` — OpenAI Chat Completions adapter (messages, `function` tool calls).
- `gemini.ts` — Google Gemini adapter; also converts the app's lowercase JSON-schema tools into
  Gemini's uppercase proto-enum `Schema` format.
- `local.ts` — discovers Codex model IDs from `/api/local-ai/status` and sends Chat
  Completions to `/api/local-ai/chat`. No gateway key is available in the browser.
- `request.ts` — cancellation, timeout, response parsing, and safe error handling.

## Local Codex

`server/kesselPlugin.ts` provides development middleware only. `kessel run --provider codex`
injects `OPENAI_BASE_URL` and `OPENAI_API_KEY` into the Vite process. The middleware accepts
only loopback clients, a loopback Codex upstream, and same-origin JSON requests carrying the
application header. It rejects remote origins and never forwards private headers or raw
gateway diagnostics. Static production builds contain no subscription proxy.

Kessel supports up to 16 tools. The local agent omits raw-coordinate `add_item` and retains
intent-based placement plus `update_item` for exact edits. Full conversation history and
tool results are sent on each request because Kessel requests are stateless. Model options
come from the authenticated gateway model list. The local request timeout is 180 seconds;
direct provider requests have a 60-second timeout.
