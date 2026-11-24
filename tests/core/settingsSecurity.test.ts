import assert from "node:assert/strict";
import { test } from "node:test";

const key = "room-planner:llm-settings";
const values = new Map([[key, '{"apiKeys":{"openai":"legacy-secret"},']]);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(name: string) { return values.get(name) ?? null; },
    setItem(name: string, value: string) { values.set(name, value); },
    removeItem(name: string) { values.delete(name); },
  },
});
const { useSettingsStore } = await import("../../src/store/settingsStore");

test("unreadable legacy assistant preferences cannot leave stored API keys behind", () => {
  assert.equal(values.has(key), false);
  assert.equal(useSettingsStore.getState().apiKeys.openai, "");
  assert.doesNotMatch([...values.values()].join(""), /legacy-secret/);
});
