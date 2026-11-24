import assert from "node:assert/strict";
import { test } from "node:test";
import { readChatSession, saveChatSession, stoppedChatSession, type ChatSession } from "../../src/components/Chat/sessions";

test("conversation and draft survive closing and reopening the same room", () => {
  const scope = "project-a/room-a";
  const session: ChatSession = {
    entries: [{ id: "reply", kind: "assistant", text: "Desk placed." }],
    turns: [{ role: "user", text: "Add a desk" }],
    draft: "Move it to the east wall",
    historyContext: '["local","model"]',
  };
  saveChatSession(scope, session);
  assert.deepEqual(readChatSession(scope), session);
  assert.deepEqual(readChatSession("project-a/room-b").entries, []);
  assert.equal(readChatSession("project-b/room-a").draft, "");
});

test("stopping retains the submitted request for retry and clears partial provider history", () => {
  const stopped = stoppedChatSession({ entries: [], turns: [{ role: "user", text: "Previous request" }], draft: "", historyContext: "old-model" }, "Add a sofa");
  assert.equal(stopped.draft, "Add a sofa");
  assert.deepEqual(stopped.turns, []);
  assert.equal(stopped.historyContext, null);
  assert.equal(stopped.entries.at(-1)?.text, "Stopped");
});

test("stopping preserves a new draft typed while the request was running", () => {
  const stopped = stoppedChatSession({ entries: [], turns: [], draft: "Change the sofa color", historyContext: null }, "Add a sofa");
  assert.equal(stopped.draft, "Change the sofa color");
});

test("oldest room conversations are evicted without growing tab memory indefinitely", () => {
  saveChatSession("oldest-conversation", { entries: [], turns: [], draft: "Old", historyContext: null });
  for (let index = 0; index < 50; index++) saveChatSession(`bounded-${index}`, { entries: [], turns: [], draft: String(index), historyContext: null });
  assert.equal(readChatSession("oldest-conversation").draft, "");
  assert.equal(readChatSession("bounded-49").draft, "49");
});
