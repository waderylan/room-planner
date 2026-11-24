import assert from "node:assert/strict";
import { runAgent } from "../src/llm/agent";
import { getLocalStatus } from "../src/llm/providers/local";
import { useStore } from "../src/store/store";
import { roomIssues } from "../src/llm/placement";

// Explicit opt-in integration check. It uses provider quota and edits an isolated
// in-memory document, never the browser's saved designs or provider auth files.
const origin = process.env.ROOM_PLANNER_URL || "http://127.0.0.1:5178";
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const relative = typeof input === "string" && input.startsWith("/");
  return originalFetch(
    relative ? new URL(input, origin) : input,
    relative
      ? { ...init, headers: { ...init?.headers, Origin: origin } }
      : init,
  );
};

const status = await getLocalStatus();
assert.equal(status.available, true, status.reason);
const model =
  process.env.ROOM_PLANNER_MODEL ||
  status.models.find((id) => /sol$/.test(id)) ||
  status.models[0];
assert.ok(status.models.includes(model), "Choose a model returned by Kessel.");
const calls: string[] = [];
useStore.getState().createProject("Local assistant smoke test");
let turns = await runAgent({
  provider: "local",
  apiKey: "",
  model,
  history: [],
  userMessage:
    "Read the room and available presets. Add exactly one desk centered against the north wall. Do not add any other furniture or resize the room. Check the layout and report the result.",
  onEvent(event) {
    if (event.type === "tool_call" && event.name) {
      calls.push(event.name);
      process.stdout.write(`Tool: ${event.name}\n`);
    }
  },
});
const room = useStore.getState().activeRoom();
assert.equal(room.items.length, 1);
assert.match(room.items[0].name, /desk/i);
assert.ok(calls.includes("get_room_state"));
assert.ok(calls.includes("place_item"));
assert.equal(roomIssues(room).overlaps.length, 0);
assert.equal(roomIssues(room).outOfBounds.length, 0);
assert.equal(turns.at(-1)?.role, "assistant");
process.stdout.write(
  `Passed: local Codex (${model}), ${calls.length} tool calls, one in-bounds desk, no overlaps.\n`,
);
const deskId = room.items[0].id;
turns = await runAgent({
  provider: "local",
  apiKey: "",
  model,
  history: turns,
  userMessage:
    "Keep the existing desk. Resize this to a 14 by 12 foot bedroom. Add exactly one queen bed against the south wall and two nightstands, one to each side of the bed. Do not add any other furniture. Check the layout, resolve all overlaps, and report the result.",
  onEvent(event) {
    if (event.type === "tool_call" && event.name)
      process.stdout.write(`Tool: ${event.name}\n`);
  },
});
const bedroom = useStore.getState().activeRoom();
assert.equal(bedroom.items.length, 4);
assert.equal(bedroom.shape.width, 14);
assert.equal(bedroom.shape.length, 12);
assert.ok(
  bedroom.items.some((item) => item.id === deskId),
  "Existing furniture must be preserved.",
);
assert.equal(roomIssues(bedroom).overlaps.length, 0);
assert.equal(roomIssues(bedroom).outOfBounds.length, 0);
process.stdout.write(
  "Passed: furnished bedroom, existing desk preserved, bed and two nightstands, no overlaps.\n",
);
await runAgent({
  provider: "local",
  apiKey: "",
  model,
  history: turns,
  userMessage:
    "Convert this room to meters without changing physical dimensions. Move the existing desk to the east wall, with no overlaps. Change that desk's color to #456789. Do not add or remove any furniture. Check the layout.",
  onEvent(event) {
    if (event.type === "tool_call" && event.name)
      process.stdout.write(`Tool: ${event.name}\n`);
  },
});
const metric = useStore.getState().activeRoom();
assert.equal(metric.unit, "m");
assert.ok(Math.abs(metric.shape.width - 14 * 0.3048) < 1e-6);
assert.equal(metric.items.length, 4);
assert.equal(metric.items.find((item) => item.id === deskId)?.color, "#456789");
assert.equal(roomIssues(metric).overlaps.length, 0);
assert.equal(roomIssues(metric).outOfBounds.length, 0);
process.stdout.write(
  "Passed: metric conversion preserves size; existing desk moved and recolored; no overlaps.\n",
);
globalThis.fetch = originalFetch;
