# Shared repository instructions

## Product

- A local-first room planner: independent saved designs, measured 2D editing, 3D views, optional room-editing assistant.
- Preserve existing local designs and backward compatibility. No accounts, billing, or automatic cloud sync. Explicitly published layout snapshots may collect shared votes and comments through invite links.
- Use calm Apple-style product design: system typography, neutral surfaces, one blue accent, restrained motion, deliberate light/dark modes. Text carries names, data, actions, or short reasons. No marketing filler, captions, emoji, or onboarding tours.
- Use Phosphor icons consistently. Native SVG geometry represents actual room/furniture data.

## Commands and verification

```sh
npm ci
npm run dev
npm run dev:codex       # Kessel-managed local Codex, no gateway key in browser
npm test                # deterministic model/store/assistant tests
npm run lint
npm run build           # strict TypeScript + production build
npm run test:e2e        # Playwright Chromium; npx playwright install chromium first
npm run test:assistant  # explicit live Kessel/Codex smoke; consumes provider quota
```

- Require Node 22.13+. The local shared-layout service uses built-in SQLite. Keep package-lock.json in sync with package.json.
- Run meaningful tests appropriate to behavior changes and a production build. Never silently replace a real provider test with mocks; distinguish them in results.
- Static production output lives in `dist/`. `BASE_PATH` configures the build's deployment subdirectory.

## Architecture

- `src/model/types.ts`: version 4 document `Doc -> Room[] -> Item[]`. Derived outlines regenerate from shape and alcoves. Keep validation and migration compatible when extending fields; bump document version for breaking changes.
- `src/geometry/`: framework-independent geometry. Use polygon-aware math for concave rooms and rotated furniture.
- `src/model/collision.ts`: shared collision semantics; respect hidden objects, rugs, elevation, and edge contact across the canvas, placement, and assistant.
- `src/model/units.ts`: full physical unit conversion; presets originate in feet. Never change a room's unit label without converting its data.
- `src/store/store.ts`: single source of truth for documents, projects, undo/redo, and UI state. Mutate documents through actions so history and persistence stay consistent.
- `src/store/persistence.ts`: bounded library parsing, legacy migration, debounced saves, explicit flush, recovery preservation, and stale-tab write protection. Surface errors; never silently discard saves or overwrite unreadable data.
- `src/store/settingsStore.ts`: provider/model preferences persist; API keys stay in tab memory. Never persist secrets or add VITE_ credentials.
- `src/inventory/`: reusable furniture in canonical meters; placed items are independent snapshots linked by inventoryId. Comparisons must check real dimensions and geometry; heuristic search failure means unresolved, never proof that furniture cannot fit.
- `src/productImport/` and `server/productImport/`: deterministic structured-data extraction with editable review, unit conversion, variant handling, bounded retailer requests, and strict redirect/host checks. No LLM for product imports. Never substitute shipping or image dimensions for actual product dimensions.
- `server/service/`: shared API router, local SQLite and Cloudflare D1 adapters. Limit request sizes and rates, allow exact frontend origins, and never expose a general fetch proxy. Vite mounts the local API automatically.
- `server/sharing/` and `src/sharing/`: immutable layout snapshots, anonymous participant capabilities, bounded votes/comments, expiry/revocation. Store capability hashes server-side; never put owner/participant secrets in public invite URLs or public responses. Shared viewers must not mutate local designs until an explicit copy action.
- `src/llm/`: provider adapters, tools with schema validation, room-aware placement, and bounded cancellable tool loop. Abort on project/room switches; check scope after awaits and before every mutation.
- `server/kesselPlugin.ts`: local-only Vite development middleware. Require loopback connections, matching origin, custom application header for mutations, and private process-injected Kessel credentials. Never expose Kessel remotely or include the relay in a static build.
- `src/components/Canvas2D/`: SVG editor with local drag previews and one commit per gesture. Preserve screen/world scale across aspect ratios. Mark handles and other editor-only elements for SVG export.
- `src/components/View3D/`: lazy Three.js scene, orbit/walk controls; cap DPR, render on demand when possible, and preserve 2D fallback.
- `src/main.tsx`: hash-based library/editor navigation. Reuse persisted project IDs across refreshes.

## Coordinate frame

- Each room stores dimensions in its unit (`ft` or `m`); X increases east/right and Y increases south/down.
- Furniture `pos` is the local footprint origin before rotation. Rotation occurs about the footprint centroid; keep assistant instructions and geometry in sync.
- Openings reference outline edge indices and must reclamp when the shape, alcoves, or ceiling changes.

## Repository conventions

- AGENTS.md is canonical. CLAUDE.md contains only `@AGENTS.md`. Use the same paired pattern for any nested instructions.
- Every commit has a concise subject and a body of 1-4 `-` bullet points. No AI co-author trailers or AI-generation statements in PR descriptions.
- Never commit credentials, browser storage, generated builds, browser-test traces, local preview screenshots, or provider account data.
- Hosting must remain on Workers Free with no paid fallback. Never subscribe to or upgrade a Cloudflare plan to resolve a limit. Preserve the strict deployment policy, disabled historical version URLs, and atomic API budgets; provider Free limits are the billing boundary. Read `SECURITY.md` before hosting/security changes.
- Backend changes require reviewed migrations and Worker redeployment; GitHub Pages deploys only the frontend. Stop all temporary local test servers when finished.
- Preserve unrelated work. Keep agent-specific configuration outside shared instructions.
