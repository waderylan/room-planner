import assert from "node:assert/strict";
import { test } from "node:test";
import { readBoundedJson } from "../../src/lib/boundedJson";
import { BodyLimitError } from "../../src/lib/boundedText";
import { providerRequest } from "../../src/llm/providers/request";
import { createDoc } from "../../src/model/factory";
import { migrateDoc } from "../../src/model/migrate";
import { createFloorPlanSvg } from "../../src/lib/floorPlan";
import {
  createLibraryPersistence,
  LIBRARY_KEY,
  RECOVERY_KEY,
  type ProjectLibrary,
} from "../../src/store/persistence";

test("JSON readers bound actual streamed bytes even when Content-Length lies", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"name":"'));
        controller.enqueue(new TextEncoder().encode("é".repeat(20)));
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-length": "1" } },
  );
  await assert.rejects(readBoundedJson(response, 30), BodyLimitError);
  assert.equal(cancelled, true);
});

test("JSON readers reject oversized declared responses before reading them", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-length": "2000001" } },
  );
  await assert.rejects(readBoundedJson(response, 2_000_000), BodyLimitError);
  assert.equal(cancelled, true);
});

test("JSON readers cancel stalled response bodies when the request is aborted", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  );
  const timer = setTimeout(() => controller.abort(), 5);
  try {
    await assert.rejects(readBoundedJson(response, 100, controller.signal), {
      name: "AbortError",
    });
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(timer);
  }
});

test("provider calls reject redirects and omit browser credentials and referrers", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      assert.equal(init?.redirect, "error");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.cache, "no-store");
      assert.equal(init?.referrerPolicy, "no-referrer");
      return new Response('{"ok":true}');
    },
  );
  assert.deepEqual(
    await providerRequest("Test", "https://provider.example", {
      redirect: "follow",
      credentials: "include",
    }),
    { ok: true },
  );
});

test("oversized provider responses expose no upstream data or credentials", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("private-key-contents".repeat(120_000)),
  );
  await assert.rejects(
    providerRequest("Test", "https://provider.example", {}),
    (failure: unknown) => {
      assert.ok(failure instanceof Error);
      assert.match(failure.message, /unreadable response/);
      assert.doesNotMatch(failure.message, /private-key-contents/);
      return true;
    },
  );
});

test("failed recovery copies cannot overwrite unreadable design storage", () => {
  const damaged = '{"version":';
  const values = new Map<string, string>([[LIBRARY_KEY, damaged]]);
  let failRecovery = true;
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      if (key === RECOVERY_KEY && failRecovery)
        throw new Error("Recovery unavailable");
      values.set(key, value);
    },
  };
  const library: ProjectLibrary = {
    version: 1,
    projects: [],
    activeProjectId: "",
  };
  const writer = createLibraryPersistence(
    () => storage,
    () => {},
    damaged,
  );
  writer.schedule(library, 60_000);
  assert.equal(writer.flush(), false);
  assert.equal(storage.getItem(LIBRARY_KEY), damaged);
  failRecovery = false;
  assert.equal(writer.flush(), true);
  assert.equal(storage.getItem(RECOVERY_KEY), damaged);
  assert.deepEqual(JSON.parse(storage.getItem(LIBRARY_KEY)!), library);
});

test("imported prototype keys and SVG-shaped names cannot inject exported content", () => {
  const raw = JSON.parse(
    '{"__proto__":{"polluted":true},' + JSON.stringify(createDoc()).slice(1),
  );
  raw.rooms[0].name = "</title><script>alert(1)</script>";
  raw.rooms[0].items = [
    {
      id: "hostile",
      name: '<image href="https://hostile.example"/>',
      footprint: { kind: "rect", w: 1, d: 1 },
      pos: { x: 0, y: 0 },
      rotDeg: 0,
      height: 1,
      elevation: 0,
      color: 'url("https://hostile.example")',
    },
  ];
  const doc = migrateDoc(raw);
  assert.equal(Object.hasOwn(doc, "__proto__"), false);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  const svg = createFloorPlanSvg(doc.rooms[0]);
  assert.doesNotMatch(svg, /<script|<image|url\("https:/);
  assert.match(svg, /&lt;script&gt;/);
});

test("SVG exports normalize malformed Unicode and XML controls without breaking valid emoji", () => {
  const raw = createDoc();
  raw.rooms[0].name = "Room \ud800 \u0000 \uffff \ud83d\ude00";
  const svg = createFloorPlanSvg(migrateDoc(raw).rooms[0]);
  assert.doesNotThrow(() => encodeURIComponent(svg));
  assert.equal(svg.includes("\u0000"), false);
  assert.equal(svg.includes("\uffff"), false);
  assert.equal(
    Array.from(svg).some((character) => {
      const code = character.codePointAt(0)!;
      return code >= 0xd800 && code <= 0xdfff;
    }),
    false,
  );
  assert.match(svg, /Room \ufffd \ufffd \ufffd \ud83d\ude00/u);
});
