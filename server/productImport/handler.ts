import { extractProductCandidates } from "../../src/productImport/parser";
import {
  ProductImportError,
  type ProductImportResult,
} from "../../src/productImport/types";

export const SUPPORTED_RETAILER_HOSTS = new Set([
  "ikea.com",
  "www.ikea.com",
  "article.com",
  "www.article.com",
  "westelm.com",
  "www.westelm.com",
  "crateandbarrel.com",
  "www.crateandbarrel.com",
  "cb2.com",
  "www.cb2.com",
  "wayfair.com",
  "www.wayfair.com",
]);
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REQUEST_BYTES = 8_192;
const TIMEOUT_MS = 10_000;

export function validateProductUrl(value: unknown): URL {
  if (typeof value !== "string" || value.length > 2048)
    throw new ProductImportError("invalid", "Enter a valid product link.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProductImportError("invalid", "Enter a valid product link.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ProductImportError("invalid", "Use a public HTTPS product link.");
  }
  if (!SUPPORTED_RETAILER_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ProductImportError(
      "unsupported",
      "This retailer is not supported. Enter dimensions instead.",
    );
  }
  url.hash = "";
  return url;
}

async function boundedText(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new ProductImportError(
          "oversized",
          "The product page is too large. Enter dimensions instead.",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export interface ProductFetchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Retailer allowlist and redirect checks deliberately avoid a general-purpose open proxy. */
export async function importProductFromUrl(
  value: unknown,
  options: ProductFetchOptions = {},
): Promise<ProductImportResult> {
  let url = validateProductUrl(value);
  const sourceUrl = url.href;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      signal.throwIfAborted();
      const response = await fetchImpl(url.href, {
        method: "GET",
        redirect: "manual",
        signal,
        headers: {
          Accept: "text/html, application/xhtml+xml",
          "User-Agent": "RoomPlannerFurnitureImporter/1.0",
        },
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 3)
          throw new ProductImportError(
            "blocked",
            "The product link could not be followed. Enter dimensions instead.",
          );
        try {
          url = validateProductUrl(new URL(location, url).href);
        } catch {
          throw new ProductImportError(
            "blocked",
            "The retailer redirected to an unsupported address. Enter dimensions instead.",
          );
        }
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403, 429].includes(response.status))
          throw new ProductImportError(
            "blocked",
            "The retailer blocked import. Enter dimensions instead.",
          );
        throw new ProductImportError(
          "unavailable",
          "The product page could not be loaded. Enter dimensions instead.",
        );
      }
      if (
        !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
          response.headers.get("content-type") ?? "",
        )
      ) {
        await response.body?.cancel();
        throw new ProductImportError(
          "unsupported",
          "This link is not a product page. Enter dimensions instead.",
        );
      }
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
        await response.body?.cancel();
        throw new ProductImportError(
          "oversized",
          "The product page is too large. Enter dimensions instead.",
        );
      }
      const html = await boundedText(response.body, MAX_RESPONSE_BYTES, signal);
      const result = extractProductCandidates(html, url.href);
      return { ...result, sourceUrl };
    }
    throw new ProductImportError(
      "blocked",
      "The product link could not be followed.",
    );
  } catch (error) {
    options.signal?.throwIfAborted();
    if (timeout.aborted)
      throw new ProductImportError(
        "timeout",
        "The retailer took too long. Enter dimensions instead.",
      );
    if (error instanceof ProductImportError) throw error;
    throw new ProductImportError(
      "unavailable",
      "The product page could not be loaded. Enter dimensions instead.",
    );
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Parent service supplies CORS and persistent per-client rate limiting. No upstream HTML is returned. */
export async function handleProductImport(
  request: Request,
  options: ProductFetchOptions = {},
): Promise<Response> {
  if (request.method !== "POST")
    return json(
      { error: { code: "invalid", message: "Method not allowed." } },
      405,
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return json(
      { error: { code: "invalid", message: "Use a JSON request." } },
      415,
    );
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES)
      return json(
        { error: { code: "oversized", message: "Request is too large." } },
        413,
      );
    let input: unknown;
    try {
      input = JSON.parse(
        await boundedText(request.body, MAX_REQUEST_BYTES, request.signal),
      );
    } catch (error) {
      if (error instanceof ProductImportError) throw error;
      throw new ProductImportError("invalid", "Enter a valid product link.");
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => key !== "url")
    )
      throw new ProductImportError("invalid", "Enter a valid product link.");
    return json(
      await importProductFromUrl((input as { url?: unknown }).url, {
        ...options,
        signal: options.signal
          ? AbortSignal.any([options.signal, request.signal])
          : request.signal,
      }),
    );
  } catch (error) {
    if (request.signal.aborted)
      return json(
        { error: { code: "unavailable", message: "Import was cancelled." } },
        499,
      );
    const failure =
      error instanceof ProductImportError
        ? error
        : new ProductImportError(
            "unavailable",
            "Product import is unavailable. Enter dimensions instead.",
          );
    const status = {
      invalid: 400,
      unsupported: 422,
      blocked: 422,
      timeout: 504,
      oversized: 413,
      unavailable: 502,
    }[failure.code];
    return json(
      { error: { code: failure.code, message: failure.message } },
      status,
    );
  }
}
