# src/components/Chat/

The LLM assistant chat UI. The actual model/tool logic lives in `src/llm/`; this is just the
panel that drives it.

## Files

- `ChatPanel.tsx` — slide-out chat panel: renders the conversation (including tool-call
  activity), takes user input, and calls `runAgent` from `src/llm/agent.ts` with the configured
  provider/model/key. Surfaces errors and offers direct starter actions, clear, and Stop.

The transcript and draft belong to one design and room and survive closing the panel in
tab memory. Returning to another room restores that room's thread. The cache holds at most
50 conversations and writes nothing to browser storage. Changing provider or model preserves
the visible transcript and draft; the next request starts fresh provider history.

Closing, switching rooms, committing new connection settings, or Stop cancels an in-flight
request. Late events are ignored after cancellation, and the agent independently enforces
the document scope before applying tools. A stopped run keeps completed edits and resets
provider history so the next request reads the current room. Submitted text is restored for
retry unless the user already typed a new draft.

Local Codex checks the real Kessel connection and discovers available models before a run.
It requires no browser API key. Direct-provider keys come from in-memory settings. Missing
configuration shows Set up assistant before sending is enabled. Configured starter actions
send directly. Failed sends restore the request instead of losing it. Messages are
plain text, limited to 8000 characters, and exposed through an accessible live log.
