import type {
  DimensionField,
  ProductCandidate,
  ProductImportResult,
} from "./types";

const MAX_HTML_LENGTH = 2_000_000;
const MAX_JSON_LENGTH = 500_000;
const MAX_NODES = 300;
const MAX_CANDIDATES = 20;
const FRACTIONS: Record<string, string> = {
  "½": " 1/2",
  "¼": " 1/4",
  "¾": " 3/4",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
  "⅓": " 1/3",
  "⅔": " 2/3",
};
const UNIT_FACTORS: Record<string, number> = {
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  mtr: 1,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  centimetre: 0.01,
  centimetres: 0.01,
  cmt: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  millimetre: 0.001,
  millimetres: 0.001,
  mmt: 0.001,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  inh: 0.0254,
  '"': 0.0254,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  fot: 0.3048,
  "'": 0.3048,
};
const FIELDS: DimensionField[] = ["width", "depth", "height"];
const NUMBER = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d+\s*\/\s*\d+)?|\d+\s*\/\s*\d+)`;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function boundedText(value: unknown, limit = 200): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, limit)
    : undefined;
}
function normalize(value: string): string {
  return value
    .replace(/[½¼¾⅛⅜⅝⅞⅓⅔]/g, (fraction) => FRACTIONS[fraction])
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/\u00a0/g, " ")
    .trim();
}
function unitFactor(unit: unknown): number | undefined {
  if (typeof unit !== "string") return undefined;
  return UNIT_FACTORS[normalize(unit).toLowerCase().replace(/\.$/, "")];
}
function scalar(value: string): number | undefined {
  const pieces = value.trim().split(/\s+/);
  let result = 0;
  for (const piece of pieces) {
    if (piece.includes("/")) {
      const [numerator, denominator] = piece.split("/").map(Number);
      if (
        !Number.isFinite(numerator) ||
        !Number.isFinite(denominator) ||
        denominator <= 0
      )
        return undefined;
      result += numerator / denominator;
    } else result += Number(piece);
  }
  return Number.isFinite(result) && result >= 0 ? result : undefined;
}
function validMeters(value: number | undefined): number | undefined {
  return value !== undefined &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
    ? Number(value.toPrecision(12))
    : undefined;
}

/** Units must be explicit. Never interpret image pixels or unitless product numbers as lengths. */
export function parseDimensionToMeters(
  value: unknown,
  unitHint?: string,
): number | undefined {
  const object = record(value);
  if (object) {
    // A range is not one confirmed dimension.
    if (object.minValue !== undefined || object.maxValue !== undefined)
      return undefined;
    return parseDimensionToMeters(
      object.value,
      boundedText(object.unitCode) ?? boundedText(object.unitText) ?? unitHint,
    );
  }
  if (typeof value === "number")
    return validMeters(value * (unitFactor(unitHint) ?? Number.NaN));
  if (typeof value !== "string" || value.length > 150) return undefined;
  const input = normalize(value).replace(/(\d)\s*\/\s*(\d)/g, "$1/$2");
  const feet = input.match(
    new RegExp(
      `^(${NUMBER})\\s*(?:'|ft|feet|foot)\\s*(${NUMBER})\\s*(?:"|in|inches|inch)$`,
      "i",
    ),
  );
  if (feet) {
    const wholeFeet = scalar(feet[1]),
      inches = scalar(feet[2]);
    if (wholeFeet === undefined || inches === undefined || inches >= 12)
      return undefined;
    return validMeters(wholeFeet * 0.3048 + inches * 0.0254);
  }
  const match = input.match(
    new RegExp(`^(${NUMBER})\\s*([a-z]+|["'])?\\.?$`, "i"),
  );
  if (!match) return undefined;
  const number = scalar(match[1]),
    factor = unitFactor(match[2] ?? unitHint);
  return validMeters(
    number === undefined || factor === undefined ? undefined : number * factor,
  );
}

