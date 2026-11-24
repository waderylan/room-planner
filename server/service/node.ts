import type { IncomingMessage, ServerResponse } from "node:http";
import { handleServiceRequest, serviceResponse } from "./router";
import type { SharingDatabase } from "../sharing/database";

/** Bound request buffering before constructing a Fetch request. No HTTP headers are logged. */
export function createNodeService(db: SharingDatabase) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const controller = new AbortController();
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", close);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 300_000) {
          res.writeHead(413, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Request is too large." }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const method = req.method ?? "GET";
      const request = new Request(`http://127.0.0.1${req.url ?? "/"}`, {
        method,
        headers,
        signal: controller.signal,
        ...(!["GET", "HEAD"].includes(method)
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = await handleServiceRequest(request, db, {
        clientAddress: req.socket.remoteAddress ?? "local",
      });
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (controller.signal.aborted) return;
      const response = serviceResponse(
        { error: "Invalid service request." },
        400,
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
