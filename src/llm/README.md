# src/llm/

The room assistant reads and edits the active room through validated tools. Local development
defaults to Codex through Kessel; `npm run dev:codex` launches both through the app-managed
Kessel wrapper. The browser calls the same-origin `/api/local-ai` Vite middleware, which
retains the gateway key in the Node process. Optional Anthropic, OpenAI, and Gemini API
connections send a user-supplied key directly to that provider. Keys remain in tab memory.

## Flow

`ChatPanel` → `runAgent` (`agent.ts`) runs the tool-use loop: it sends the conversation + tool
schemas (`tools.ts`) to the active provider (`providers/`), and for each tool call the model
makes, `toolExecutor.ts` applies it to the store — using `placement.ts` to turn intent
("against the north wall", "beside the bed") into concrete, non-overlapping positions.

Every call validates types, enums, dimensions, identifiers, and colors before editing.
Store validation failures return to the model as tool errors. Existing furniture is
preserved unless replacement is requested. Metric presets and collision rules match the
manual editor. Placement searches use a bounded grid rather than allocating an unbounded
candidate list.

A run is scoped to its original design and room. Switching either, stopping, or closing
the panel cancels the request; late responses cannot modify another document. Synchronous
tool batches share a unique history token, so one request is one undo step unless a manual
edit intervenes. The loop stops after 20 provider steps and emits its stop reason to the UI.

## Files

- `agent.ts` — the agent loop and system prompt; dispatches to the configured provider and
  executes returned tool calls until the model produces a final answer. Emits events for the UI.
- `tools.ts` — the tool definitions (JSON-schema): read room state, resize the room, add
  windows/doors, list presets, place/move/add/update/remove furniture, check the room, etc.
- `toolExecutor.ts` — applies validated calls to Zustand and returns structured results or errors.
- `validation.ts` — validates the complete tool input before mutations.
- `placement.ts` — the deterministic placement engine: resolves intent (wall/corner/center/
  beside) into a valid position and sensible rotation, sliding to the nearest free spot.
- `types.ts` — shared types: `Provider`, `Turn`, `ToolDef`, `JSONSchema`, provider call params/
  responses, and `LLMError`.
- `providers/` — Local Codex, Anthropic, OpenAI, and Gemini adapters. See its README.

## Verification

- `npm test` runs mocked tool-loop, scope cancellation, input, credential, and proxy tests.
- `npm run test:assistant` is an explicit live integration check. Start `npm run dev:codex
  -- --port 5178 --strictPort` first, or set `ROOM_PLANNER_URL` to an existing instance.
  The check discovers actual Codex models and exercises desk placement, bedroom furnishing,
  existing-item edits, and metric conversion in an isolated in-memory document. It uses
  provider quota; it never changes browser designs or reads provider authentication files.
