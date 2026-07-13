# src/llm/providers/

One adapter per LLM provider. Each exports a `call*` function with the same shape (defined by
`ProviderCallParams`/`ProviderResponse` in `../types`), translating the app's provider-neutral
messages and tool schemas into that vendor's REST API and normalizing the response (text +
tool calls) back. `agent.ts` picks one based on the user's selected provider. Errors are
surfaced as `LLMError`.

## Files

- `anthropic.ts` — Anthropic Messages API adapter (content blocks, `tool_use` blocks).
- `openai.ts` — OpenAI Chat Completions adapter (messages, `function` tool calls).
- `gemini.ts` — Google Gemini adapter; also converts the app's lowercase JSON-schema tools into
  Gemini's uppercase proto-enum `Schema` format.
