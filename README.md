# Room Planner

A local-first room planner with measured 2D editing, 3D walkthroughs, a saved design library, and an optional room-editing assistant. No account or backend is required to plan and save rooms.

## Run

Node.js 22.12+ is required.

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

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd Z | Undo |
| Ctrl/Cmd Shift Z or Ctrl Y | Redo |
| Ctrl/Cmd S | Save locally |
| Ctrl/Cmd D | Duplicate selected furniture |
| R | Rotate selected furniture 90° |
| Arrow keys | Move selected furniture; Shift for a larger step |
| Delete / Backspace | Delete selected furniture |
| Escape | Deselect / close dialog / release pointer lock |
| Alt + drag | Move without grid snapping |
| Scroll | Zoom |
| Space + drag / middle drag | Pan |

## Verify

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Core tests cover validation, unit conversion, geometry, placement, library migration, storage errors, history, and assistant cancellation/tool execution. Browser tests cover design management, editing, exports, keyboard dialogs, mobile appearance, assistant tool loops, malformed imports, and stale-tab protection. Browser tests mock the assistant and use no provider quota.

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

Publish `dist/` to a static host. The default base path is `/`; set `BASE_PATH=/room-planner/` when building for a subdirectory. Hash navigation works without server rewrite rules. The included GitHub Pages workflow builds with `/room-planner/`; the checks workflow runs core and browser tests. No runtime secrets or accounts are needed.

The 3D renderer loads only when requested. WebGL support is required for 3D; 2D planning remains available without it. Storage is device-local, with no cross-device sync or collaboration.

## Source

- `src/model/`: versioned documents, validation/migration, templates, presets, unit conversion, collision rules.
- `src/geometry/`: polygon, clearance, outline, and opening math.
- `src/store/`: document library, history, persistence, view preferences, and assistant settings.
- `src/components/`: library, 2D/3D editor, contextual tools, assistant, and accessible primitives.
- `src/llm/`: provider adapters, bounded agent loop, validated tools, and placement logic.
- `server/kesselPlugin.ts`: development-only local Codex relay.
- `tests/`: deterministic core and browser tests.

React 19, TypeScript, Vite, Tailwind CSS 4, Zustand, Three.js / React Three Fiber, and Phosphor icons. Shared contributor instructions live in [AGENTS.md](AGENTS.md).
