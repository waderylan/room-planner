# src/components/Chat/

The LLM assistant chat UI. The actual model/tool logic lives in `src/llm/`; this is just the
panel that drives it.

## Files

- `ChatPanel.tsx` — slide-out chat panel: renders the conversation (including tool-call
  activity), takes user input, and calls `runAgent` from `src/llm/agent.ts` with the configured
  provider/model/key. Surfaces errors and offers direct starter actions, clear, and Stop.

The thread belongs to one design, room, provider, and model. Changing any of those remounts
the session and cancels an in-flight request. Closing or unmounting also aborts it. Late
events are ignored after cancellation, and the agent independently enforces the document
scope before applying tools. A stopped run keeps completed edits and resets conversation
history so the next request reads the current room.

Local Codex checks the real Kessel connection and discovers available models before a run.
It requires no browser API key. Direct-provider keys come from in-memory settings. Messages
are plain text, limited to 8000 characters, and exposed through an accessible live log.
