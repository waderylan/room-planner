import { serviceFetch } from "../service/client";
import {
  ProductImportError,
  type ProductImportErrorCode,
  type ProductImportResult,
} from "./types";

const ERROR_CODES = new Set<ProductImportErrorCode>([
  "invalid",
  "unsupported",
  "blocked",
  "timeout",
  "oversized",
  "unavailable",
]);
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export async function importProduct(
  url: string,
  signal?: AbortSignal,
): Promise<ProductImportResult> {
  try {
    const response = await serviceFetch("/api/furniture/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
    const data = (await response.json()) as ProductImportResult & {
      error?: { code?: ProductImportErrorCode; message?: string };
    };
    if (!response.ok) {
      const code = data.error?.code;
      throw new ProductImportError(
        code && ERROR_CODES.has(code) ? code : "unavailable",
        data.error?.message ||
          "Product import is unavailable. Enter dimensions instead.",
      );
    }
    if (
      !isHttpsUrl(data.sourceUrl) ||
      !Array.isArray(data.candidates) ||
      data.candidates.length > 20 ||
      !Array.isArray(data.warnings) ||
      data.warnings.length > 20 ||
      data.warnings.some(
        (warning) => typeof warning !== "string" || warning.length > 400,
      )
    )
      throw new Error();
    for (const candidate of data.candidates) {
      if (
        !candidate ||
        typeof candidate.name !== "string" ||
        !candidate.name.trim() ||
        candidate.name.length > 200
      )
        throw new Error();
      for (const dimension of [
        candidate.widthM,
        candidate.depthM,
        candidate.heightM,
      ])
        if (
          dimension !== undefined &&
          (typeof dimension !== "number" ||
            !Number.isFinite(dimension) ||
            dimension <= 0 ||
            dimension > 100)
        )
          throw new Error();
      for (const value of [
        candidate.sku,
        candidate.brand,
        candidate.variantLabel,
      ])
        if (
          value !== undefined &&
          (typeof value !== "string" || value.length > 200)
        )
          throw new Error();
      for (const value of [candidate.url, candidate.imageUrl])
        if (value !== undefined && !isHttpsUrl(value)) throw new Error();
    }
    return data;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ProductImportError) throw error;
    throw new ProductImportError(
      "unavailable",
      "Product import is unavailable. Enter dimensions instead.",
    );
  }
}
