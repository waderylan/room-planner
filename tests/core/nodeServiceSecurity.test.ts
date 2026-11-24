import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { connect, type Socket } from "node:net";
import { test, type TestContext } from "node:test";
import { createNodeService } from "../../server/service/node";
import { openServiceDatabase } from "../../server/service/sqlite";
import { createDoc } from "../../src/model/factory";

async function service(t: TestContext, bodyTimeoutMs = 150) {
  const db = openServiceDatabase(":memory:");
  const sockets = new Set<Socket>();
  const handler = createNodeService(db, { bodyTimeoutMs });
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    db.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { port: address.port, db };
}

function exchange(
  port: number,
  payload: string,
  drip = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    let response = "";
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("HTTP connection did not close after the response."));
    }, 2500);
    socket.once("connect", () => {
      socket.write(payload);
      if (drip) interval = setInterval(() => socket.write(" "), 20);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.once("error", reject);
    socket.once("close", () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      resolve(response);
    });
  });
}

const postHeaders = (port: number, framing: string) =>
  `POST /api/shares HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: http://127.0.0.1:5178\r\nX-Room-Planner-Client: 1\r\nContent-Type: application/json\r\nConnection: keep-alive\r\n${framing}\r\n\r\n`;

test("local HTTP adapter closes stalled uploads at an absolute deadline despite ongoing traffic", async (t) => {
  const { port, db } = await service(t);
  const started = Date.now();
  const result = await exchange(
    port,
    postHeaders(port, "Content-Length: 1000") + "{",
    true,
  );
  assert.match(result, /^HTTP\/1\.1 408 /);
  assert.match(result, /connection: close/i);
  assert.match(result, /Request body timed out/);
  assert.ok(Date.now() - started < 1500);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM share_rate_limits")
        .first<{ count: number }>()
    )?.count,
    0,
  );
});

test("local HTTP adapter rejects oversized declared and streamed bodies before routing", async (t) => {
  const { port, db } = await service(t, 500);
  const declared = await exchange(
    port,
    postHeaders(port, "Content-Length: 300001"),
  );
  assert.match(declared, /^HTTP\/1\.1 413 /);
  assert.match(declared, /Request is too large/);
  const bytes = "x".repeat(300_001);
  const streamed = await exchange(
    port,
    postHeaders(port, "Transfer-Encoding: chunked") +
      bytes.length.toString(16) +
      "\r\n" +
      bytes +
      "\r\n",
  );
  assert.match(streamed, /^HTTP\/1\.1 413 /);
  assert.match(streamed, /connection: close/i);
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM share_rate_limits")
        .first<{ count: number }>()
    )?.count,
    0,
  );
});

test("local HTTP adapter bounds fragmented upload overhead", async (t) => {
  const { port } = await service(t, 1000);
  const result = await exchange(
    port,
    postHeaders(port, "Transfer-Encoding: chunked") + "1\r\nx\r\n".repeat(4200),
  );
  assert.match(result, /^HTTP\/1\.1 400 /);
  assert.match(result, /Request body is too fragmented/);
});

test("local HTTP adapter survives client cancellation and preserves normal origin and capability routes", async (t) => {
  const { port } = await service(t, 1000);
  await new Promise<void>((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.write(postHeaders(port, "Content-Length: 1000") + "{");
      setTimeout(() => socket.destroy(), 10);
    });
    socket.once("close", () => resolve());
  });
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    origin = "http://127.0.0.1:5178",
  ) =>
    new Promise<{ status: number; json: unknown }>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          agent: false,
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "X-Room-Planner-Client": "1",
          },
        },
        (res) => {
          let response = "";
          res.on("data", (chunk) => {
            response += chunk.toString("utf8");
          });
          res.once("end", () =>
            resolve({ status: res.statusCode!, json: JSON.parse(response) }),
          );
        },
      );
      req.once("error", reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  assert.equal((await call("/api/health")).status, 200);
  assert.equal(
    (await call("/api/health", "GET", undefined, "https://attacker.test"))
      .status,
    403,
  );
  const created = await call("/api/shares", "POST", {
    title: "HTTP test",
    options: [{ name: "A", doc: createDoc() }],
  });
  assert.equal(created.status, 201);
  const id = (created.json as { id: string }).id;
  assert.equal((await call(`/api/shares/${id}`)).status, 200);
  assert.equal((await call(`/api/shares/${id}`, "DELETE")).status, 401);
});
