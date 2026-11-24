interface ShareAccess {
  ownerKey?: string;
  participantKey?: string;
  participantName?: string;
}

const STORAGE_KEY = "room-planner:share-access:v1";
const memory = new Map<string, ShareAccess>();
const keyPattern = /^[a-f0-9]{64}$/;

export function readShareAccess(id: string): ShareAccess {
  if (memory.has(id)) return memory.get(id)!;
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<
      string,
      ShareAccess
    >;
    const entry = raw[id];
    if (entry && typeof entry === "object") {
      const safe: ShareAccess = {
        ...(typeof entry.ownerKey === "string" &&
        keyPattern.test(entry.ownerKey)
          ? { ownerKey: entry.ownerKey }
          : {}),
        ...(typeof entry.participantKey === "string" &&
        keyPattern.test(entry.participantKey)
          ? { participantKey: entry.participantKey }
          : {}),
        ...(typeof entry.participantName === "string"
          ? { participantName: entry.participantName.slice(0, 40) }
          : {}),
      };
      memory.set(id, safe);
      return safe;
    }
  } catch {
    /* Access remains usable in memory if device storage is unavailable. */
  }
  return {};
}

/** False means the capability is available in this tab but could not be saved to this device. */
export function rememberShareAccess(id: string, patch: ShareAccess): boolean {
  const next = { ...readShareAccess(id), ...patch };
  memory.set(id, next);
  try {
    let existing: Record<string, ShareAccess> = {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
          existing = parsed as Record<string, ShareAccess>;
        else throw new Error();
      } catch {
        localStorage.setItem(`${STORAGE_KEY}:recovery`, raw);
      }
    }
    delete existing[id];
    const entries = [...Object.entries(existing).slice(-99), [id, next]];
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(entries)),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearParticipant(id: string) {
  const current = readShareAccess(id);
  memory.set(id, { ownerKey: current.ownerKey });
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}",
    ) as Record<string, ShareAccess>;
    stored[id] = { ownerKey: current.ownerKey };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* A new invitation identity can still be used for this tab. */
  }
}

export function shareUrl(id: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `share/${id}`;
  return url.href;
}
