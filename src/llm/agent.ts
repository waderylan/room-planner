import type { Provider, Turn } from "./types";
import { LLMError } from "./types";
import { TOOLS } from "./tools";
import { executeTool } from "./toolExecutor";
import { callAnthropic } from "./providers/anthropic";
import { callOpenAI } from "./providers/openai";
import { callGemini } from "./providers/gemini";
import { callLocal } from "./providers/local";
import { useStore } from "../store/store";

const SYSTEM_PROMPT = `You are a room-planning assistant embedded in a 2D/3D furniture layout app. You inspect and edit the user's active room through tools: reading its shape and contents, resizing it, adding windows/doors, and placing/moving/editing/removing furniture.

## Coordinate frame (read carefully)
- The room lives on an X/Y grid in the room's own unit (feet or meters; get_room_state tells you which). X increases to the EAST (right); Y increases to the SOUTH (down, "into" the room on screen). So the NORTH wall is the smallest Y, SOUTH is the largest Y, WEST is the smallest X, EAST is the largest X.
- A rectangular room spans (0,0) at the north-west corner to (width, length) at the south-east corner.
- An item's raw "pos" is the top-left of its footprint BEFORE rotation, and rotation happens about the footprint's center. This is fiddly, so DO NOT compute positions by hand unless you must.

## How to place furniture (important)
- STRONGLY PREFER place_item and move_item. They take an intent — against a wall (n/e/s/w), in a corner (nw/ne/sw/se), in the center, or beside another item (a side n/e/s/w of a reference id) — and the app computes a non-overlapping, in-bounds position and a sensible rotation for you, sliding the piece to the nearest free spot if the exact target is taken. You almost never need raw x/y.
- Use "beside" with the reference item's id (from get_room_state) to put things next to each other, e.g. nightstands to the "w" and "e" sides of a bed, a coffee table centered in front ("s" side) of a sofa. Pass a small gap for walking clearance when it makes sense.
- Only use add_item / update_item with explicit x/y when the user gives an exact coordinate. Both report an "overlaps" flag; if it's true, fix it with move_item.

## Workflow for open-ended requests ("design a bedroom", "furnish this")
1. Call get_room_state to see the shape, unit, and existing items. Call list_presets to see what's available, and describe_walls if you need to know which wall index or cardinal side is which (e.g. before adding a window/door).
2. Preserve existing furniture, dimensions, and openings unless the user explicitly asks to replace or remove them. Use clear_items only when the user explicitly asks to remove all furniture or start over.
3. Place the largest anchor pieces first (bed, sofa, dining table, kitchen island) against walls or in corners, then attach smaller pieces "beside" them (nightstands, coffee table, chairs, rug). Give the room a coherent layout, not a pile in one corner.
4. Keep realistic clearance: leave walking room (roughly 2-3 ft / 0.6-0.9 m) around beds and between large pieces; don't block doors.
5. When done placing, call check_room. If it reports any overlaps or out-of-bounds items, fix each with move_item, then you may check again. Aim to finish with zero overlaps.

## Style
- After finishing, briefly summarize what you did and where things are, in plain language. Do NOT narrate every tool call.
- If a request is ambiguous (e.g. "add a couch" with no location), make a reasonable choice rather than asking, unless it's truly unclear.
- Match dimensions to the room: scale or skip pieces that cannot fit rather than forcing overlaps.`;

export interface AgentEvent {
  type: "tool_call" | "tool_result" | "text";
  name?: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  text?: string;
}

export interface RunAgentParams {
  provider: Provider;
  apiKey: string;
  model: string;
  history: Turn[];
  userMessage: string;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

function callProvider(provider: Provider) {
  if (provider === "local") return callLocal;
  if (provider === "anthropic") return callAnthropic;
  if (provider === "openai") return callOpenAI;
  return callGemini;
}

const MAX_STEPS = 20;

export async function runAgent({ provider, apiKey, model, history, userMessage, onEvent, signal }: RunAgentParams): Promise<Turn[]> {
  if (provider !== "local" && !apiKey) throw new LLMError(`No API key configured for ${provider}. Add one in Settings.`);
  if (!userMessage.trim() || userMessage.length > 8_000) throw new LLMError("Enter a request of at most 8000 characters.");
  const call = callProvider(provider);
  const turns: Turn[] = [...history, { role: "user", text: userMessage }];
  const initial = useStore.getState();
  const projectId = initial.activeProjectId;
  const roomId = initial.doc.activeRoomId;
  const historyGroup = crypto.randomUUID();
  const scope = new AbortController();
  const activeSignal = signal ? AbortSignal.any([signal, scope.signal]) : scope.signal;
  const unsubscribe = useStore.subscribe((state) => {
    if (state.activeProjectId !== projectId || state.doc.activeRoomId !== roomId) scope.abort();
  });
  // Kessel accepts at most 16 tools. Intent-based placement replaces raw-coordinate creation.
  const tools = provider === "local" ? TOOLS.filter((tool) => tool.name !== "add_item") : TOOLS;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      activeSignal.throwIfAborted();
      const response = await call({ apiKey, model, system: SYSTEM_PROMPT, turns, tools, signal: activeSignal });
      // Re-check after every await. A late response must never edit another design.
      activeSignal.throwIfAborted();
      if (response.toolCalls.length > 20) throw new LLMError("The assistant requested too many changes at once. Try a smaller request.");

      if (response.text) onEvent?.({ type: "text", text: response.text });
      turns.push({ role: "assistant", text: response.text, toolCalls: response.toolCalls });

      if (response.toolCalls.length === 0) return turns;

      const results = initial.withHistoryGroup(historyGroup, () => response.toolCalls.map((tc) => {
        activeSignal.throwIfAborted();
        onEvent?.({ type: "tool_call", name: tc.name, input: tc.input });
        activeSignal.throwIfAborted();
        try {
          const output = executeTool(tc.name, tc.input);
          onEvent?.({ type: "tool_result", name: tc.name, output });
          return { id: tc.id, name: tc.name, output };
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          onEvent?.({ type: "tool_result", name: tc.name, output: message, isError: true });
          return { id: tc.id, name: tc.name, output: message, isError: true };
        }
      }));
      turns.push({ role: "tool", results });
    }

    const limitMessage = "Stopped after 20 steps. Send another request to continue.";
    onEvent?.({ type: "text", text: limitMessage });
    turns.push({ role: "assistant", text: limitMessage, toolCalls: [] });
    return turns;
  } finally { unsubscribe(); }
}
