import { create } from "zustand";
import type { Provider } from "../llm/types";

const STORAGE_KEY = "room-planner:llm-settings";

export const DEFAULT_MODELS: Record<Provider, string> = {
  local: "default",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-2.5-pro",
};

interface PersistedSettings {
  provider: Provider;
  models: Record<Provider, string>;
}

interface SettingsState extends PersistedSettings {
  apiKeys: Record<Provider, string>;
  setProvider: (p: Provider) => void;
  setModel: (p: Provider, model: string) => void;
  setApiKey: (p: Provider, key: string) => void;
}

function loadPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      const models = { ...DEFAULT_MODELS };
      for (const p of ["local", "anthropic", "openai", "gemini"] as const) {
        const model = parsed?.models?.[p];
        if (typeof model === "string" && model.trim() && model.length <= 200) models[p] = model;
      }
      const provider = parsed?.provider === "openai" || parsed?.provider === "gemini" || parsed?.provider === "anthropic" ? parsed.provider : defaultProvider();
      const safe = { provider, models } as PersistedSettings;
      // Remove API keys persisted by older versions. Never restore a secret into memory.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return safe;
    }
  } catch {
    // Even unreadable legacy preferences may contain an API key. Never retain a recovery copy.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
  }
  return { provider: defaultProvider(), models: { ...DEFAULT_MODELS } };
}

function defaultProvider(): Provider { return import.meta.env?.DEV ? "local" : "anthropic"; }

function persist(state: PersistedSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: state.provider, models: state.models }));
  } catch {
    /* ignore quota errors */
  }
}

export const useSettingsStore = create<SettingsState>()((set, get) => {
  const initial = loadPersisted();
  return {
    ...initial,
    apiKeys: { local: "", anthropic: "", openai: "", gemini: "" },
    setProvider: (p) => {
      set({ provider: p });
      persist({ provider: p, models: get().models });
    },
    setModel: (p, model) => {
      const models = { ...get().models, [p]: model };
      set({ models });
      persist({ provider: get().provider, models });
    },
    setApiKey: (p, key) => {
      const apiKeys = { ...get().apiKeys, [p]: key };
      set({ apiKeys });
    },
  };
});
