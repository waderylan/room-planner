import assert from "node:assert/strict";
import { after, test } from "node:test";
import { runAgent } from "../../src/llm/agent";
import { executeTool } from "../../src/llm/toolExecutor";
import { validateToolInput } from "../../src/llm/validation";
import { callGemini } from "../../src/llm/providers/gemini";
import { providerRequest } from "../../src/llm/providers/request";
import { TOOLS } from "../../src/llm/tools";
import { useStore } from "../../src/store/store";

const fetchOriginal = globalThis.fetch;
after(() => { globalThis.fetch = fetchOriginal; });
const response = (message: unknown) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
const params = { provider: "openai" as const, apiKey: "test-only-key", model: "test-model", history: [], userMessage: "Add one desk" };

test("invalid model tool arguments fail before changing the document", () => {
  useStore.getState().createProject("Validation");
  const before = JSON.stringify(useStore.getState().doc);
  for (const [tool, input] of [
    ["add_item", { presetId: "desk", width: -1 }],
    ["add_item", { presetId: "desk", width: 0.00001 }],
    ["add_item", { presetId: "desk", name: "x".repeat(201) }],
    ["add_item", { presetId: "desk", height: Infinity }],
    ["add_item", { presetId: "desk", color: "url(example.com)" }],
    ["set_room_unit", { unit: "yards" }],
    ["set_room_shape", { kind: "circle", width: 10, length: 10 }],
    ["add_opening", { kind: "door", wallIndex: 1.5, offset: 0, width: 3, height: 7, sillHeight: 0 }],
    ["place_item", { presetId: "desk", placement: "wall", wall: "up" }],
    ["place_item", { presetId: "desk", placement: "beside", ref: "missing", side: "e" }],
  ] as const) {
    assert.throws(() => executeTool(tool, input));
    assert.equal(JSON.stringify(useStore.getState().doc), before);
  }
  assert.throws(() => validateToolInput("clear_items", []));
  assert.throws(() => validateToolInput("get_room_state", { typo: true }));
});

test("store validation failures are reported back to the assistant", () => {
  useStore.getState().createProject("Conversion limit");
  executeTool("set_room_shape", { kind: "rect", width: 0.2, length: 0.2 });
  assert.throws(() => executeTool("set_room_unit", { unit: "m" }), /room width/);
  assert.equal(useStore.getState().activeRoom().unit, "ft");
});

test("removing stale furniture identifiers reports an error", () => {
  assert.throws(() => executeTool("remove_item", { id: "missing" }), /no longer exists/);
});

test("preset dimensions returned to the assistant follow the active room unit", () => {
  useStore.getState().createProject("Metric");
  useStore.getState().setRoomUnit("m");
  const presets = executeTool("list_presets", {}) as { id: string; footprint: { w: number } }[];
  assert.ok(Math.abs(presets.find((preset) => preset.id === "desk")!.footprint.w - 4.5 * 0.3048) < 1e-9);
});

test("the agent executes tools then returns their results to the provider", async () => {
  useStore.getState().createProject("Tool loop");
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    const body = JSON.parse(init!.body as string);
    if (requests === 1) return response({ role: "assistant", content: "", tool_calls: [{ id: "desk-call", type: "function", function: { name: "place_item", arguments: JSON.stringify({ presetId: "desk", placement: "wall", wall: "n" }) } }] });
    assert.equal(body.messages.at(-1).role, "tool");
    assert.equal(body.messages.at(-1).tool_call_id, "desk-call");
    return response({ role: "assistant", content: "Desk placed." });
  };
  const turns = await runAgent(params);
  assert.equal(requests, 2);
  assert.equal(useStore.getState().activeRoom().items.length, 1);
  assert.equal(turns.at(-1)?.role, "assistant");
  assert.equal(useStore.getState().historyPast.length, 1, "All assistant mutations form one undo step.");
  useStore.getState().undo();
  assert.equal(useStore.getState().activeRoom().items.length, 0);
});

test("late provider responses cannot edit a different design", async () => {
  const first = useStore.getState().createProject("Original");
  let release!: (response: Response) => void;
  globalThis.fetch = async () => new Promise<Response>((resolve) => { release = resolve; });
  const pending = runAgent(params);
  const other = useStore.getState().createProject("Other");
  release(response({ role: "assistant", content: "", tool_calls: [{ id: "late", type: "function", function: { name: "add_item", arguments: '{"presetId":"desk"}' } }] }));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(useStore.getState().activeProjectId, other);
  assert.equal(useStore.getState().activeRoom().items.length, 0);
  assert.equal(useStore.getState().projects.find((project) => project.id === first)!.doc.rooms[0].items.length, 0);
});

test("switching away and back still cancels an in-flight agent", async () => {
  const first = useStore.getState().createProject("Original again");
  let release!: (response: Response) => void;
  globalThis.fetch = async () => new Promise<Response>((resolve) => { release = resolve; });
  const pending = runAgent(params);
  useStore.getState().createProject("Temporary");
  useStore.getState().openProject(first);
  release(response({ role: "assistant", content: "Late reply" }));
  await assert.rejects(pending, { name: "AbortError" });
});

test("a stopped agent makes no provider request", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ content: "" }); };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runAgent({ ...params, signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("provider errors never surface response bodies containing credentials", async () => {
  globalThis.fetch = async () => new Response("secret-response-must-stay-private", { status: 401 });
  await assert.rejects(providerRequest("Test", "https://example.com", {}), (error: Error) => {
    assert.match(error.message, /Check your API key/);
    assert.doesNotMatch(error.message, /secret-response/);
    return true;
  });
});

test("Gemini sends its key in a header and preserves function thought signatures", async () => {
  globalThis.fetch = async (url, init) => {
    assert.doesNotMatch(String(url), /test-gemini-key/);
    assert.equal((init!.headers as Record<string, string>)["x-goog-api-key"], "test-gemini-key");
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "get_room_state", args: {} }, thoughtSignature: "signature" }] } }] }));
  };
  const result = await callGemini({ apiKey: "test-gemini-key", model: "test-model", system: "test", turns: [], tools: [] });
  assert.equal(result.toolCalls[0].thoughtSignature, "signature");
});

test("local Codex requests stay within Kessel's 16-tool limit", async () => {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    assert.ok(body.tools.length > 0 && body.tools.length <= 16);
    assert.ok(body.tools.some((tool: { function: { name: string } }) => tool.function.name === "place_item"));
    assert.equal((init!.headers as Record<string, string>)["authorization"], undefined);
    return response({ role: "assistant", content: "Ready." });
  };
  assert.ok(TOOLS.length > 16);
  await runAgent({ ...params, provider: "local", apiKey: "" });
});
