import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openServiceDatabase } from "../../server/service/sqlite";
import { handleSharingRequest } from "../../server/sharing/handler";
import { createDoc } from "../../src/model/factory";
import type {
  CreatedShare,
  Participant,
  SharedLayout,
} from "../../src/sharing/types";
import {
  createShare,
  fetchShare,
  parseSharedLayout,
  revokeShare,
  SharingError,
} from "../../src/sharing/client";
import type { SharingStatement } from "../../server/sharing/database";

type Database = ReturnType<typeof openServiceDatabase>;
const start = Date.UTC(2026, 10, 23);
async function call(
  db: Database,
  route: string,
  method = "GET",
  body?: unknown,
  key?: string,
  now = start,
  address = "test-client",
) {
  return handleSharingRequest(
    new Request(`https://service.test/api/shares${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    db,
    { now: () => now, clientAddress: address },
  );
}
async function create(db: Database, title = "Apartment layouts", now = start) {
  const response = await call(
    db,
    "",
    "POST",
    {
      title,
      options: [
        { name: "Layout A", doc: createDoc() },
        { name: "Layout B", doc: createDoc() },
      ],
    },
    undefined,
    now,
  );
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as CreatedShare;
}
async function join(db: Database, id: string, name: string) {
  const response = await call(db, `/${id}/participants`, "POST", { name });
  assert.equal(response.status, 201);
  return (await response.json()) as Participant;
}
async function layout(db: Database, id: string, key?: string) {
  const response = await call(db, `/${id}`, "GET", undefined, key);
  assert.equal(response.status, 200);
  return parseSharedLayout(await response.json());
}

test("feedback rejects lone UTF-16 surrogates so escaped JSON cannot exceed response bounds", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const share = await create(db);
    const identity = await join(db, share.id, "Unicode participant");
    const option = (await layout(db, share.id)).options[0];
    for (const text of ["\ud800".repeat(1000), "\udfff", "name\ud800tail"]) {
      const response = await call(
        db,
        `/${share.id}/comments`,
        "POST",
        { optionId: option.id, text, clientId: crypto.randomUUID() },
        identity.participantKey,
      );
      assert.equal(response.status, 400);
    }
    const text = "\u4e00".repeat(998) + "\ud83d\ude00";
    const saved = await call(
      db,
      `/${share.id}/comments`,
      "POST",
      { optionId: option.id, text, clientId: crypto.randomUUID() },
      identity.participantKey,
    );
    assert.equal(saved.status, 201);
    assert.equal((await layout(db, share.id)).comments[0].text, text);
  } finally {
    db.close();
  }
});

test("shared snapshots persist complete validated options and never expose management secrets", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const original = createDoc();
    const response = await call(db, "", "POST", {
      title: "My options",
      options: [{ name: "First plan", doc: original }],
    });
    const created = (await response.json()) as CreatedShare;
    original.rooms[0].name = "Changed after publication";
    const shared = await layout(db, created.id);
    assert.equal(shared.title, "My options");
    assert.equal(shared.options.length, 1);
    assert.equal(shared.options[0].doc.rooms[0].name, "Room 1");
    assert.equal(shared.options[0].votes, 0);
    const publicJson = JSON.stringify(shared);
    assert.ok(!publicJson.includes(created.ownerKey));
    assert.doesNotMatch(
      publicJson,
      /owner_hash|ownerKey|token_hash|participantKey/,
    );
    const stored = await db
      .prepare("SELECT owner_hash FROM shares WHERE id = ?")
      .bind(created.id)
      .first<{ owner_hash: string }>();
    assert.notEqual(stored?.owner_hash, created.ownerKey);
    assert.match(stored!.owner_hash, /^[a-f0-9]{64}$/);
    assert.equal(
      new Date(created.expiresAt).valueOf() - start,
      30 * 24 * 60 * 60 * 1000,
    );
  } finally {
    db.close();
  }
});

test("independent participants see durable votes and changing a choice keeps one vote", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const shared = await create(db);
    const a = await join(db, shared.id, "Alice"),
      b = await join(db, shared.id, "Bob");
    const initial = await layout(db, shared.id);
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}/vote`,
          "PUT",
          { optionId: initial.options[0].id },
          a.participantKey,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}/vote`,
          "PUT",
          { optionId: initial.options[0].id },
          b.participantKey,
        )
      ).status,
      200,
    );
    assert.equal((await layout(db, shared.id)).options[0].votes, 2);
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}/vote`,
          "PUT",
          { optionId: initial.options[1].id },
          a.participantKey,
        )
      ).status,
      200,
    );
    const updated = await layout(db, shared.id, a.participantKey);
    assert.deepEqual(
      updated.options.map((option) => option.votes),
      [1, 1],
    );
    assert.equal(updated.viewerVote, initial.options[1].id);
    assert.equal((await layout(db, shared.id)).viewerVote, null);
    assert.equal(
      (await db
        .prepare("SELECT COUNT(*) AS count FROM share_votes")
        .first<{ count: number }>())!.count,
      2,
    );
    assert.equal(
      (
        await call(db, `/${shared.id}/vote`, "PUT", {
          optionId: initial.options[0].id,
        })
      ).status,
      401,
    );
  } finally {
    db.close();
  }
});