function dimensionLabel(
  value: unknown,
): { field: DimensionField; unit?: string } | null {
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .match(
      /^(?:(?:overall|assembled|product)\s+)?(width|depth|height|w|d|h)(?:\s*\(([^)]+)\))?$/i,
    );
  if (!match) return null;
  const aliases: Record<string, DimensionField> = {
    w: "width",
    d: "depth",
    h: "height",
    width: "width",
    depth: "depth",
    height: "height",
  };
  return {
    field: aliases[match[1].toLowerCase()],
    ...(unitFactor(match[2]) ? { unit: match[2] } : {}),
  };
}
function rawEvidence(value: unknown): string {
  try {
    return (typeof value === "string" ? value : JSON.stringify(value)).slice(
      0,
      160,
    );
  } catch {
    return "";
  }
}
function safeUrl(value: unknown, base: string): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
function typeIs(value: unknown, type: string): boolean {
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    (entry) =>
      typeof entry === "string" &&
      (entry === type ||
        entry.endsWith(`/${type}`) ||
        entry.endsWith(`#${type}`)),
  );
}

/** Reads only Product fields, never nested image, packaging, offer, or shipping dimensions. */
export function extractProductCandidates(
  html: string,
  sourceUrl: string,
): ProductImportResult {
  if (html.length > MAX_HTML_LENGTH)
    throw new Error("The product page is too large.");
  const roots: unknown[] = [];
  const lower = html.toLowerCase();
  let cursor = 0;
  for (let scripts = 0; scripts < 200 && roots.length < 30; scripts++) {
    const start = lower.indexOf("<script", cursor);
    if (start === -1) break;
    const tagEnd = lower.indexOf(">", start + 7);
    if (tagEnd === -1) break;
    const end = lower.indexOf("</script", tagEnd + 1);
    if (end === -1) break;
    cursor = end + 8;
    const attributes = html.slice(start + 7, tagEnd);
    if (
      !/^\s/.test(attributes) ||
      !/\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)(?:\s|$)/i.test(
        attributes,
      )
    )
      continue;
    const content = html.slice(tagEnd + 1, end);
    if (content.length > MAX_JSON_LENGTH) continue;
    try {
      roots.push(JSON.parse(content.trim()));
    } catch {
      /* Malformed metadata never becomes a guessed product. */
    }
  }
  const definitions = new Map<string, Record<string, unknown>>();
  const nodes: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  function visit(value: unknown, depth = 0) {
    if (depth > 12 || nodes.length >= MAX_NODES) return;
    if (Array.isArray(value)) {
      value.slice(0, MAX_NODES).forEach((entry) => visit(entry, depth + 1));
      return;
    }
    const node = record(value);
    if (!node || seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
    if (typeof node["@id"] === "string" && Object.keys(node).length > 1)
      definitions.set(node["@id"], node);
    for (const key of ["@graph", "mainEntity", "hasVariant"])
      visit(node[key], depth + 1);
  }
  roots.forEach((root) => visit(root));
  const resolve = (value: unknown) => {
    const node = record(value);
    return node && typeof node["@id"] === "string"
      ? (definitions.get(node["@id"]) ?? node)
      : node;
  };
  const candidates: ProductCandidate[] = [];
  const added = new Set<string>();
  function addProduct(value: unknown, parent?: Record<string, unknown>) {
    const node = resolve(value);
    if (!node || !typeIs(node["@type"], "Product")) return;
    const name = boundedText(node.name) ?? boundedText(parent?.name);
    if (!name) return;
    const candidate: ProductCandidate = { name, evidence: {} };
    const variantLabel = [
      boundedText(node.color, 60),
      boundedText(node.size, 60),
    ]
      .filter(Boolean)
      .join(" / ");
    if (variantLabel) candidate.variantLabel = variantLabel;
    const sku = boundedText(node.sku, 120);
    const brand =
      boundedText(record(node.brand)?.name, 120) ??
      boundedText(node.brand, 120) ??
      boundedText(record(parent?.brand)?.name, 120) ??
      boundedText(parent?.brand, 120);
    if (sku) candidate.sku = sku;
    if (brand) candidate.brand = brand;
    candidate.url = safeUrl(node.url ?? node["@id"], sourceUrl);
    const image = Array.isArray(node.image) ? node.image[0] : node.image;
    candidate.imageUrl = safeUrl(
      record(image)?.contentUrl ?? record(image)?.url ?? image,
      sourceUrl,
    );
    for (const field of FIELDS) {
      const value = parseDimensionToMeters(resolve(node[field]) ?? node[field]);
      if (value !== undefined) {
        candidate[`${field}M`] = value;
        candidate.evidence[field] = {
          raw: rawEvidence(node[field]),
          source: "json-ld",
        };
      }
    }
    const properties = [node.additionalProperty, node.specification].flatMap(
      (entry) => (Array.isArray(entry) ? entry : entry ? [entry] : []),
    );
    for (const entry of properties.slice(0, 60)) {
      const property = resolve(entry);
      const label = dimensionLabel(property?.name);
      if (!property || !label || candidate[`${label.field}M`] !== undefined)
        continue;
      const value = parseDimensionToMeters(property, label.unit);
      if (value !== undefined) {
        candidate[`${label.field}M`] = value;
        candidate.evidence[label.field] = {
          raw: rawEvidence(property.value),
          source: "json-ld",
        };
      }
    }
    const key = JSON.stringify([
      candidate.name,
      candidate.variantLabel,
      candidate.sku,
      candidate.url,
      candidate.widthM,
      candidate.depthM,
      candidate.heightM,
    ]);
    if (!added.has(key) && candidates.length < MAX_CANDIDATES) {
      added.add(key);
      candidates.push(candidate);
    }
  }
  for (const node of nodes) {
    if (Array.isArray(node.hasVariant))
      node.hasVariant
        .slice(0, MAX_CANDIDATES)
        .forEach((variant) => addProduct(variant, node));
    if (!node.hasVariant) addProduct(node);
  }
  // A uniquely matching variant URL is reliable; identical parent URLs are not variant identifiers.
  const normalizeUrl = (value: string) => {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    url.searchParams.sort();
    return url.href;
  };
  const matches = candidates.filter(
    (candidate) =>
      candidate.url && normalizeUrl(candidate.url) === normalizeUrl(sourceUrl),
  );
  const selected =
    matches.length === 1 &&
    candidates.some((candidate) => candidate.url !== matches[0].url)
      ? matches
      : candidates;
  const warnings: string[] = [];
  if (!selected.length)
    warnings.push(
      "Product dimensions were not found. Enter them or paste the specifications.",
    );
  else if (
    selected.some((candidate) =>
      FIELDS.some((field) => candidate[`${field}M`] === undefined),
    )
  )
    warnings.push("Some dimensions are missing. Check them before saving.");
  if (selected.length > 1) warnings.push("Choose the product variant.");
  return { sourceUrl, candidates: selected, warnings };
}

