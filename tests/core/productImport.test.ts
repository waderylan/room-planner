import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  extractProductCandidates,
  parseDimensionToMeters,
  parsePastedSpecifications,
} from "../../src/productImport/parser";
import { ProductImportError } from "../../src/productImport/types";
import {
  handleProductImport,
  importProductFromUrl,
  validateProductUrl,
} from "../../server/productImport/handler";

const source = "https://www.ikea.com/us/en/p/lack-side-table-white-30449908/";
const fixture = (name: string) =>
  readFileSync(
    new URL(`../fixtures/productImport/${name}.html`, import.meta.url),
    "utf8",
  );
const close = (actual: number | undefined, expected: number) =>
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-9,
    `${actual} != ${expected}`,
  );
const html = (metadata: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(metadata)}</script>`;
const fakeFetch = (
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) => ((url, init) => handler(String(url), init)) as typeof fetch;

test("fractional, metric, and Schema.org dimensions normalize to meters without guessing units", () => {
  close(parseDimensionToMeters('21 5/8 "'), 0.549275);
  close(parseDimensionToMeters("21⅝″"), 0.549275);
  close(parseDimensionToMeters("5' 6\""), 1.6764);
  close(parseDimensionToMeters({ value: 80, unitCode: "CMT" }), 0.8);
  close(parseDimensionToMeters({ value: 800, unitCode: "MMT" }), 0.8);
  close(parseDimensionToMeters({ value: 2, unitCode: "FOT" }), 0.6096);
  close(parseDimensionToMeters({ value: 24, unitCode: "INH" }), 0.6096);
  close(parseDimensionToMeters({ value: 0.8, unitCode: "MTR" }), 0.8);
  assert.equal(parseDimensionToMeters("80"), undefined);
  assert.equal(parseDimensionToMeters(80), undefined);
  for (const value of [
    "80–90 cm",
    "80 x 35 x 32 in",
    "1200 px",
    "-5 cm",
    "0 cm",
    "1/0 in",
    "5 apples",
    "Infinity m",
  ])
    assert.equal(parseDimensionToMeters(value), undefined);
  assert.equal(
    parseDimensionToMeters({ minValue: 80, maxValue: 90, unitCode: "CMT" }),
    undefined,
  );
});

test("IKEA product metadata supplies real product dimensions, not image or package sizes", () => {
  const result = extractProductCandidates(fixture("ikea-lack"), source);
  assert.equal(result.candidates.length, 1);
  const product = result.candidates[0];
  assert.equal(product.name, "LACK side table, white");
  assert.equal(product.sku, "30449908");
  assert.equal(product.brand, "IKEA");
  close(product.widthM, 0.549275);
  close(product.depthM, 0.549275);
  close(product.heightM, 0.45085);
  assert.equal(product.evidence.width?.source, "json-ld");
  assert.deepEqual(result.warnings, []);
});

test("graph references and explicit additional properties preserve distinct product variants", () => {
  const result = extractProductCandidates(
    fixture("variants"),
    "https://www.ikea.com/desk/",
  );
  assert.equal(result.candidates.length, 2);
  close(
    result.candidates.find((candidate) => candidate.sku === "SMALL")?.widthM,
    1,
  );
  close(
    result.candidates.find((candidate) => candidate.sku === "LARGE")?.widthM,
    1.4,
  );
  assert.ok(result.warnings.includes("Choose the product variant."));
  const direct = extractProductCandidates(
    fixture("variants"),
    "https://www.ikea.com/desk/large/",
  );
  assert.equal(direct.candidates.length, 1);
  assert.equal(direct.candidates[0].sku, "LARGE");
});

test("missing, malformed and ambiguous metadata remains missing instead of becoming generic sizes", () => {
  const result = extractProductCandidates(
    html({
      "@type": "Product",
      name: "Sofa",
      image: { width: 1200, height: 800 },
      shippingDetails: { width: "90 cm", depth: "40 cm", height: "50 cm" },
      additionalProperty: [{ name: "Package width", value: "90 cm" }],
    }),
    source,
  );
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].widthM, undefined);
  assert.equal(result.candidates[0].heightM, undefined);
  assert.ok(result.warnings.length);
  assert.equal(
    extractProductCandidates(
      '<script type="application/ld+json">{broken</script><title>Room decor</title>',
      source,
    ).candidates.length,
    0,
  );
  assert.equal(
    extractProductCandidates(
      html({
        "@type": "ImageObject",
        name: "Picture",
        width: "1200 cm",
        height: "800 cm",
      }),
      source,
    ).candidates.length,
    0,
  );
  assert.throws(
    () => extractProductCandidates("x".repeat(2_000_001), source),
    /too large/,
  );
});

test("same-name color variants remain separate and pathological script markup stays bounded", () => {
  const variants = extractProductCandidates(
    html({
      "@type": "ProductGroup",
      name: "Chair",
      hasVariant: [
        {
          "@type": "Product",
          name: "Chair",
          color: "Blue",
          width: "50 cm",
          depth: "55 cm",
          height: "80 cm",
        },
        {
          "@type": "Product",
          name: "Chair",
          color: "Red",
          width: "50 cm",
          depth: "55 cm",
          height: "80 cm",
        },
      ],
    }),
    source,
  );
  assert.deepEqual(
    variants.candidates.map((candidate) => candidate.variantLabel),
    ["Blue", "Red"],
  );
  assert.equal(variants.candidates.length, 2);
  assert.equal(
    extractProductCandidates("<script>".repeat(50_000), source).candidates
      .length,
    0,
  );
});

test("pasted specifications require labels or an explicit dimension order and exclude package data", () => {
  const product = parsePastedSpecifications(
    'Width: 21 5/8 "\nDepth: 21 5/8 "\nHeight: 17 3/4 "',
  );
  close(product.widthM, 0.549275);
  close(product.depthM, 0.549275);
  close(product.heightM, 0.45085);
  assert.deepEqual(parsePastedSpecifications("W x D x H: 80 x 60 x 75 cm"), {
    widthM: 0.8,
    depthM: 0.6,
    heightM: 0.75,
  });
  assert.deepEqual(
    parsePastedSpecifications(
      "Width (cm): 80; Depth (cm): 60; Height (cm): 75",
    ),
    { widthM: 0.8, depthM: 0.6, heightM: 0.75 },
  );
  assert.deepEqual(parsePastedSpecifications("80 x 60 x 75 cm"), {});
  assert.deepEqual(
    parsePastedSpecifications("Package Width: 80 cm\nShipping Height: 90 cm"),
    {},
  );
});

test("retailer URLs reject private hosts, credentials, unsafe protocols, ports, and hostname tricks", () => {
  assert.equal(validateProductUrl(source).hostname, "www.ikea.com");
  for (const url of [
    "http://www.ikea.com/product",
    "https://127.0.0.1/",
    "https://localhost/",
    "https://www.ikea.com.evil.test/",
    "https://www.ikea.com@127.0.0.1/",
    "https://user:pass@www.ikea.com/product",
    "https://www.ikea.com:8443/product",
    "file:///etc/passwd",
    "https://www.ikea.com./product",
  ])
    assert.throws(() => validateProductUrl(url), ProductImportError);
});

test("fetching revalidates every redirect and never sends browser credentials upstream", async () => {
  const calls: string[] = [];
  const result = await importProductFromUrl(source, {
    fetchImpl: fakeFetch((url, init) => {
      calls.push(url);
      assert.equal(init?.redirect, "manual");
      assert.equal(init?.credentials, "omit");
      assert.equal(new Headers(init?.headers).get("cookie"), null);
      return new Response(fixture("ikea-lack"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }),
  });
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(calls, [source]);
  await assert.rejects(
    importProductFromUrl(source, {
      fetchImpl: fakeFetch(
        () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://127.0.0.1/admin" },
          }),
      ),
    }),
    (error: unknown) =>
      error instanceof ProductImportError && error.code === "blocked",
  );
  let redirects = 0;
  await assert.rejects(
    importProductFromUrl(source, {
      fetchImpl: fakeFetch(() => {
        redirects++;
        return new Response(null, {
          status: 302,
          headers: { location: "/another-page" },
        });
      }),
    }),
    /could not be followed/,
  );
  assert.equal(redirects, 4);
});

test("blocked, oversized and non-HTML sources return bounded typed failures", async () => {
  for (const [response, code] of [
    [new Response("Private diagnostics", { status: 403 }), "blocked"],
    [
      new Response("{}", { headers: { "content-type": "application/json" } }),
      "unsupported",
    ],
    [
      new Response("x", {
        headers: { "content-type": "text/html", "content-length": "2000001" },
      }),
      "oversized",
    ],
    [
      new Response("x".repeat(2_000_001), {
        headers: { "content-type": "text/html" },
      }),
      "oversized",
    ],
  ] as const) {
    await assert.rejects(
      importProductFromUrl(source, { fetchImpl: fakeFetch(() => response) }),
      (error: unknown) =>
        error instanceof ProductImportError &&
        error.code === code &&
        !error.message.includes("Private diagnostics"),
    );
  }
});

test("retailer timeouts and caller cancellation stop the import", async () => {
  const waitForAbort = fakeFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        );
      }),
  );
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(
      importProductFromUrl(source, { fetchImpl: waitForAbort, timeoutMs: 10 }),
      (error: unknown) =>
        error instanceof ProductImportError && error.code === "timeout",
    );
    const controller = new AbortController();
    const pending = importProductFromUrl(source, {
      fetchImpl: waitForAbort,
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
  } finally {
    clearTimeout(keepAlive);
  }
});

test("handler validates requests and returns product data without upstream HTML", async () => {
  const make = (
    body: string,
    headers: HeadersInit = { "content-type": "application/json" },
  ) =>
    new Request("http://localhost/api/furniture/import", {
      method: "POST",
      headers,
      body,
    });
  const options = {
    fetchImpl: fakeFetch(
      () =>
        new Response(fixture("ikea-lack"), {
          headers: { "content-type": "text/html" },
        }),
    ),
  };
  const result = await handleProductImport(
    make(JSON.stringify({ url: source })),
    options,
  );
  assert.equal(result.status, 200);
  const data = await result.text();
  assert.match(data, /LACK side table/);
  assert.doesNotMatch(data, /<html>|<script>/);
  assert.equal(
    (await handleProductImport(make("{broken"), options)).status,
    400,
  );
  assert.equal(
    (
      await handleProductImport(
        make(
          JSON.stringify({ url: source, headers: { cookie: "not-forwarded" } }),
        ),
        options,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleProductImport(
        make("{}", { "content-type": "text/plain" }),
        options,
      )
    ).status,
    415,
  );
  assert.equal(
    (await handleProductImport(make("x".repeat(8193)), options)).status,
    413,
  );
});
