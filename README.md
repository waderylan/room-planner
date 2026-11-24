# Room Planner

A local-first room planner with measured 2D editing, 3D walkthroughs, a saved design library, and an optional room-editing assistant. No account or backend is required to plan and save rooms.

## Run

Node.js 22.13+ is required, including the built-in SQLite module.

```sh
npm ci
npm run dev
```

Open the printed local URL. A room preset opens directly in the editor; **New design** opens an empty room. Click the design name to rename it. Existing documents from the earlier app migrate into the library automatically.

## Local Codex through Kessel

With Kessel configured and Codex logged in:

```sh
npm run dev:codex
```

The launcher uses `kessel` on PATH, then a sibling `../kessel/.venv` checkout. Set `KESSEL_EXECUTABLE` to select another executable. On Rylan Wade's machine the sibling checkout is `C:\Users\Rylan Wade\Desktop\kessel`.

The equivalent explicit PowerShell command is:

```powershell
& 'C:\Users\Rylan Wade\Desktop\kessel\.venv\Scripts\kessel.exe' run --provider codex -- npm run dev
```

Open **Assistant** in the editor. **Assistant settings** shows the connection and models actually returned by Kessel. Kessel supplies `OPENAI_BASE_URL` and `OPENAI_API_KEY` to the local Node process; the browser never receives the gateway key. The Vite middleware accepts only local, same-origin requests and forwards only to Kessel's loopback Codex route. It is absent from production builds.

The assistant reads the active room, uses validated placement tools, checks overlaps, and sends tool results back to Codex until the task finishes. Stop cancels the request. Switching rooms or designs aborts the active task so late responses cannot edit another room. Each room retains its conversation and draft in tab memory, including when the panel closes. Failed requests restore the submitted text for retry. Settings apply on Done; Cancel leaves the connection unchanged. Changes remain undoable.

Anthropic, OpenAI, and Gemini remain available using a user-supplied API key. Those keys exist only in the current tab's memory and requests go directly to the selected provider. Earlier persisted API keys are removed on startup. Local Kessel is for development on your machine; static hosting does not connect to a visitor's local Codex session.

## Planning

- Create, search, rename, duplicate, and delete independent designs. Each design can contain multiple rooms.
- Edit rectangular and L-shaped rooms, alcoves, ceilings, windows, and doors. Convert between feet and meters without changing physical dimensions.
- Search furniture by name or category. Adding pieces keeps the catalog and filters in place; selecting an existing piece opens its inspector. Drag, resize, rotate, and edit exact dimensions and positions.
- Inspect wall clearances and furniture collisions. Rugs, hidden pieces, and vertically separated objects do not create false collisions.
- Undo and redo edits. Property changes group into short editing steps.
- Switch between a 2D floor plan, 3D orbit view, and a first-person walkthrough.
- Export a JSON design backup or a standalone SVG floor plan from either view. The floor plan always includes the complete room, independent of zoom and appearance. Import JSON as a separate design.
- Use light or dark appearance, keyboard navigation, or the mobile tools drawer.

Designs are stored in this browser on this device. Autosave reports failures, flushes when the page closes, and blocks stale tabs from overwriting newer saves. Download backups for portability or before clearing browser data. If another tab has changed the library, export the unsaved work and reload the stale tab. Unreadable library data is retained under `room-planner:library:recovery`.

## My furniture

Open **My furniture** from the design library or the editor's furniture panel. Create a measured item, set its quantity, or save an existing room item from its inspector. The inventory is shared across local designs. Editing an inventory entry does not silently resize pieces already placed in a room.

**Import link** reads public product specifications without an LLM. Paste a furniture product URL, select a variant when present, and confirm the name, width, depth, and height before saving. The service reads structured product data and recognizable dimension labels; it does not execute a retailer's JavaScript or bypass access restrictions. For blocked pages, missing dimensions, or ambiguous variants, paste the specifications or enter measurements directly. Review dimensions against the manufacturer's selected variant.

Inventory entries preserve product source links when available. Inventory export/import provides a separate backup for owned furniture; design JSON exports remain independent.

## Compare apartments

Save each candidate apartment as a separate measured design. Open **Compare apartments**, select up to four designs, and assign inventory pieces to rooms. Quantities are reused consistently in every candidate.

**Try my furniture** creates a temporary placement trial. The comparison distinguishes placed pieces, missing placements, dimension changes, pieces too large or tall, and unresolved layouts. A bounded placement search can miss a workable arrangement; **Needs layout** is not proof that an item cannot fit. Door transport, assembly, and building access are not assessed.

Save a trial as an independent design to refine it. Original candidate plans stay intact. **Share options** publishes the displayed options, including current trials, for voting and comments.

## Shared layout invitations

Use **Share layouts** to publish one to four options. Visitors can view measured room plans, switch rooms, and copy an option into their own local library. A display name is requested only when voting or commenting. Shared snapshots do not update when the original design changes; publish another invitation for a revision.

- Anyone with the public link can view its snapshots and feedback. Names are self-claimed. Each browser participant has one replaceable vote; this does not verify one vote per person.
- Creator and participant capabilities are random secrets stored on the current device, separately from design documents. Public links contain only the invitation ID. The backend stores secret hashes. Clearing device storage removes local management access; storage failures are reported and retain capabilities only in the current tab.
- The creator can revoke a link from the creating device. Invitations expire after 30 days. New invitation creation removes expired and revoked records with their feedback.
- Invitations allow four options within 250 KB, 500 participants, and 200 comments. The service caps active invitations at 500 and applies persistent hourly request limits. Comments retry with a stable identifier to avoid duplicate posts after network failures.
- Feedback refreshes every eight seconds while the invitation is visible. Copying a shared option makes an independent local design.

