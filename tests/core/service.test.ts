import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { handleServiceRequest } from "../../server/service/router";
import { openServiceDatabase } from "../../server/service/sqlite";
import { createDoc } from "../../src/model/factory";
import type { ProductImportResult } from "../../src/productImport/types";
import type {
  CreatedShare,
  Participant,
  SharedLayout,
} from "../../src/sharing/types";

const origin = "https://waderylan.github.io";
const productUrl =
  "https://www.ikea.com/us/en/p/lack-side-table-white-30449908/";
const productHtml = readFileSync(
  new URL("../fixtures/productImport/ikea-lack.html", import.meta.url),
  "utf8",
);

function database(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), "room-planner-service-"));
  const filename = path.join(directory, "service.sqlite");
  let db = openServiceDatabase(filename);
  let closed = false;
  const close = () => {
    if (!closed) {
      db.close();
      closed = true;
    }
  };
  t.after(() => {
    close();
    for (const file of [filename, `${filename}-wal`, `${filename}-shm`])
      rmSync(file, { force: true });
    rmdirSync(directory);
  });
  return {
    get db() {
      return db;
    },
    close,
    reopen() {
      close();
      db = openServiceDatabase(filename);
      closed = false;
    },
  };
}

function request(
  route: string,
  method = "GET",
  body?: unknown,
  overrides: Record<string, string | null> = {},
) {
  const headers = new Headers({ Origin: origin, "X-Room-Planner-Client": "1" });
  if (body !== undefined) headers.set("content-type", "application/json");
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  return new Request(`https://service.test${route}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function commonHeaders(
  response: Response,
  expectedOrigin: string | null = origin,
) {
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    expectedOrigin,
  );
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("access-control-allow-credentials"), null);
}

test("service health verifies the SQLite connection before reporting readiness", async (t) => {
  const fixture = database(t);
  const healthy = await handleServiceRequest(
    request("/api/health"),
    fixture.db,
  );
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), {
    available: true,
    productImport: true,
    sharing: true,
  });
  commonHeaders(healthy);
  fixture.close();
  const unavailable = await handleServiceRequest(
    request("/api/health"),
    fixture.db,
  );
  assert.equal(unavailable.status, 500);
  assert.deepEqual(await unavailable.json(), {
    error: "The service could not complete this request. Try again.",
  });
  commonHeaders(unavailable);
});

test("CORS matches exact origins and keeps allowed-origin error responses readable", async (t) => {
  const fixture = database(t);
  for (const denied of [
    "https://waderylan.github.io.attacker.test",
    "https://attacker.waderylan.github.io",
    "https://waderylan.github.io:444",
    "null",
  ]) {
    const response = await handleServiceRequest(
      request("/api/health", "GET", undefined, { Origin: denied }),
      fixture.db,
    );
    assert.equal(response.status, 403, denied);
    commonHeaders(response, null);
  }
  const customOrigin = "https://planner.example";
  const options = { allowedOrigins: [customOrigin] };
  const custom = await handleServiceRequest(
    request("/api/missing", "GET", undefined, { Origin: customOrigin }),
    fixture.db,
    options,
  );
  assert.equal(custom.status, 404);
  commonHeaders(custom, customOrigin);
  const replacedDefault = await handleServiceRequest(
    request("/api/health"),
    fixture.db,
    options,
  );
  assert.equal(replacedDefault.status, 403);
  commonHeaders(replacedDefault, null);
  const directRead = await handleServiceRequest(
    request("/api/health", "GET", undefined, { Origin: null }),
    fixture.db,
  );
  assert.equal(directRead.status, 200);
  commonHeaders(directRead, null);
});

test("preflight permits application headers while mutations require origin and the exact client header", async (t) => {
  const fixture = database(t);
  const preflight = await handleServiceRequest(
    request("/api/shares", "OPTIONS", undefined, {
      "X-Room-Planner-Client": null,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "content-type,authorization,x-room-planner-client",
    }),
    fixture.db,
  );
  assert.equal(preflight.status, 204);
  assert.equal(await preflight.text(), "");
  commonHeaders(preflight);
  assert.equal(
    preflight.headers.get("access-control-allow-methods"),
    "GET,POST,PUT,DELETE,OPTIONS",
  );
  assert.equal(
    preflight.headers.get("access-control-allow-headers"),
    "Content-Type,Authorization,X-Room-Planner-Client",
  );
  const deniedPreflight = await handleServiceRequest(
    request("/api/shares", "OPTIONS", undefined, {
      Origin: "https://attacker.test",
    }),
    fixture.db,
  );
  assert.equal(deniedPreflight.status, 403);
  commonHeaders(deniedPreflight, null);
  const body = {
    title: "Must not be created",
    options: [{ name: "A", doc: createDoc() }],
  };
  for (const overrides of [
    { Origin: null },
    { "X-Room-Planner-Client": null },
    { "X-Room-Planner-Client": "true" },
  ]) {
    const denied = await handleServiceRequest(
      request("/api/shares", "POST", body, overrides),
      fixture.db,
    );
    assert.equal(denied.status, 403);
    commonHeaders(denied, overrides.Origin === null ? null : origin);
  }
  const rows = await fixture.db
    .prepare("SELECT COUNT(*) AS count FROM shares")
    .first<{ count: number }>();
  assert.equal(rows?.count, 0);
});

test("the routed import fetches deterministic retailer metadata and preserves middleware on failures", async (t) => {
  const fixture = database(t);
  let fetches = 0;
  const options = {
    productFetch: {
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        fetches++;
        assert.equal(String(url), productUrl);
        assert.equal(init?.redirect, "manual");
        return new Response(productHtml, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }) as typeof fetch,
    },
  };
  const response = await handleServiceRequest(
    request("/api/furniture/import", "POST", { url: productUrl }),
    fixture.db,
    options,
  );
  assert.equal(response.status, 200, await response.clone().text());
  commonHeaders(response);
  const result = (await response.json()) as ProductImportResult;
  assert.equal(result.sourceUrl, productUrl);
  assert.equal(result.candidates[0].name, "LACK side table, white");
  assert.equal(result.candidates[0].sku, "30449908");
  assert.ok(Math.abs(result.candidates[0].widthM! - 0.549275) < 1e-9);
  assert.ok(Math.abs(result.candidates[0].heightM! - 0.45085) < 1e-9);
  assert.equal(fetches, 1);
  const denied = await handleServiceRequest(
    request("/api/furniture/import", "POST", {
      url: "http://127.0.0.1/private",
    }),
    fixture.db,
    options,
  );
  assert.equal(denied.status, 400);
  commonHeaders(denied);
  assert.equal(fetches, 1);
  const method = await handleServiceRequest(
    request("/api/furniture/import"),
    fixture.db,
    options,
  );
  assert.equal(method.status, 405);
  commonHeaders(method);
});

test("shared layouts and invitation-authorized feedback survive SQLite reopen through service middleware", async (t) => {
  const fixture = database(t);
  const doc = createDoc();
  const create = await handleServiceRequest(
    request("/api/shares", "POST", {
      title: "Apartment options",
      options: [{ name: "With my sofa", doc }],
    }),
    fixture.db,
  );
  assert.equal(create.status, 201, await create.clone().text());
  commonHeaders(create);
  const created = (await create.json()) as CreatedShare;
  fixture.reopen();
  const route = `/api/shares/${created.id}`;
  const read = await handleServiceRequest(request(route), fixture.db);
  assert.equal(read.status, 200);
  commonHeaders(read);
  const layout = (await read.json()) as SharedLayout;
  assert.deepEqual(layout.options[0].doc, doc);
  assert.ok(!JSON.stringify(layout).includes(created.ownerKey));
  const join = await handleServiceRequest(
    request(`${route}/participants`, "POST", { name: "Rylan" }),
    fixture.db,
  );
  assert.equal(join.status, 201);
  const participant = (await join.json()) as Participant;
  const authorization = {
    Authorization: `Bearer ${participant.participantKey}`,
  };
  const anonymousVote = await handleServiceRequest(
    request(`${route}/vote`, "PUT", { optionId: layout.options[0].id }),
    fixture.db,
  );
  assert.equal(anonymousVote.status, 401);
  commonHeaders(anonymousVote);
  const vote = await handleServiceRequest(
    request(
      `${route}/vote`,
      "PUT",
      { optionId: layout.options[0].id },
      authorization,
    ),
    fixture.db,
  );
  assert.equal(vote.status, 200);
  commonHeaders(vote);
  fixture.reopen();
  const restored = await handleServiceRequest(
    request(route, "GET", undefined, authorization),
    fixture.db,
  );
  const saved = (await restored.json()) as SharedLayout;
  assert.equal(saved.options[0].votes, 1);
  assert.equal(saved.viewerVote, layout.options[0].id);
  const revoke = await handleServiceRequest(
    request(route, "DELETE", undefined, {
      Authorization: `Bearer ${created.ownerKey}`,
    }),
    fixture.db,
  );
  assert.equal(revoke.status, 200);
  commonHeaders(revoke);
  fixture.reopen();
  assert.equal(
    (await handleServiceRequest(request(route), fixture.db)).status,
    404,
  );
});

test("SQLite batches roll back failed writes and leave the connection usable", async (t) => {
  const fixture = database(t);
  await assert.rejects(
    fixture.db.batch([
      fixture.db
        .prepare(
          "INSERT INTO share_rate_limits (bucket,count,expires_at) VALUES (?,1,?)",
        )
        .bind("must-rollback", 1),
      fixture.db
        .prepare(
          "INSERT INTO share_votes (share_id,participant_id,option_id,updated_at) VALUES (?,?,?,?)",
        )
        .bind("missing-share", "missing-participant", "option", 1),
    ]),
    /FOREIGN KEY/,
  );
  assert.equal(
    await fixture.db
      .prepare("SELECT * FROM share_rate_limits WHERE bucket = ?")
      .bind("must-rollback")
      .first(),
    null,
  );
  const health = await handleServiceRequest(request("/api/health"), fixture.db);
  assert.equal(health.status, 200);
});

test("import limits persist per hashed client and enforce the global cap before fetching", async (t) => {
  t.mock.method(Date, "now", () => Date.UTC(2026, 10, 23, 12));
  const fixture = database(t);
  let fetches = 0;
  const options = {
    clientAddress: "private-client-address",
    productFetch: {
      fetchImpl: (async () => {
        fetches++;
        return new Response(productHtml, {
          headers: { "content-type": "text/html" },
        });
      }) as typeof fetch,
    },
  };
  for (let index = 0; index < 30; index++) {
    const response = await handleServiceRequest(
      request("/api/furniture/import", "POST", { url: productUrl }),
      fixture.db,
      options,
    );
    assert.equal(response.status, 200, `Import ${index + 1}`);
  }
  fixture.reopen();
  const blocked = await handleServiceRequest(
    request("/api/furniture/import", "POST", { url: productUrl }),
    fixture.db,
    options,
  );
  assert.equal(blocked.status, 429);
  commonHeaders(blocked);
  assert.deepEqual(await blocked.json(), {
    error: {
      code: "rate_limit",
      message: "Too many imports. Try again later.",
    },
  });
  assert.equal(fetches, 30);
  const other = await handleServiceRequest(
    request("/api/furniture/import", "POST", { url: productUrl }),
    fixture.db,
    { ...options, clientAddress: "other-client" },
  );
  assert.equal(other.status, 200);
  const buckets = await fixture.db
    .prepare("SELECT bucket FROM share_rate_limits")
    .all<{ bucket: string }>();
  assert.ok(
    buckets.results.every(
      ({ bucket }) => !bucket.includes(options.clientAddress),
    ),
  );
  await fixture.db
    .prepare(
      "UPDATE share_rate_limits SET count = 1000 WHERE bucket LIKE 'import:global:%'",
    )
    .run();
  const global = await handleServiceRequest(
    request("/api/furniture/import", "POST", { url: productUrl }),
    fixture.db,
    { ...options, clientAddress: "fresh-client" },
  );
  assert.equal(global.status, 429);
  commonHeaders(global);
  assert.equal(fetches, 31);
});
