import assert from "node:assert/strict";
import { test } from "node:test";
import { createDoc } from "../../src/model/factory";
import { FURNITURE_PRESETS } from "../../src/model/presets";
import { LIBRARY_KEY, parseLibrary } from "../../src/store/persistence";

const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key) { return values.get(key) ?? null; },
  key(index) { return [...values.keys()][index] ?? null; },
  removeItem(key) { values.delete(key); },
  setItem(key, value) { values.set(key, value); },
};
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
const { useStore } = await import("../../src/store/store");
const store = () => useStore.getState();

test("a fresh workspace persists an empty library without a phantom saved design", () => {
  const persisted = parseLibrary(storage.getItem(LIBRARY_KEY)!);
  assert.equal(persisted.activeProjectId, "");
  assert.deepEqual(persisted.projects, []);
  assert.deepEqual(store().projects, []);
  assert.equal(store().activeRoom().name, "Room 1");
  assert.equal(store().saveStatus, "saved");
});

test("design switching flushes pending edits without mixing documents", () => {
  const first = store().createProject("First");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const sofaId = store().activeRoom().items[0].id;
  const second = store().createProject("Second");
  assert.equal(store().activeRoom().items.length, 0);
  store().openProject(first);
  assert.equal(store().activeRoom().items[0].id, sofaId);
  assert.equal(store().activeProjectId, first);
  const persisted = parseLibrary(storage.getItem(LIBRARY_KEY)!);
  assert.equal(persisted.activeProjectId, first);
  assert.equal(persisted.projects.find((p) => p.id === first)?.doc.rooms[0].items.length, 1);
  assert.equal(persisted.projects.find((p) => p.id === second)?.doc.rooms[0].items.length, 0);
});

test("undo and redo restore geometry; selection does not consume history", () => {
  store().createProject("History");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const item = store().activeRoom().items[0];
  const original = { ...item.pos };
  store().selectItem(null);
  store().selectItem(item.id);
  assert.equal(store().historyPast.length, 1);
  store().moveItem(item.id, { x: 2, y: 2 });
  store().undo();
  assert.deepEqual(store().activeRoom().items[0].pos, original);
  store().redo();
  assert.deepEqual(store().activeRoom().items[0].pos, { x: 2, y: 2 });
  store().undo();
  store().rotateItem(item.id, 90);
  assert.equal(store().historyFuture.length, 0);
  store().flushSave();
});

test("one synchronous tool batch and delayed subsequent batches share an undo step", (context) => {
  let clock = 1000;
  context.mock.method(Date, "now", () => clock);
  store().createProject("Grouped tools");
  const result = store().withHistoryGroup("assistant-run", () => {
    store().addItemFromPreset(FURNITURE_PRESETS[0]);
    const id = store().activeRoom().items[0].id;
    store().rotateItem(id, 90);
    return id;
  });
  clock += 2000;
  store().withHistoryGroup("assistant-run", () => store().moveItem(result, { x: 2, y: 2 }));
  assert.equal(store().historyPast.length, 1);
  store().undo();
  assert.equal(store().activeRoom().items.length, 0);
  store().redo();
  assert.equal(store().activeRoom().items[0].rotDeg, 90);
  store().flushSave();
});

test("manual edits between assistant batches retain their own undo boundary", () => {
  store().createProject("Interleaved edits");
  store().withHistoryGroup("assistant-run", () => store().addItemFromPreset(FURNITURE_PRESETS[0]));
  const item = store().activeRoom().items[0];
  store().rotateItem(item.id, 90);
  const manualPosition = { ...store().activeRoom().items[0].pos };
  store().withHistoryGroup("assistant-run", () => store().updateItem(item.id, { name: "Assistant rename" }));
  assert.equal(store().historyPast.length, 3);
  store().undo();
  assert.equal(store().activeRoom().items[0].name, item.name);
  assert.equal(store().activeRoom().items[0].rotDeg, 90);
  assert.deepEqual(store().activeRoom().items[0].pos, manualPosition);
  store().undo();
  assert.equal(store().activeRoom().items[0].rotDeg, 0);
  store().undo();
  assert.equal(store().activeRoom().items.length, 0);
  store().flushSave();
});

