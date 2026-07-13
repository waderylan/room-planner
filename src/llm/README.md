# src/llm/

The optional LLM chat assistant that inspects and edits the active room through tools. Runs
entirely in the browser, calling the chosen provider's API directly with a user-supplied key
(see `settingsStore`). The UI lives in `components/Chat`.

## Flow

`ChatPanel` → `runAgent` (`agent.ts`) runs the tool-use loop: it sends the conversation + tool
schemas (`tools.ts`) to the active provider (`providers/`), and for each tool call the model
makes, `toolExecutor.ts` applies it to the store — using `placement.ts` to turn intent
("against the north wall", "beside the bed") into concrete, non-overlapping positions.

## Files

- `agent.ts` — the agent loop and system prompt; dispatches to the configured provider and
  executes returned tool calls until the model produces a final answer. Emits events for the UI.
- `tools.ts` — the tool definitions (JSON-schema): read room state, resize the room, add
  windows/doors, list presets, place/move/add/update/remove furniture, check the room, etc.
- `toolExecutor.ts` — applies each tool call to the Zustand store and returns a result string;
  validates inputs and reports overlap/out-of-bounds issues.
- `placement.ts` — the deterministic placement engine: resolves intent (wall/corner/center/
  beside) into a valid position and sensible rotation, sliding to the nearest free spot.
- `types.ts` — shared types: `Provider`, `Turn`, `ToolDef`, `JSONSchema`, provider call params/
  responses, and `LLMError`.
- `providers/` — one adapter per provider (Anthropic, OpenAI, Gemini). See its README.