/** Only explicitly labelled W/D/H values or an explicit W × D × H order are accepted. */
export function parsePastedSpecifications(
  text: string,
): Partial<Pick<ProductCandidate, "widthM" | "depthM" | "heightM">> {
  if (text.length > 20_000) return {};
  const result: Partial<
    Pick<ProductCandidate, "widthM" | "depthM" | "heightM">
  > = {};
  const lines = normalize(text)
    .split(/[\n;]+/)
    .filter(
      (line) => !/\b(package|packaged|shipping|carton|box)\b/i.test(line),
    );
  for (const line of lines) {
    const labels = [
      ...line.matchAll(
        /\b(width|depth|height|w|d|h)\s*(?:\(([^)]+)\))?\s*[:=]\s*/gi,
      ),
    ];
    labels.forEach((match, index) => {
      const label = dimensionLabel(
        match[1] + (match[2] ? ` (${match[2]})` : ""),
      );
      if (!label) return;
      const end = labels[index + 1]?.index ?? line.length;
      const value = line
        .slice(match.index! + match[0].length, end)
        .replace(/\s*[x×,]\s*$/, "")
        .trim();
      const parsed = parseDimensionToMeters(value, label.unit);
      if (parsed !== undefined) result[`${label.field}M`] = parsed;
    });
    const ordered = line.match(
      new RegExp(
        `(?:dimensions?\\s*)?\\(?\\s*W\\s*[x×]\\s*D\\s*[x×]\\s*H\\s*\\)?\\s*[:=]?\\s*(${NUMBER})\\s*[x×]\\s*(${NUMBER})\\s*[x×]\\s*(${NUMBER})\\s*([a-z]+|["'])\\s*$`,
        "i",
      ),
    );
    if (ordered)
      FIELDS.forEach((field, index) => {
        const value = parseDimensionToMeters(ordered[index + 1], ordered[4]);
        if (value !== undefined) result[`${field}M`] = value;
      });
  }
  return result;
}