test("a failed grouped callback releases its scope before the next manual edit", () => {
  store().createProject("Failed grouped tools");
  assert.throws(() => store().withHistoryGroup("failed-run", () => {
    store().addItemFromPreset(FURNITURE_PRESETS[0]);
    throw new Error("Tool error");
  }));
  const id = store().activeRoom().items[0].id;
  store().rotateItem(id, 90);
  assert.equal(store().historyPast.length, 2);
  store().undo();
  assert.equal(store().activeRoom().items[0].rotDeg, 0);
  store().flushSave();
});

test("unit conversion is undoable and restores matching grid snap", () => {
  store().createProject("Units");
  const width = store().activeRoom().shape.width;
  store().setRoomUnit("m");
  assert.equal(store().activeRoom().unit, "m");
  assert.equal(store().snapStep, 0.1);
  store().undo();
  assert.equal(store().activeRoom().unit, "ft");
  assert.equal(store().activeRoom().shape.width, width);
  assert.equal(store().snapStep, 0.25);
  store().flushSave();
});

test("history is bounded and opening a different design clears it", () => {
  const first = store().createProject("Bounded history");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const id = store().activeRoom().items[0].id;
  for (let n = 0; n < 100; n++) store().rotateItem(id, n * 15);
  assert.equal(store().historyPast.length, 80);
  store().createProject("Other design");
  store().openProject(first);
  assert.equal(store().historyPast.length, 0);
  assert.equal(store().historyFuture.length, 0);
});

test("duplicate designs stay independent; deletion keeps a valid active design", () => {
  const first = store().createProject("Original");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const second = store().duplicateProject(first)!;
  assert.equal(store().activeProjectId, first);
  store().openProject(second);
  const id = store().activeRoom().items[0].id;
  store().deleteItem(id);
  store().openProject(first);
  assert.equal(store().activeRoom().items.length, 1);
  store().deleteProject(first);
  assert.ok(store().projects.some((p) => p.id === store().activeProjectId));
  assert.ok(store().projects.some((p) => p.id === second));
  assert.ok(store().activeRoom());
});

test("library duplication and inactive deletion preserve the active document and undo history", () => {
  const first = store().createProject("Active design");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const doc = store().doc;
  const history = store().historyPast;
  const copy = store().duplicateProject(first)!;
  assert.equal(store().activeProjectId, first);
  assert.equal(store().doc, doc);
  assert.equal(store().historyPast, history);
  store().deleteProject(copy);
  assert.equal(store().activeProjectId, first);
  assert.equal(store().doc, doc);
  assert.equal(store().historyPast, history);
  store().undo();
  assert.equal(store().activeRoom().items.length, 0);
  store().flushSave();
});

test("new designs, imports and repeated copies receive distinct default names", () => {
  const first = store().createProject("Living room");
  const second = store().createProject("Living room");
  assert.equal(store().projects.find((p) => p.id === second)?.name, "Living room 2");
  const copy = store().duplicateProject(first)!;
  const otherCopy = store().duplicateProject(first)!;
  assert.equal(store().projects.find((p) => p.id === copy)?.name, "Living room copy");
  assert.equal(store().projects.find((p) => p.id === otherCopy)?.name, "Living room copy 2");
  store().importProject(JSON.stringify(createDoc()), "Living room");
  assert.equal(store().projects.find((p) => p.id === store().activeProjectId)?.name, "Living room 3");
});

test("reselecting an existing item opens Selection without changing the document or history", () => {
  store().createProject("Sidebar selection");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const item = store().activeRoom().items[0];
  assert.equal(store().sidebarTab, "furniture");
  const doc = store().doc;
  const history = store().historyPast;
  store().selectItem(item.id);
  assert.equal(store().sidebarTab, "selection");
  assert.equal(store().doc, doc);
  assert.equal(store().historyPast, history);
  store().selectItem(null);
  assert.equal(store().sidebarTab, "furniture");
  store().setSidebarTab("room");
  store().selectItem(null);
  assert.equal(store().sidebarTab, "room");
  store().openProject(store().activeProjectId);
  assert.equal(store().sidebarTab, "furniture");
  store().flushSave();
});

