export type DimensionField = "width" | "depth" | "height";

export interface DimensionEvidence {
  raw: string;
  source: "json-ld" | "specification";
}

export interface ProductCandidate {
  name: string;
  variantLabel?: string;
  sku?: string;
  brand?: string;
  url?: string;
  imageUrl?: string;
  widthM?: number;
  depthM?: number;
  heightM?: number;
  evidence: Partial<Record<DimensionField, DimensionEvidence>>;
}

export interface ProductImportResult {
  sourceUrl: string;
  candidates: ProductCandidate[];
  warnings: string[];
}

export interface ConfirmedProduct {
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  sourceUrl?: string;
  sku?: string;
  brand?: string;
}

export type ProductImportErrorCode =
  | "invalid"
  | "unsupported"
  | "blocked"
  | "timeout"
  | "oversized"
  | "unavailable";

export class ProductImportError extends Error {
  readonly code: ProductImportErrorCode;
  constructor(code: ProductImportErrorCode, message: string) {
    super(message);
    this.name = "ProductImportError";
    this.code = code;
  }
}
