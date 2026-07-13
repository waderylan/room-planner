# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repo. See `README.md` for the
user-facing feature tour and `ROOM_PLANNER_SPEC.md` for the full product spec.

## What this is

A client-only 2D + 3D room and furniture planner. Everything runs in the browser — there is
no backend. State lives in a Zustand store and persists to `localStorage`; documents can also
be saved/loaded as JSON files. An optional LLM chat assistant edits the room through tools,
calling provider APIs directly from the browser with a user-supplied API key.

## Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # tsc -b (strict typecheck) then vite build — run this to verify a change
npm run lint      # oxlint
npm run preview   # serve the production build
```

There is no test runner. `npm run build` is the gate — TypeScript is strict and the build
fails on type errors. `src/geometry/selfTest.ts` holds runtime assertions for the geometry
math rather than a formal test suite.

## Stack

Vite 8, React 19, TypeScript (strict), Tailwind CSS v4 (via `@tailwindcss/vite`), Zustand for
state, hand-rolled SVG for the 2D editor, `@react-three/fiber` + `@react-three/drei` (Three.js)
for the 3D view, `@phosphor-icons/react` for icons. Tailwind is configured through the Vite
plugin — there is no `tailwind.config.js`.

## Architecture

- `src/model/` — the document data model (`types.ts`: `Doc` → `Room[]` → `Item[]`), factories,
  furniture `presets.ts`, free-spot search, and `migrate.ts` (`safeParseDoc` validates/upgrades
  loaded JSON; `Doc.version` is currently 4 — bump it and add a migration when the shape changes).
- `src/geometry/` — pure, framework-free math: polygon ops, room outline construction from
  `shape` + `alcoves`, L-shape handling, wall openings (windows/doors) with reclamping,
  clearance measurement, overlap/bounds tests. Prefer adding geometry here (with a self-test)
  over inlining math in components.
- `src/store/` — Zustand store (`store.ts`) is the single source of truth for the doc plus UI
  state (theme, view mode, camera mode, snap, toasts). `persistence.ts` debounces autosave to
  `localStorage`. `settingsStore.ts` is a separate store for LLM provider/model/API-key config.
- `src/components/Canvas2D/` — the SVG 2D editor (pan/zoom via viewBox, drag, rotate, grid,
  measurements). `src/components/View3D/` — the Three.js scene (walls, floor, furniture meshes,
  orbit + first-person walk controls). `src/components/ui/` — shared primitives.
- `src/llm/` — the chat assistant. `agent.ts` runs the tool-use loop with a system prompt;
  `tools.ts` defines the tools; `toolExecutor.ts` applies them to the store; `providers/`
  has one adapter each for Anthropic, OpenAI, and Gemini. Default models are in
  `settingsStore.ts` (`DEFAULT_MODELS`).

## Conventions & gotchas

- **Coordinate frame:** room space is an X/Y grid in the room's unit; X increases east, Y
  increases south (down on screen). An item's `pos` is the footprint's top-left *before*
  rotation; rotation is about the footprint center. This is documented in the `agent.ts` system
  prompt and in `model/types.ts` — keep those in sync if the frame ever changes.
- Rooms can be rectangles or L-shapes and carry alcoves + openings; the `outline` polygon is
  *derived* from `shape`/`alcoves`, so regenerate it (and reclamp openings) whenever those
  change rather than editing `outline` directly.
- Overlap/out-of-bounds checks use real polygon math so they stay correct for rotated and
  L-shaped pieces in non-rectangular rooms — reuse the `geometry/` helpers, don't approximate
  with bounding boxes.
- Units are per-room (`ft` | `m`); dimensions are stored in that unit, not normalized.
- When editing the store, keep mutations inside store actions so autosave and derived state
  stay consistent.
- LLM API keys are user-supplied and kept in `localStorage` only; never hard-code keys or add
  a server-side proxy without discussing it.