test("mobile tools and assistant drawers are mutually exclusive without changing saved work", () => {
  store().createProject("Drawer state");
  const doc = store().doc;
  const history = store().historyPast;
  store().setChatOpen(true);
  assert.equal(store().chatOpen, true);
  assert.equal(store().sidebarOpen, false);
  store().setSidebarOpen(true);
  assert.equal(store().sidebarOpen, true);
  assert.equal(store().chatOpen, false);
  store().setChatOpen(true);
  assert.equal(store().chatOpen, true);
  assert.equal(store().sidebarOpen, false);
  assert.equal(store().doc, doc);
  assert.equal(store().historyPast, history);
  store().setChatOpen(false);
});

test("new rooms inherit units and receive unique names after a room is removed", () => {
  store().createProject("Metric rooms");
  store().setRoomUnit("m");
  store().addRoom();
  assert.equal(store().activeRoom().unit, "m");
  assert.equal(store().activeRoom().name, "Room 2");
  const second = store().activeRoom().id;
  store().addRoom();
  assert.equal(store().activeRoom().name, "Room 3");
  store().deleteRoom(second);
  store().addRoom();
  assert.equal(store().activeRoom().name, "Room 2");
  assert.equal(new Set(store().doc.rooms.map((room) => room.name)).size, store().doc.rooms.length);
  store().flushSave();
});

test("unchanged move, rotation and name commits preserve geometry and undo history", () => {
  const project = store().createProject("Unchanged commits");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const id = store().activeRoom().items[0].id;
  store().updateItem(id, { pos: { x: 1.13, y: 1.13 } });
  const doc = store().doc;
  const history = store().historyPast;
  const projects = store().projects;
  store().moveItem(id, { x: 1.13, y: 1.13 });
  store().rotateItem(id, 360);
  store().renameRoom(store().activeRoom().id, store().activeRoom().name);
  store().renameProject(project, "Unchanged commits");
  assert.equal(store().doc, doc);
  assert.equal(store().historyPast, history);
  assert.equal(store().projects, projects);
  assert.deepEqual(store().activeRoom().items[0].pos, { x: 1.13, y: 1.13 });
  store().updateItem(id, { pos: { x: 1, y: 1 } });
  const snappedDoc = store().doc;
  store().moveItem(id, { x: 1.05, y: 1.05 });
  assert.equal(store().doc, snappedDoc);
  store().flushSave();
});

test("file imports create an independent design and failed imports preserve current work", () => {
  store().createProject("Existing work");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const first = store().activeProjectId;
  const count = store().projects.length;
  assert.equal(store().importProject(JSON.stringify(createDoc()), "Imported room"), true);
  assert.equal(store().projects.length, count + 1);
  assert.notEqual(store().activeProjectId, first);
  assert.equal(store().projects.find((p) => p.id === first)?.doc.rooms[0].items.length, 1);
  const before = store().doc;
  assert.equal(store().importProject('{"rooms":[null]}'), false);
  assert.equal(store().doc, before);
});

test("position and shape edits reject nonfinite numbers before persistence", () => {
  store().createProject("Validation");
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  const item = store().activeRoom().items[0];
  store().updateItem(item.id, { pos: { x: NaN, y: 0 } });
  assert.deepEqual(store().activeRoom().items[0].pos, item.pos);
  store().setRoomShape({ kind: "rect", width: Infinity, length: 10 });
  assert.equal(store().activeRoom().shape.width, 12);
  store().updateItem(item.id, { pos: { x: -50, y: -50 } });
  assert.ok(store().activeRoom().items[0].pos.x >= 0);
  assert.ok(store().activeRoom().items[0].pos.y >= 0);
  assert.equal(store().flushSave(), true);
  assert.ok(parseLibrary(storage.getItem(LIBRARY_KEY)!));
});

test("deleting the final design leaves a durable empty library", () => {
  for (const project of [...store().projects]) store().deleteProject(project.id);
  assert.deepEqual(store().projects, []);
  assert.equal(store().activeProjectId, "");
  assert.equal(store().historyPast.length, 0);
  const restored = parseLibrary(storage.getItem(LIBRARY_KEY)!);
  assert.deepEqual(restored.projects, []);
  assert.equal(restored.activeProjectId, "");
  // Editor mutations cannot accidentally save the internal scratch document.
  store().addItemFromPreset(FURNITURE_PRESETS[0]);
  assert.equal(store().activeRoom().items.length, 0);
  assert.equal(store().projects.length, 0);
});
