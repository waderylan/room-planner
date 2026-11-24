import assert from "node:assert/strict";
import { test } from "node:test";
import { createDoc } from "../../src/model/factory";
import { LEGACY_DOC_KEY, LIBRARY_KEY, loadLibrary } from "../../src/store/persistence";

const original = JSON.stringify(createDoc());
const values = new Map<string, string>([[LEGACY_DOC_KEY, original]]);
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

test("the legacy migration is persisted before editing so reload preserves its project id", () => {
  assert.ok(storage.getItem(LIBRARY_KEY));
  assert.equal(storage.getItem(LEGACY_DOC_KEY), original);
  const loaded = loadLibrary(storage);
  assert.equal(loaded.library?.activeProjectId, useStore.getState().activeProjectId);
  assert.equal(loaded.library?.projects[0].name, "My first design");
});