test("comments retry idempotently and take the author from the authenticated invitation identity", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const shared = await create(db),
      person = await join(db, shared.id, "Alice");
    const optionId = (await layout(db, shared.id)).options[0].id;
    const comment = {
      text: '<script>alert("hi")</script>',
      name: "Impersonated",
      optionId,
      clientId: "comment-retry-0001",
    };
    const first = await call(
      db,
      `/${shared.id}/comments`,
      "POST",
      comment,
      person.participantKey,
    );
    assert.equal(first.status, 201);
    const retry = await call(
      db,
      `/${shared.id}/comments`,
      "POST",
      comment,
      person.participantKey,
    );
    assert.equal(retry.status, 200);
    assert.deepEqual(await first.json(), await retry.json());
    const view = await layout(db, shared.id);
    assert.equal(view.comments.length, 1);
    assert.equal(view.comments[0].name, "Alice");
    assert.equal(view.comments[0].text, comment.text);
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}/comments`,
          "POST",
          {
            ...comment,
            clientId: "another-comment",
            optionId: "unknown-option",
          },
          person.participantKey,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}/comments`,
          "POST",
          { ...comment, clientId: "long-comment", text: "x".repeat(1001) },
          person.participantKey,
        )
      ).status,
      400,
    );
  } finally {
    db.close();
  }
});

