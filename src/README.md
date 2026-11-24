# src/

Application source. Entry point wires React to the DOM; everything else is organized by
concern into subdirectories, each with its own README.

## Files

- `main.tsx` — React entry point, theme, and hash navigation between the library and lazy editor.
- `App.tsx` — top-level layout. Composes the toolbar, sidebar, 2D/3D canvas (switched by view
  mode), room tabs, chat panel, and settings dialog; owns editor keyboard shortcuts.
- `index.css` — Tailwind v4 import plus the design tokens (`@theme`) and light/dark CSS
  variables used throughout the app.

## Subdirectories

- `components/` — all React UI, grouped by feature (`Canvas2D`, `View3D`, `Sidebar`, `Chat`,
  `Settings`) plus shared `ui/` primitives.
- `geometry/` — pure, framework-free math (polygons, room outlines, clearances, overlap tests).
- `model/` — the document data model, furniture presets, factories, and JSON migration.
- `store/` — Zustand stores and `localStorage` persistence.
- `llm/` — the optional LLM chat assistant: agent loop, tool definitions, placement engine,
  and per-provider API adapters.
