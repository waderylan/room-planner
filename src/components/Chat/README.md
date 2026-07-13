# src/components/Chat/

The LLM assistant chat UI. The actual model/tool logic lives in `src/llm/`; this is just the
panel that drives it.

## Files

- `ChatPanel.tsx` — slide-out chat panel: renders the conversation (including tool-call
  activity), takes user input, and calls `runAgent` from `src/llm/agent.ts` with the configured
  provider/model/key. Surfaces errors and lets the user clear the thread.