test("owner revocation prevents both reads and feedback without allowing participant revocation", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const shared = await create(db),
      person = await join(db, shared.id, "Alice");
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}`,
          "DELETE",
          undefined,
          person.participantKey,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call(db, `/${shared.id}`, "DELETE", undefined, shared.ownerKey))
        .status,
      200,
    );
    assert.equal((await call(db, `/${shared.id}`)).status, 404);
    assert.equal(
      (await call(db, `/${shared.id}/participants`, "POST", { name: "Bob" }))
        .status,
      404,
    );
    assert.equal(
      (
        await call(
          db,
          `/${shared.id}/comments`,
          "POST",
          { text: "Late comment", clientId: "late-comment" },
          person.participantKey,
        )
      ).status,
      404,
    );
  } finally {
    db.close();
  }
});

test("invitations expire and a revision has a new immutable option identity", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const first = await create(db),
      second = await create(db);
    const person = await join(db, first.id, "Alice");
    const oldOption = (await layout(db, first.id)).options[0].id;
    assert.notEqual(first.id, second.id);
    assert.notEqual((await layout(db, second.id)).options[0].id, oldOption);
    assert.equal(
      (
        await call(
          db,
          `/${second.id}/vote`,
          "PUT",
          { optionId: oldOption },
          person.participantKey,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await call(
          db,
          `/${first.id}`,
          "GET",
          undefined,
          undefined,
          Date.parse(first.expiresAt),
        )
      ).status,
      404,
    );
  } finally {
    db.close();
  }
});

test("invalid snapshots and excessive requests are rejected before creating shared data", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    assert.equal(
      (
        await call(db, "", "POST", {
          title: "Invalid",
          options: [{ name: "Broken", doc: { rooms: [{}] } }],
        })
      ).status,
      400,
    );
    assert.equal(
      (await call(db, "", "POST", { title: "Invalid", options: [] })).status,
      400,
    );
    assert.equal(
      (
        await call(db, "", "POST", {
          title: "Large",
          options: [{ name: "x".repeat(260_000), doc: createDoc() }],
        })
      ).status,
      413,
    );
    assert.equal(
      (await db
        .prepare("SELECT COUNT(*) AS count FROM shares")
        .first<{ count: number }>())!.count,
      0,
    );
    for (let index = 0; index < 7; index++) await create(db);
    assert.equal(
      (
        await call(db, "", "POST", {
          title: "Eleventh",
          options: [{ name: "A", doc: createDoc() }],
        })
      ).status,
      429,
    );
    assert.equal(
      (
        await call(
          db,
          "",
          "POST",
          {
            title: "Other browser",
            options: [{ name: "A", doc: createDoc() }],
          },
          undefined,
          start,
          "another-client",
        )
      ).status,
      201,
    );
  } finally {
    db.close();
  }
});

test("concurrent creation respects the persistent global invitation cap", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    await db
      .prepare(
        "WITH RECURSIVE sequence(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 499) INSERT INTO shares (id, title, options_json, owner_hash, created_at, expires_at) SELECT printf('%048d', value), 'Existing', '[]', 'hash', ?, ? FROM sequence",
      )
      .bind(start, start + 86_400_000)
      .run();
    const payload = {
      title: "New invitation",
      options: [{ name: "A", doc: createDoc() }],
    };
    const results = await Promise.all([
      call(db, "", "POST", payload, undefined, start, "first-client"),
      call(db, "", "POST", payload, undefined, start, "second-client"),
    ]);
    assert.deepEqual(
      results.map((response) => response.status).sort(),
      [201, 503],
    );
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM shares")
      .first<{ count: number }>();
    assert.equal(count?.count, 500);
  } finally {
    db.close();
  }
});

test("rate buckets have a persistent global cap while existing buckets advance and expired capacity recovers", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    await create(db);
    await db
      .prepare(
        "WITH RECURSIVE sequence(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 9998) INSERT INTO share_rate_limits (bucket, count, expires_at) SELECT 'existing-' || value, 1, ? FROM sequence",
      )
      .bind(start + 7_200_000)
      .run();
    const payload = {
      title: "New invitation",
      options: [{ name: "A", doc: createDoc() }],
    };
    const results = await Promise.all([
      call(db, "", "POST", payload, undefined, start, "first-new-client"),
      call(db, "", "POST", payload, undefined, start, "second-new-client"),
    ]);
    assert.deepEqual(
      results.map((response) => response.status).sort(),
      [201, 429],
    );
    assert.equal((await call(db, "", "POST", payload)).status, 201);
    const incremented = await db
      .prepare(
        "SELECT count FROM share_rate_limits WHERE bucket LIKE 'create:%' AND count = 2",
      )
      .first<{ count: number }>();
    assert.equal(incremented?.count, 2);
    assert.equal(
      (
        await call(
          db,
          "",
          "POST",
          payload,
          undefined,
          start,
          "third-new-client",
        )
      ).status,
      429,
    );
    const full = await db
      .prepare("SELECT COUNT(*) AS count FROM share_rate_limits")
      .first<{ count: number }>();
    assert.equal(full?.count, 10000);
    assert.equal(
      (
        await call(
          db,
          "",
          "POST",
          payload,
          undefined,
          start + 10_800_000,
          "third-new-client",
        )
      ).status,
      201,
    );
    const recovered = await db
      .prepare("SELECT COUNT(*) AS count FROM share_rate_limits")
      .first<{ count: number }>();
    assert.equal(recovered?.count, 1);
  } finally {
    db.close();
  }
});

test("shared feedback survives reopening a SQLite database", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "room-planner-sharing-"));
  const filename = path.join(directory, "service.sqlite");
  let db = openServiceDatabase(filename);
  try {
    const shared = await create(db),
      person = await join(db, shared.id, "Alice");
    const optionId = (await layout(db, shared.id)).options[0].id;
    await call(
      db,
      `/${shared.id}/vote`,
      "PUT",
      { optionId },
      person.participantKey,
    );
    await call(
      db,
      `/${shared.id}/comments`,
      "POST",
      { text: "The desk fits here.", clientId: "durable-comment", optionId },
      person.participantKey,
    );
    db.close();
    db = openServiceDatabase(filename);
    const restored = await layout(db, shared.id);
    assert.equal(restored.options[0].votes, 1);
    assert.equal(restored.comments[0].text, "The desk fits here.");
  } finally {
    db.close();
    rmSync(filename, { force: true });
    rmSync(`${filename}-wal`, { force: true });
    rmSync(`${filename}-shm`, { force: true });
    rmdirSync(directory);
  }
});

test("remote shared documents are validated before client rendering or copying", () => {
  const valid: SharedLayout = {
    id: "a".repeat(48),
    title: "Layouts",
    createdAt: new Date(start).toISOString(),
    expiresAt: new Date(start + 1000).toISOString(),
    options: [{ id: "b".repeat(24), name: "A", doc: createDoc(), votes: 0 }],
    comments: [],
    viewerVote: null,
  };
  assert.equal(parseSharedLayout(valid).options[0].doc.rooms.length, 1);
  assert.throws(() =>
    parseSharedLayout({
      ...valid,
      options: [
        {
          ...valid.options[0],
          doc: {
            rooms: [{ id: "x", name: "Invalid", shape: { width: Infinity } }],
          },
        },
      ],
    }),
  );
  assert.throws(() =>
    parseSharedLayout({
      ...valid,
      comments: [
        {
          id: "x",
          name: "A",
          text: "text",
          createdAt: valid.createdAt,
          optionId: "not-an-option",
        },
      ],
    }),
  );
});

test("revocation racing a validated participant or feedback write prevents the SQL mutation", async () => {
  for (const action of ["participants", "vote", "comments"] as const) {
    const db = openServiceDatabase(":memory:");
    try {
      const share = await create(db);
      const person = await join(db, share.id, "Alice");
      const options = (await layout(db, share.id)).options;
      await call(
        db,
        `/${share.id}/vote`,
        "PUT",
        { optionId: options[0].id },
        person.participantKey,
      );
      const original = db.prepare.bind(db);
      let intercepted = false;
      const table =
        action === "participants"
          ? "share_participants"
          : action === "vote"
            ? "share_votes"
            : "share_comments";
      db.prepare = (sql: string): SharingStatement => {
        const statement = original(sql);
        if (!sql.startsWith(`INSERT INTO ${table} `)) return statement;
        const bind = statement.bind.bind(statement);
        statement.bind = (...values) => {
          const bound = bind(...values);
          const run = bound.run.bind(bound);
          bound.run = async () => {
            intercepted = true;
            await original("UPDATE shares SET revoked_at = ? WHERE id = ?")
              .bind(start + 1, share.id)
              .run();
            return run();
          };
          return bound;
        };
        return statement;
      };
      const body =
        action === "participants"
          ? { name: "Late participant" }
          : action === "vote"
            ? { optionId: options[1].id }
            : {
                optionId: options[0].id,
                text: "Late comment",
                clientId: "revoke-race-comment",
              };
      const response = await call(
        db,
        `/${share.id}/${action}`,
        action === "vote" ? "PUT" : "POST",
        body,
        action === "participants" ? undefined : person.participantKey,
      );
      assert.ok(intercepted, action);
      assert.equal(response.status, 404, action);
      assert.equal(
        (
          await original(
            "SELECT COUNT(*) AS count FROM share_participants",
          ).first<{ count: number }>()
        )?.count,
        1,
      );
      assert.equal(
        (
          await original("SELECT COUNT(*) AS count FROM share_comments").first<{
            count: number;
          }>()
        )?.count,
        0,
      );
      assert.equal(
        (
          await original("SELECT option_id FROM share_votes").first<{
            option_id: string;
          }>()
        )?.option_id,
        options[0].id,
      );
    } finally {
      db.close();
    }
  }
});

test("a request crossing invitation expiry cannot create a participant, vote, or comment", async () => {
  for (const action of ["participants", "vote", "comments"] as const) {
    const db = openServiceDatabase(":memory:");
    try {
      const share = await create(db);
      const person = await join(db, share.id, "Alice");
      const optionId = (await layout(db, share.id)).options[0].id;
      let clockCalls = 0;
      const body =
        action === "participants"
          ? { name: "Late participant" }
          : action === "vote"
            ? { optionId }
            : {
                optionId,
                text: "Late comment",
                clientId: "expiry-race-comment",
              };
      const response = await handleSharingRequest(
        new Request(`https://service.test/api/shares/${share.id}/${action}`, {
          method: action === "vote" ? "PUT" : "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${person.participantKey}`,
          },
          body: JSON.stringify(body),
        }),
        db,
        {
          clientAddress: "expiry-client",
          now: () => (clockCalls++ === 0 ? start : Date.parse(share.expiresAt)),
        },
      );
      assert.equal(response.status, 404, action);
      assert.equal(
        (
          await db
            .prepare("SELECT COUNT(*) AS count FROM share_participants")
            .first<{ count: number }>()
        )?.count,
        1,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT COUNT(*) AS count FROM share_comments")
            .first<{ count: number }>()
        )?.count,
        0,
      );
      assert.equal(
        (
          await db
            .prepare("SELECT COUNT(*) AS count FROM share_votes")
            .first<{ count: number }>()
        )?.count,
        0,
      );
    } finally {
      db.close();
    }
  }
});

