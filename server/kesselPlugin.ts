import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { readBoundedJson } from "../src/lib/boundedJson";
import { NodeBodyError, readNodeBody } from "./readNodeBody";

const isLoopback = (host: string) =>
  ["127.0.0.1", "localhost", "::1", "[::1]", "::ffff:127.0.0.1"].includes(
    host.toLowerCase(),
  );
const MAX_BODY = 1_000_000;

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function localRequest(req: IncomingMessage): boolean {
  try {
    if (!isLoopback(req.socket.remoteAddress ?? "")) return false;
    const host = new URL(`http://${req.headers.host ?? ""}`);
    if (!isLoopback(host.hostname)) return false;
    if (
      req.headers.origin &&
      new URL(req.headers.origin).origin !== host.origin
    )
      return false;
    const site = req.headers["sec-fetch-site"];
    return !site || site === "same-origin" || site === "none";
  } catch {
    return false;
  }
}

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const bytes = await readNodeBody(req, { maximumBytes: MAX_BODY, timeoutMs: 10_000 });
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new SyntaxError("Invalid JSON encoding."); }
  const body: unknown = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Invalid request.");
  return body as Record<string, unknown>;
}

/** Development only: Kessel's private key stays in this Node process, never a VITE_ variable. */
export function kesselPlugin(): Plugin {
  return {
    name: "room-planner-local-codex",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/local-ai/status" && path !== "/api/local-ai/chat")
          return next();
        if (!localRequest(req))
          return json(res, 403, { error: "Local access only." });
        const isStatus = path.endsWith("/status");
        if (req.method !== (isStatus ? "GET" : "POST"))
          return json(res, 405, { error: "Method not allowed." });
        if (
          !isStatus &&
          (!req.headers.origin ||
            req.headers["x-room-planner-client"] !== "1" ||
            !req.headers["content-type"]?.startsWith("application/json"))
        ) {
          return json(res, 403, {
            error: "Same-origin application request required.",
          });
        }
        let base: URL;
        const key = process.env.OPENAI_API_KEY;
        try {
          base = new URL(process.env.OPENAI_BASE_URL ?? "");
          if (
            base.protocol !== "http:" ||
            !isLoopback(base.hostname) ||
            !/^\/v1\/codex\/?$/.test(base.pathname) ||
            base.username ||
            base.password ||
            base.search ||
            base.hash ||
            !key?.startsWith("kessel_")
          )
            throw new Error();
        } catch {
          return json(
            res,
            isStatus ? 200 : 503,
            isStatus
              ? {
                  available: false,
                  provider: "codex",
                  models: [],
                  reason: "Start Room Planner with Kessel.",
                }
              : { error: "Start Room Planner with Kessel to use local Codex." },
          );
        }
        const abort = new AbortController();
        const onClose = () => {
          if (!res.writableEnded) abort.abort();
        };
        res.on("close", onClose);
        try {
          const signal = AbortSignal.any([
            abort.signal,
            AbortSignal.timeout(isStatus ? 10_000 : 180_000),
          ]);
          const upstream =
            base.href.replace(/\/$/, "") +
            (isStatus ? "/models" : "/chat/completions");
          let body: Record<string, unknown> | undefined;
          if (!isStatus) {
            const input = await readBody(req);
            if (
              typeof input.model !== "string" ||
              input.model.length > 200 ||
              !Array.isArray(input.messages) ||
              input.messages.length === 0 ||
              input.messages.length > 150 ||
              !Array.isArray(input.tools) ||
              input.tools.length > 16
            ) {
              return json(res, 400, {
                error: "Invalid local assistant request.",
              });
            }
            body = {
              model: input.model,
              messages: input.messages,
              tools: input.tools,
              parallel_tool_calls: true,
              stream: false,
            };
          }
          const response = await fetch(upstream, {
            method: isStatus ? "GET" : "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal,
            redirect: "error",
          });
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            return json(
              res,
              isStatus ? 200 : 502,
              isStatus
                ? {
                    available: false,
                    provider: "codex",
                    models: [],
                    reason: "Kessel could not reach Codex. Run kessel doctor.",
                  }
                : {
                    error:
                      response.status === 429
                        ? "Codex quota or rate limit reached. Try again later."
                        : `Kessel could not complete the request (${response.status}). Run kessel doctor.`,
                  },
            );
          }
          const data = await readBoundedJson(response, 2_000_000, signal);
          if (isStatus) {
            const rows = (data as { data?: { id?: unknown }[] })?.data;
            const models = Array.isArray(rows)
              ? rows.slice(0, 100)
                  .map((row) => row.id)
                  .filter(
                    (id): id is string =>
                      typeof id === "string" && id.length <= 200,
                  )
              : [];
            return json(res, 200, {
              available: models.length > 0,
              provider: "codex",
              models,
              ...(models.length
                ? {}
                : { reason: "Codex has no available models." }),
            });
          }
          // Forward only the Chat Completions shape. Never forward headers, raw diagnostics, or configuration.
          const choices = (data as { choices?: unknown })?.choices;
          if (!Array.isArray(choices))
            return json(res, 502, {
              error: "Kessel returned an unreadable response.",
            });
          return json(res, 200, { choices });
        } catch (error) {
          if (error instanceof NodeBodyError) {
            res.shouldKeepAlive = false;
            res.setHeader("Connection", "close");
            return json(res, error.status, { error: error.message });
          }
          if (abort.signal.aborted) return;
          return json(
            res,
            isStatus ? 200 : error instanceof SyntaxError ? 400 : 502,
            isStatus
              ? {
                  available: false,
                  provider: "codex",
                  models: [],
                  reason: "Kessel is unavailable. Run kessel doctor.",
                }
              : {
                  error:
                    error instanceof SyntaxError
                      ? "Invalid request JSON."
                      : "Local Codex could not complete the request. Try again.",
                },
          );
        } finally {
          res.off("close", onClose);
        }
      });
    },
  };
}
