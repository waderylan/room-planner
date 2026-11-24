import type { Doc } from "../model/types";
import { migrateDoc, safeParseDoc } from "../model/migrate";

export const LIBRARY_KEY = "room-planner:library:v1";
export const LEGACY_DOC_KEY = "room-planner:doc";
export const RECOVERY_KEY = "room-planner:library:recovery";

export interface Project {
  id: string;
  name: string;
  doc: Doc;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLibrary {
  version: 1;
  projects: Project[];
  activeProjectId: string;
}

export type SaveStatus = "saved" | "saving" | "error";

export function validateProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new Error("Invalid design.");
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id || p.id.length > 200 || typeof p.name !== "string" || !p.name.trim()) {
    throw new Error("Invalid design name or identifier.");
  }
  if (typeof p.createdAt !== "string" || !Number.isFinite(Date.parse(p.createdAt)) ||
      typeof p.updatedAt !== "string" || !Number.isFinite(Date.parse(p.updatedAt))) {
    throw new Error("Invalid design dates.");
  }
  return { id: p.id, name: p.name.trim().slice(0, 120), doc: migrateDoc(p.doc), createdAt: p.createdAt, updatedAt: p.updatedAt };
}

export function parseLibrary(raw: string): ProjectLibrary {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects) || parsed.projects.length > 200) {
    throw new Error("Invalid design library.");
  }
  const projects = parsed.projects.map(validateProject);
  if (new Set(projects.map((p) => p.id)).size !== projects.length) throw new Error("Duplicate design identifiers.");
  const activeProjectId = typeof parsed.activeProjectId === "string" && projects.some((p) => p.id === parsed.activeProjectId)
    ? parsed.activeProjectId : projects[0]?.id ?? "";
  return { version: 1, projects, activeProjectId };
}

export interface LoadedLibrary {
  library: ProjectLibrary | null;
  error: string | null;
  raw: string | null;
}

export function loadLibrary(storage: Storage): LoadedLibrary {
  let raw: string | null = null;
  try {
    raw = storage.getItem(LIBRARY_KEY);
    if (raw) return { library: parseLibrary(raw), error: null, raw };
    const legacy = storage.getItem(LEGACY_DOC_KEY);
    if (legacy) {
      const now = new Date().toISOString();
      const project: Project = { id: crypto.randomUUID(), name: "My first design", doc: safeParseDoc(legacy), createdAt: now, updatedAt: now };
      return { library: { version: 1, projects: [project], activeProjectId: project.id }, error: null, raw };
    }
    return { library: null, error: null, raw };
  } catch {
    // Retain the unreadable library rather than destroying the user's only copy.
    try { if (raw) storage.setItem(RECOVERY_KEY, raw); } catch { /* Storage may be unavailable. */ }
    return { library: null, error: "Saved designs could not be read. Export your current work before closing.", raw };
  }
}

/** An explicit flush is used on project changes, pagehide, and hidden visibility. */
export function createLibraryPersistence(
  getStorage: () => Storage,
  onStatus: (status: SaveStatus, error: string | null) => void,
  initialRaw: string | null,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ProjectLibrary | null = null;
  let previousRaw = initialRaw;
  let checkedRecovery = false;

  function flush(): boolean {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return true;
    try {
      const storage = getStorage();
      if (storage.getItem(LIBRARY_KEY) !== previousRaw) {
        onStatus("error", "Designs changed in another tab. Export your current work, then reload.");
        return false;
      }
      if (!checkedRecovery && previousRaw) {
        let unreadable = false;
        try { parseLibrary(previousRaw); } catch { unreadable = true; }
        // A failed recovery write must not destroy the only copy of unreadable designs.
        if (unreadable) storage.setItem(RECOVERY_KEY, previousRaw);
        checkedRecovery = true;
      }
      const serialized = JSON.stringify(pending);
      storage.setItem(LIBRARY_KEY, serialized);
      previousRaw = serialized;
      pending = null;
      onStatus("saved", null);
      return true;
    } catch {
      onStatus("error", "Designs could not be saved on this device. Export a backup before closing.");
      return false;
    }
  }

  return {
    schedule(library: ProjectLibrary, delay = 350) {
      pending = library;
      if (timer) clearTimeout(timer);
      onStatus("saving", null);
      timer = setTimeout(flush, delay);
    },
    flush,
  };
}
