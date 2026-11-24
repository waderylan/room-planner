# Security and operating limits

## Audit scope — 2026-11-24

Source review, adversarial fixture tests, dependency audit, independent second review, production configuration checks, and isolated browser/API smoke tests covered:

- Public product imports, URL/redirect handling, metadata parsing and resource bounds.
- Invitation capabilities, snapshots, votes, comments, revocation and expiry races.
- Browser rendering, SVG export, imported documents, persistence and provider credentials.
- Local-only Codex relay, Node upload handling, deployment configuration and CI.

This is an application audit, not an independent penetration-test certification or a promise that no vulnerabilities remain. Live checks use synthetic designs and revoke their invitations; no customer documents or provider inference are used.

## Findings and corrections

| Finding | Impact | Correction |
| --- | --- | --- |
| Public historical Worker URLs run old code against production bindings | Previous code could bypass newly deployed controls | Disabled version URLs in Cloudflare and set `preview_urls: false`; deployment policy rejects enabling them |
| Revocation/expiry checked before asynchronous writes | A delayed request could write after access ended | SQL mutations require a live invitation at write time; race regressions cover participants, votes and comments |
| Slow uploads, upstream responses and cancellation callbacks | Requests could remain active beyond intended deadlines | Absolute deadlines, bounded readers, chunk caps, abort races and nonblocking cancellation |
| Deep/cyclic dimension metadata and repeated products | Parser stack or CPU exhaustion | Depth/cycle checks and processing budgets; hostile metadata regressions |
| Unbounded provider/sharing responses | Memory exhaustion before JSON parsing | Bounded response parsing with cancellation and request timeouts |
| Invalid Unicode/XML in names | Shared SVG views could crash | Normalize invalid XML characters and lone surrogates at the export boundary |
| Failed recovery-copy writes for unreadable designs | Original browser data could be overwritten | Refuse replacement until recovery succeeds; retain export/retry paths |
| Unreadable legacy provider settings | Old plaintext keys could remain in browser storage | Remove unreadable legacy settings without copying potential secrets into recovery storage |
| Missing aggregate admission limits and expensive expiry scans | Anonymous traffic could exhaust free quotas quickly | Atomic daily/IP counters, early route rejection and indexed expiry cleanup |

Additional controls include a production browser CSP, API framing/content-type/referrer restrictions, rejection of upstream redirects for model providers, no ambient provider cookies/referrers, exact retailer/redirect allowlists, parameterized SQL, pinned CI action revisions, and a CI dependency vulnerability check. CORS is a browser boundary, not authentication; non-browser clients can imitate request headers.

## Free-only operation

- Keep the account on **Workers Free**. This application never subscribes to or upgrades a Cloudflare plan. The deployment policy permits only the reviewed existing D1 binding and rejects additional products, public version URLs, source maps and observability.
- Application admission stops at **5,000 API requests per UTC day**, shared across Worker locations and persisted in D1. It returns `503` with `Retry-After` until the next UTC day. Per-IP admission stops at **60 requests per minute** with `429`.
- Database failures and exhausted counters fail closed; they do not skip controls or enable a paid fallback. Invalid routes, methods, origins and preflights do no database work.
- Admission counters cap accepted application work, **not every Cloudflare invocation or database operation**. Rejected traffic still uses provider quotas. Application controls do not guarantee zero charges on a Paid account.
- On Workers Free, Cloudflare enforces the provider's request/CPU/database/storage caps by refusing work. The limits are shared with other applications in the same account. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 pricing and quota behavior](https://developers.cloudflare.com/d1/platform/pricing/).
- The deployed OAuth login cannot read billing subscriptions: the billing API returned `403`. Billing Read is not offered by Wrangler's login scopes. Account-owner confirmation of **Workers Free ($0)** is therefore required; a Worker setting named `standard` does not prove Free or Paid. A paid-plan spending limit is not a substitute for Free because it excludes subscription fees and blocking is delayed.
- No repository configuration can stop an account owner from later changing a provider plan or changing provider terms. Recheck the account's plan before authorizing hosting changes; never enable a paid plan to make a quota error disappear.

The existing storage caps remain 500 active invitations, four layouts/250 KB per invitation, 500 participants and 200 comments. Invitations expire after 30 days and may be revoked. Server-stored capability values are hashes; browser storage retains the usable owner/participant keys. Public links contain no management secret.

## Remaining trust boundaries

- Personal designs and furniture persist in browser storage. Using the optional assistant sends active-room/tool context to the selected provider; local Codex sends it through local Kessel. Publishing a snapshot intentionally makes it available to anyone possessing its invite link. A participant name is self-claimed, and one browser vote is not a verified-person voting system.
- All project sites under `waderylan.github.io` share a browser origin. Another compromised app under that origin could read this app's local storage. The CSP here cannot constrain another page on that origin. A dedicated frontend origin is the mitigation; changing origins requires an explicit migration of existing designs, inventory and invitation management keys. The audit does not silently strand existing browser data by moving hosts.
- GitHub Pages does not provide application-controlled response headers, so the frontend's meta CSP cannot enforce `frame-ancestors`. The JSON API does reject framing. Before a commercial SaaS launch, move the frontend to a dedicated host that supports security response headers and permits that use; [GitHub Pages policy](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) excludes commercial SaaS hosting.
- Anonymous endpoints can suffer spam or quota exhaustion despite rate limits. On Free, availability is deliberately sacrificed instead of upgrading. Upstream retailers can block imports or omit dimensions; manual entry remains available.
- Codex/Kessel and provider credentials are not deployed to Cloudflare. The local relay remains loopback-only and is absent from the production Worker bundle. Automated local test servers must be stopped after verification.

## Verification and future changes

Run `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, and `npm audit --audit-level=high`. `npm run check:deployment` runs during builds and Worker deploys. Keep all CI actions pinned to reviewed full commit hashes.

For backend changes, apply reviewed migrations with `npm run migrate:service`, then `npm run deploy:service`. Verify API health, product import and synthetic invitation lifecycle against production. Confirm version URLs remain disabled. Frontend publication waits for CI verification.

Do not publish credentials, capability values, browser storage or private documents in bug reports. Report reproducible vulnerabilities privately to the repository owner before publishing exploit details.
