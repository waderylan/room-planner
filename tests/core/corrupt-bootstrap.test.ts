import assert from "node:assert/strict";
import { test } from "node:test";
import { LIBRARY_KEY, RECOVERY_KEY } from "../../src/store/persistence";

const damaged = '{"version":';
const values = new Map<string, string>([[LIBRARY_KEY, damaged]]);
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

test("application bootstrap preserves corrupted storage and keeps the recovery error visible", async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(storage.getItem(LIBRARY_KEY), damaged);
  assert.equal(storage.getItem(RECOVERY_KEY), damaged);
  assert.equal(useStore.getState().saveStatus, "error");
  assert.match(useStore.getState().saveError ?? "", /could not be read/);
});
