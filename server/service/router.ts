import type { SharingDatabase } from "../sharing/database";
import { handleSharingRequest, RATE_LIMIT_UPSERT } from "../sharing/handler";
import {
  handleProductImport,
  type ProductFetchOptions,
} from "../productImport/handler";
import { admitServiceRequest } from "./budget";

export const DEFAULT_ORIGINS = [
  "https://waderylan.github.io",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5178",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://localhost:5178",
  "http://localhost:4173",
];
export interface ServiceOptions {
  allowedOrigins?: string[];
  clientAddress?: string;
  productFetch?: ProductFetchOptions;
}
export function serviceResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

async function importRate(
  db: SharingDatabase,
  address: string,
): Promise<boolean> {
  const now = Date.now();
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address)),
    ),
  ]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const hour = Math.floor(now / 3_600_000);
  const results = await db.batch([
    db.prepare("DELETE FROM share_rate_limits WHERE expires_at <= ?").bind(now),
    db
      .prepare(RATE_LIMIT_UPSERT)
      .bind(
        `import:global:${hour}`,
        now + 7_200_000,
        `import:global:${hour}`,
        1000,
      ),
    db
      .prepare(RATE_LIMIT_UPSERT)
      .bind(
        `import:${hash}:${hour}`,
        now + 7_200_000,
        `import:${hash}:${hour}`,
        30,
      ),
  ]);
  return results
    .slice(1)
    .every(
      (value) =>
        Number((value as { meta?: { changes?: number } }).meta?.changes) > 0,
    );
}

/** Anonymous invite capabilities authorize writes; CORS additionally limits browser callers. */
export async function handleServiceRequest(
  request: Request,
  db: SharingDatabase,
  options: ServiceOptions = {},
): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowed = new Set(options.allowedOrigins ?? DEFAULT_ORIGINS);
  const cors = (response: Response): Response => {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-content-type-options", "nosniff");
    headers.set(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    headers.set("x-frame-options", "DENY");
    headers.set("vary", "Origin");
    if (origin && allowed.has(origin)) {
      headers.set("access-control-allow-origin", origin);
      headers.set(
        "access-control-allow-methods",
        "GET,POST,PUT,DELETE,OPTIONS",
      );
      headers.set(
        "access-control-allow-headers",
        "Content-Type,Authorization,X-Room-Planner-Client",
      );
    }
    return new Response(response.body, { status: response.status, headers });
  };
  if (origin && !allowed.has(origin))
    return cors(serviceResponse({ error: "This origin is not allowed." }, 403));
  if (request.method === "OPTIONS")
    return cors(new Response(null, { status: 204 }));
  if (
    !["GET", "HEAD"].includes(request.method) &&
    (!origin || request.headers.get("x-room-planner-client") !== "1")
  )
    return cors(
      serviceResponse(
        { error: "Use the Room Planner application for this request." },
        403,
      ),
    );
  const path = new URL(request.url).pathname;
  const routes: Record<string, string[]> = {
    "/api/health": ["GET"],
    "/api/furniture/import": ["POST"],
    "/api/shares": ["POST"],
  };
  const methods =
    routes[path] ??
    (/^\/api\/shares\/[a-f0-9]{48}$/.test(path)
      ? ["GET", "DELETE"]
      : /^\/api\/shares\/[a-f0-9]{48}\/participants$/.test(path) ||
          /^\/api\/shares\/[a-f0-9]{48}\/comments$/.test(path)
        ? ["POST"]
        : /^\/api\/shares\/[a-f0-9]{48}\/vote$/.test(path)
          ? ["PUT"]
          : null);
  if (request.url.length > 4096)
    return cors(serviceResponse({ error: "Request URL is too long." }, 414));
  if (!methods) return cors(serviceResponse({ error: "Not found." }, 404));
  if (!methods.includes(request.method))
    return cors(serviceResponse({ error: "Method not allowed." }, 405));
  try {
    request.signal.throwIfAborted();
    const admission = await admitServiceRequest(
      db,
      options.clientAddress ?? "local",
    );
    if (!admission.allowed) {
      const response = serviceResponse(
        {
          error:
            path === "/api/furniture/import"
              ? { code: "rate_limit", message: admission.message }
              : admission.message,
        },
        admission.status,
      );
      response.headers.set("retry-after", String(admission.retryAfter));
      return cors(response);
    }
    if (path === "/api/health" && request.method === "GET") {
      await db.prepare("SELECT 1 AS ready").first();
      return cors(
        serviceResponse({
          available: true,
          productImport: true,
          sharing: true,
        }),
      );
    }
    if (path === "/api/furniture/import") {
      if (request.method !== "POST")
        return cors(serviceResponse({ error: "Method not allowed." }, 405));
      if (!(await importRate(db, options.clientAddress ?? "local")))
        return cors(
          serviceResponse(
            {
              error: {
                code: "rate_limit",
                message: "Too many imports. Try again later.",
              },
            },
            429,
          ),
        );
      return cors(await handleProductImport(request, options.productFetch));
    }
    if (path === "/api/shares" || path.startsWith("/api/shares/"))
      return cors(
        await handleSharingRequest(request, db, {
          clientAddress: options.clientAddress,
        }),
      );
    return cors(serviceResponse({ error: "Not found." }, 404));
  } catch {
    const response = serviceResponse(
      { error: "The service could not complete this request. Try again." },
      503,
    );
    response.headers.set("retry-after", "60");
    return cors(response);
  }
}