Invitations require the backend below for access across devices. Personal libraries and furniture inventories remain local; there are no accounts or automatic design sync.

## Backend

`npm run dev` includes product import and the sharing API through Vite. It initializes a durable SQLite database at `.room-planner/service.sqlite`; `ROOM_PLANNER_DATA_DIR` selects another data directory. This database contains published snapshots, participants, votes, comments, and rate limits. It must not be committed or served as static content.

To run the local API separately:

```sh
npm run dev:service
```

The standalone service binds to `127.0.0.1:8788`; `PORT` changes the port. Set `VITE_SERVICE_URL=http://127.0.0.1:8788` before starting the frontend to use it. `/api/health` checks database connectivity. Local service requests accept loopback frontend origins. Kessel remains a separate development-only relay and is never exposed by this backend.

### Cloudflare Worker and D1

The repository includes a Worker entry point and a D1 migration. A real Cloudflare database must be provisioned before deployment; the repository does not include a fabricated database binding or claim a deployed API.

```sh
npx wrangler login
npx wrangler d1 create room-planner-service --binding DB --update-config
npm run migrate:service
npm run deploy:service
```

The create command adds the real `DB` binding and database ID to `wrangler.jsonc`. D1 uses the default `migrations/` directory, containing `0001_sharing.sql`. Apply migrations before deploying. See the [Cloudflare D1 command reference](https://developers.cloudflare.com/d1/wrangler-commands/) for provisioning and migration options.

Set `ALLOWED_ORIGINS` in `wrangler.jsonc` to the exact frontend origins, comma-separated with no URL paths. The default is `https://waderylan.github.io`. Cross-origin mutations require the application header and JSON requests; creator and participant actions also validate their bearer capabilities. Do not add Kessel credentials, provider keys, or device capabilities to Worker configuration.

Set the public Worker origin as `VITE_SERVICE_URL` when building the frontend. For GitHub Pages, set the repository Actions variable `ROOM_PLANNER_SERVICE_URL` to that origin and rerun the Pages deployment. No service credential belongs in this variable. A static build without a configured backend still supports local planning, inventory, and comparisons; link import and invitations need a reachable API.

## Shortcuts

| Shortcut                   | Action                                           |
| -------------------------- | ------------------------------------------------ |
| Ctrl/Cmd Z                 | Undo                                             |
| Ctrl/Cmd Shift Z or Ctrl Y | Redo                                             |
| Ctrl/Cmd S                 | Save locally                                     |
| Ctrl/Cmd D                 | Duplicate selected furniture                     |
| R                          | Rotate selected furniture 90°                    |
| Arrow keys                 | Move selected furniture; Shift for a larger step |
| Delete / Backspace         | Delete selected furniture                        |
| Escape                     | Deselect / close dialog / release pointer lock   |
| Alt + drag                 | Move without grid snapping                       |
| Scroll                     | Zoom                                             |
| Space + drag / middle drag | Pan                                              |

## Verify

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Core tests cover validation, unit conversion, geometry, placement, library migration, storage errors, history, inventory, apartment fit comparisons, deterministic product parsing, sharing capabilities, quotas, and assistant cancellation/tool execution. Sharing tests use real SQLite, including reopen persistence and concurrent creation limits. Browser tests cover design management, editing, exports, keyboard dialogs, mobile appearance, assistant tool loops, malformed imports, and stale-tab protection. Browser tests mock the assistant and use no provider quota.

With `npm run dev:codex -- --port 5178 --strictPort` running, this opt-in integration test uses real Codex quota through Kessel:

```sh
npm run test:assistant
```

It edits an isolated in-memory document: desk placement, a furnished bedroom preserving the desk, then metric conversion and desk editing. `ROOM_PLANNER_URL` selects another local app URL; `ROOM_PLANNER_MODEL` selects an ID returned by Kessel. No browser designs are changed.

## Deploy

```sh
npm run build
npm run preview
```

Publish `dist/` to a static host. The default base path is `/`; set `BASE_PATH=/room-planner/` when building for a subdirectory. Hash navigation works without server rewrite rules. The included GitHub Pages workflow builds with `/room-planner/`; the checks workflow runs core and browser tests. Local planning requires no account or API key. Deploy the backend separately for link import and shared feedback.

The 3D renderer loads only when requested. WebGL support is required for 3D; 2D planning remains available without it. Personal designs stay device-local. Shared invitations publish explicit snapshots and persist feedback in the service database.

## Source

- `src/model/`: versioned documents, validation/migration, templates, presets, unit conversion, collision rules.
- `src/geometry/`: polygon, clearance, outline, and opening math.
- `src/store/`: document library, history, persistence, view preferences, and assistant settings.
- `src/components/`: library, 2D/3D editor, contextual tools, assistant, and accessible primitives.
- `src/llm/`: provider adapters, bounded agent loop, validated tools, and placement logic.
- `server/kesselPlugin.ts`: development-only local Codex relay.
- `src/inventory/`: owned furniture persistence, unit conversion, and apartment fit analysis.
- `src/productImport/`, `server/productImport/`: product URL validation, deterministic specification parsing, and bounded retrieval.
- `src/sharing/`, `server/sharing/`: validated public snapshots, device capabilities, votes, comments, and durable SQL schema.
- `server/service/`: local SQLite adapters, request routing, and the Cloudflare Worker entry point.
- `migrations/`: versioned D1 schema migrations.
- `tests/`: deterministic core and browser tests.

React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Three.js / React Three Fiber, and Phosphor icons. Shared contributor instructions live in [AGENTS.md](AGENTS.md).
