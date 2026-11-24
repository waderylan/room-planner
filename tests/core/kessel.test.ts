import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ViteDevServer } from "vite";
import { kesselPlugin } from "../../server/kesselPlugin";

let middleware!: (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;
const configure = kesselPlugin().configureServer as (server: ViteDevServer) => void;
configure({ middlewares: { use(handler: typeof middleware) { middleware = handler; } } } as unknown as ViteDevServer);
const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not bind.");
const origin = `http://127.0.0.1:${address.port}`;
const originalBase = process.env.OPENAI_BASE_URL;
const originalKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_BASE_URL;
delete process.env.OPENAI_API_KEY;
after(async () => {
  if (originalBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = originalBase;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("local assistant status reports missing configuration without credentials", async () => {
  const response = await fetch(`${origin}/api/local-ai/status`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.available, false);
  assert.match(data.reason, /Kessel/);
  assert.deepEqual(data.models, []);
});

test("cross-origin sites cannot use the local subscription proxy", async () => {
  const response = await fetch(`${origin}/api/local-ai/chat`, { method: "POST", headers: { Origin: "https://hostile.example", "Content-Type": "application/json", "x-room-planner-client": "1" }, body: "{}" });
  assert.equal(response.status, 403);
  const noOrigin = await fetch(`${origin}/api/local-ai/chat`, { method: "POST", headers: { "Content-Type": "application/json", "x-room-planner-client": "1" }, body: "{}" });
  assert.equal(noOrigin.status, 403);
  const noClientHeader = await fetch(`${origin}/api/local-ai/chat`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" });
  assert.equal(noClientHeader.status, 403);
});

test("nonlocal and non-Codex upstream URLs are rejected", async () => {
  process.env.OPENAI_API_KEY = "kessel_test_private_key";
  for (const base of ["https://example.com/v1/codex", "http://127.0.0.1:4880/v1/claude", "http://127.0.0.1:4880/v1/codex?redirect=1"]) {
    process.env.OPENAI_BASE_URL = base;
    const response = await fetch(`${origin}/api/local-ai/status`);
    assert.equal((await response.json()).available, false);
  }
});

test("oversized local assistant uploads are rejected before reaching Codex", async () => {
  process.env.OPENAI_API_KEY = "kessel_test_private_key";
  process.env.OPENAI_BASE_URL = "http://127.0.0.1:9/v1/codex";
  const response = await fetch(`${origin}/api/local-ai/chat`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "x-room-planner-client": "1" },
    body: "x".repeat(1_000_001),
  });
  assert.equal(response.status, 413);
  assert.equal(response.headers.get("connection"), "close");
  assert.doesNotMatch(await response.text(), /kessel_test_private_key|127\.0\.0\.1:9/);
});

test("local assistant rejects malformed UTF-8 instead of replacing request text", async () => {
  process.env.OPENAI_API_KEY = "kessel_test_private_key";
  process.env.OPENAI_BASE_URL = "http://127.0.0.1:9/v1/codex";
  const response = await fetch(`${origin}/api/local-ai/chat`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "x-room-planner-client": "1" },
    body: Buffer.concat([Buffer.from('{"model":"model","messages":[{"role":"user","content":"'), Buffer.from([0xff]), Buffer.from('"}],"tools":[]}')]),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid request JSON." });
});

test("local assistant uploads have an absolute deadline and close the failed connection", async (t) => {
  process.env.OPENAI_API_KEY = "kessel_test_private_key";
  process.env.OPENAI_BASE_URL = "http://127.0.0.1:9/v1/codex";
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = Object.assign(new PassThrough(), {
    method: "POST", url: "/api/local-ai/chat", socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "127.0.0.1", origin: "http://127.0.0.1", "content-type": "application/json", "x-room-planner-client": "1" },
  });
  const headers = new Map<string, unknown>();
  let body = "";
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200, shouldKeepAlive: true, writableEnded: false,
    setHeader(name: string, value: unknown) { headers.set(name, value); },
    end(value: unknown) { body = String(value); this.writableEnded = true; },
  });
  try {
    const result = middleware(request as unknown as IncomingMessage, response as unknown as ServerResponse, () => {});
    t.mock.timers.tick(10_001);
    await result;
    assert.equal(response.statusCode, 408);
    assert.equal(response.shouldKeepAlive, false);
    assert.equal(headers.get("Connection"), "close");
    assert.match(body, /timed out/);
    assert.doesNotMatch(body, /kessel_test_private_key|127\.0\.0\.1:9/);
  } finally { request.destroy(); }
});

test("same-origin proxy supplies the server key and returns only model/chat data", async () => {
  const upstream = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer kessel_test_private_key");
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/codex/models") return res.end(JSON.stringify({ data: [{ id: "discovered-model" }] }));
    assert.equal(req.url, "/v1/codex/chat/completions");
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Ready" } }], private_diagnostic: "must-not-leak" }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  try {
    const upstreamAddress = upstream.address();
    if (!upstreamAddress || typeof upstreamAddress === "string") throw new Error("No upstream address");
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${upstreamAddress.port}/v1/codex`;
    process.env.OPENAI_API_KEY = "kessel_test_private_key";
    const status = await (await fetch(`${origin}/api/local-ai/status`)).json();
    assert.deepEqual(status.models, ["discovered-model"]);
    const response = await fetch(`${origin}/api/local-ai/chat`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "x-room-planner-client": "1" }, body: JSON.stringify({ model: "discovered-model", messages: [{ role: "user", content: "Ready?" }], tools: [] }) });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /Ready/);
    assert.doesNotMatch(text, /kessel_test|private_diagnostic|must-not-leak/);
    const invalid = await fetch(`${origin}/api/local-ai/chat`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "x-room-planner-client": "1" }, body: JSON.stringify({ model: "discovered-model", messages: [{}], tools: Array(17).fill({}) }) });
    assert.equal(invalid.status, 400);
  } finally { await new Promise<void>((resolve) => upstream.close(() => resolve())); }
});
