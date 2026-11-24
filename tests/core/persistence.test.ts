import assert from "node:assert/strict";
import { test } from "node:test";
import { createDoc } from "../../src/model/factory";
import { createLibraryPersistence, loadLibrary, parseLibrary, LIBRARY_KEY, LEGACY_DOC_KEY, RECOVERY_KEY, type ProjectLibrary, type SaveStatus } from "../../src/store/persistence";

export class MemoryStorage implements Storage {
  values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
}

function fixture(): ProjectLibrary {
  const now = new Date().toISOString();
  return { version: 1, activeProjectId: "first", projects: [{ id: "first", name: "Living room", doc: createDoc(), createdAt: now, updatedAt: now }] };
}

test("legacy autosave migrates without deleting the original", () => {
  const storage = new MemoryStorage();
  const doc = createDoc();
  storage.setItem(LEGACY_DOC_KEY, JSON.stringify(doc));
  const loaded = loadLibrary(storage);
  assert.equal(loaded.error, null);
  assert.equal(loaded.library?.projects[0].name, "My first design");
  assert.deepEqual(loaded.library?.projects[0].doc, doc);
  assert.ok(storage.getItem(LEGACY_DOC_KEY));
});

test("an intentionally empty library stays empty instead of resurrecting legacy work", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_DOC_KEY, JSON.stringify(createDoc()));
  storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, projects: [], activeProjectId: "" }));
  const loaded = loadLibrary(storage);
  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.library?.projects, []);
  assert.equal(loaded.library?.activeProjectId, "");
});

test("unreadable library retains a recovery copy and exposes an error", () => {
  const storage = new MemoryStorage();
  storage.setItem(LIBRARY_KEY, '{"version":');
  const loaded = loadLibrary(storage);
  assert.ok(loaded.error);
  assert.equal(loaded.library, null);
  assert.equal(storage.getItem(RECOVERY_KEY), '{"version":');
  assert.equal(storage.getItem(LIBRARY_KEY), '{"version":');
});

test("flush writes the newest pending document immediately", () => {
  const storage = new MemoryStorage();
  const status: SaveStatus[] = [];
  const writer = createLibraryPersistence(() => storage, (value) => status.push(value), null);
  const library = fixture();
  writer.schedule(library, 60_000);
  writer.schedule({ ...library, projects: [{ ...library.projects[0], name: "Newest design" }] }, 60_000);
  assert.equal(writer.flush(), true);
  assert.equal(parseLibrary(storage.getItem(LIBRARY_KEY)!).projects[0].name, "Newest design");
  assert.equal(status.at(-1), "saved");
});

test("failed writes expose a durable error and can retry the same pending save", () => {
  const storage = new MemoryStorage();
  const states: { status: SaveStatus; error: string | null }[] = [];
  const writer = createLibraryPersistence(() => storage, (status, error) => states.push({ status, error }), null);
  const library = fixture();
  storage.failWrites = true;
  writer.schedule(library, 60_000);
  assert.equal(writer.flush(), false);
  assert.equal(states.at(-1)?.status, "error");
  assert.match(states.at(-1)?.error ?? "", /backup/);
  storage.failWrites = false;
  assert.equal(writer.flush(), true);
  assert.equal(states.at(-1)?.status, "saved");
  assert.equal(parseLibrary(storage.getItem(LIBRARY_KEY)!).projects[0].id, "first");
});

test("a stale tab cannot overwrite another tab's saved library", () => {
  const storage = new MemoryStorage();
  let error: string | null = null;
  const writer = createLibraryPersistence(() => storage, (_, message) => { error = message; }, null);
  writer.schedule(fixture(), 60_000);
  const external = JSON.stringify({ ...fixture(), activeProjectId: "external" });
  storage.setItem(LIBRARY_KEY, external);
  assert.equal(writer.flush(), false);
  assert.match(error ?? "", /another tab/);
  assert.equal(storage.getItem(LIBRARY_KEY), external);
});
