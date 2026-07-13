import type { Doc } from "../model/types";
import { safeParseDoc } from "../model/migrate";

const STORAGE_KEY = "room-planner:doc";

export function loadPersistedDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return safeParseDoc(raw);
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function persistDocDebounced(doc: Doc, delay = 400): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      // storage full / unavailable: silently skip autosave
    }
  }, delay);
}