test("JSON request bodies enforce exact MIME, UTF-8, chunk bounds, and client cancellation", async () => {
  const db = openServiceDatabase(":memory:");
  try {
    const make = (
      body: BodyInit,
      headers: Record<string, string> = {},
      signal?: AbortSignal,
    ) =>
      new Request("https://service.test/api/shares", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal,
        ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
      } as RequestInit);
    const run = (request: Request) =>
      handleSharingRequest(request, db, { now: () => start });
    assert.equal(
      (await run(make("{}", { "content-type": "application/jsonp" }))).status,
      415,
    );
    assert.equal(
      (
        await run(
          make(
            new Uint8Array([
              123, 34, 116, 105, 116, 108, 101, 34, 58, 34, 0xff, 34, 125,
            ]),
          ),
        )
      ).status,
      400,
    );
    let cancelled = false;
    const fragments = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array());
      },
      cancel() {
        cancelled = true;
      },
    });
    assert.equal((await run(make(fragments))).status, 400);
    assert.ok(cancelled);
    const abort = new AbortController();
    let stalledCancelled = false;
    const stalled = new ReadableStream<Uint8Array>({
      cancel() {
        stalledCancelled = true;
      },
    });
    const waiting = run(make(stalled, {}, abort.signal));
    setTimeout(() => abort.abort(), 10);
    assert.equal((await waiting).status, 400);
    assert.ok(stalledCancelled);
  } finally {
    db.close();
  }
});

