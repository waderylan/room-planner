import assert from "node:assert/strict";
import { test } from "node:test";

const values = new Map<string, string>([["room-planner:llm-settings", JSON.stringify({ provider: "openai", models: { openai: "custom-model" }, apiKeys: { openai: "legacy-secret" } })]]);
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem(key: string) { return values.get(key) ?? null; },
  setItem(key: string, value: string) { values.set(key, value); },
} });
const { useSettingsStore } = await import("../../src/store/settingsStore");

test("legacy stored keys are removed and never restored", () => {
  assert.equal(useSettingsStore.getState().apiKeys.openai, "");
  assert.equal(useSettingsStore.getState().provider, "openai");
  assert.equal(useSettingsStore.getState().models.openai, "custom-model");
  assert.doesNotMatch(values.get("room-planner:llm-settings")!, /legacy-secret|apiKeys/);
});

test("new API keys stay only in memory when preferences change", () => {
  useSettingsStore.getState().setApiKey("openai", "memory-only-secret");
  useSettingsStore.getState().setModel("openai", "other-model");
  useSettingsStore.getState().setProvider("openai");
  assert.equal(useSettingsStore.getState().apiKeys.openai, "memory-only-secret");
  assert.doesNotMatch([...values.values()].join(""), /memory-only-secret|apiKeys/);
});
