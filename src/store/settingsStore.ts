import { create } from "zustand";
import type { Provider } from "../llm/types";

const STORAGE_KEY = "room-planner:llm-settings";

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o",
  gemini: "gemini-2.5-pro",
};

interface PersistedSettings {
  provider: Provider;
  models: Record<Provider, string>;
  apiKeys: Record<Provider, string>;
}

interface SettingsState extends PersistedSettings {
  setProvider: (p: Provider) => void;
  setModel: (p: Provider, model: string) => void;
  setApiKey: (p: Provider, key: string) => void;
}

function loadPersisted(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
      return {
        provider: parsed.provider ?? "anthropic",
        models: { ...DEFAULT_MODELS, ...parsed.models },
        apiKeys: { anthropic: "", openai: "", gemini: "", ...parsed.apiKeys },
      };
    }
  } catch {
    /* ignore malformed storage */
  }
  return { provider: "anthropic", models: { ...DEFAULT_MODELS }, apiKeys: { anthropic: "", openai: "", gemini: "" } };
}

function persist(state: PersistedSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export const useSettingsStore = create<SettingsState>()((set, get) => {
  const initial = loadPersisted();
  return {
    ...initial,
    setProvider: (p) => {
      set({ provider: p });
      persist({ provider: p, models: get().models, apiKeys: get().apiKeys });
    },
    setModel: (p, model) => {
      const models = { ...get().models, [p]: model };
      set({ models });
      persist({ provider: get().provider, models, apiKeys: get().apiKeys });
    },
    setApiKey: (p, key) => {
      const apiKeys = { ...get().apiKeys, [p]: key };
      set({ apiKeys });
      persist({ provider: get().provider, models: get().models, apiKeys });
    },
  };
});