test(
  "a stalled upload reaches the bounded request-body deadline",
  { timeout: 15_000 },
  async () => {
    const db = openServiceDatabase(":memory:");
    try {
      let cancelled = false;
      const response = await handleSharingRequest(
        new Request("https://service.test/api/shares", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          duplex: "half",
        } as RequestInit),
        db,
        { now: () => start },
      );
      assert.equal(response.status, 408);
      assert.ok(cancelled);
    } finally {
      db.close();
    }
  },
);

test("sharing clients reject unsafe invitation paths and oversized or malformed remote responses", async (t) => {
  let fetches = 0;
  const mock = t.mock.method(globalThis, "fetch", async () => {
    fetches++;
    return new Response("untrusted-response-content", {
      headers: { "content-length": "2000000" },
    });
  });
  for (const id of [
    "../furniture/import",
    "a".repeat(48) + "?redirect=/api",
    "//other-host.test",
    "not-an-invitation",
  ]) {
    await assert.rejects(
      revokeShare(id, "b".repeat(64)),
      (error) => error instanceof SharingError && error.status === 400,
    );
  }
  assert.equal(fetches, 0);
  await assert.rejects(
    fetchShare("a".repeat(48)),
    (error) =>
      error instanceof SharingError &&
      !error.message.includes("untrusted-response-content"),
  );
  mock.mock.mockImplementation(
    async () => new Response(new Uint8Array(1_048_577)),
  );
  await assert.rejects(fetchShare("a".repeat(48)), SharingError);
  mock.mock.mockImplementation(async () => new Response("null"));
  await assert.rejects(
    createShare("A", [
      {
        id: "local-design",
        name: "A",
        doc: createDoc(),
        createdAt: new Date(start).toISOString(),
        updatedAt: new Date(start).toISOString(),
      },
    ]),
    SharingError,
  );
});
