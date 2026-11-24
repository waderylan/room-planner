# Product import

Furniture import uses deterministic metadata and unit parsing. It never calls a model.

- `parser.ts`: bounded Schema.org Product / ProductGroup JSON-LD extraction, graph references, labelled additional properties, explicit units, fractions, and pasted W/D/H specifications.
- `types.ts`: draft candidates with optional measurements, per-field evidence, typed failures, and the fully measured `ConfirmedProduct` callback contract.
- `client.ts`: calls the configured service and validates its response before rendering.
- `../components/ProductImport/ProductImportDialog.tsx`: source link, real variant choice when necessary, editable measurements, manual/specification fallback, and explicit Save furniture.
- `../../server/productImport/handler.ts`: platform-neutral fetch handler; parent service supplies origin controls and persistent rate limiting.

`POST /api/furniture/import` accepts `{ "url": "https://…" }` and returns
`{ sourceUrl, candidates, warnings }`. Candidate dimensions use meters. Missing or ambiguous
measurements stay absent, and saving requires width, depth, height, and a name.

The fetch relay allows exact IKEA, Article, West Elm, Crate & Barrel, CB2, and Wayfair hosts.
It requires HTTPS, rejects credentials/nonstandard ports, revalidates at most three redirects,
and limits retrieval to ten seconds and 2 MB of HTML. It forwards no user cookies or API keys
and returns no page HTML. Being allowlisted does not guarantee a retailer exposes usable data
or permits automated retrieval. Blocked or unsupported pages retain a manual-entry path.

Metadata fields are product dimensions only. Image pixels, shipping measurements, package
sizes, unitless numbers, unlabelled dimension orders, and ranges do not become furniture sizes.
No scripts execute and no external JSON-LD references are fetched. Different color/size
variants remain separate even if their names and dimensions match.

Fixtures and tests live in `tests/fixtures/productImport/` and
`tests/core/productImport.test.ts`. The IKEA LACK test data captures factual dimensions;
the deterministic suite performs no network requests. A live check against
`https://www.ikea.com/us/en/p/lack-side-table-white-30449908/` returned width/depth
`0.549275 m` and height `0.45085 m` during implementation.
