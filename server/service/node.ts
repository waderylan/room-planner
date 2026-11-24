import type { IncomingMessage, ServerResponse } from "node:http";
import { handleServiceRequest, serviceResponse } from "./router";
import type { SharingDatabase } from "../sharing/database";
import { NodeBodyError, readNodeBody } from "../readNodeBody";

/** Bound request buffering before constructing a Fetch request. No HTTP headers are logged. */
export function createNodeService(
  db: SharingDatabase,
  options: { bodyTimeoutMs?: number } = {},
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const controller = new AbortController();
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", close);
    try {
      const body = await readNodeBody(req, {
        maximumBytes: 300_000,
        timeoutMs: options.bodyTimeoutMs,
      });
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const method = req.method ?? "GET";
      const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
        method,
        headers,
        signal: controller.signal,
        ...(!["GET", "HEAD"].includes(method) ? { body } : {}),
      });
      const response = await handleServiceRequest(request, db, {
        clientAddress: req.socket.remoteAddress ?? "local",
      });
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (controller.signal.aborted || res.destroyed) return;
      res.shouldKeepAlive = false;
      res.setHeader("connection", "close");
      const response = serviceResponse(
        {
          error:
            error instanceof NodeBodyError
              ? error.message
              : "Invalid service request.",
        },
        error instanceof NodeBodyError ? error.status : 400,
      );
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      res.end(await response.text());
    } finally {
      res.off("close", close);
    }
  };
}
