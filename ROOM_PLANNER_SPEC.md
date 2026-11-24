# Room Planner product specification

## Purpose

Plan rooms to scale, try furniture arrangements, inspect clearances, and keep independent designs on the current device.

## Workspace

- The opening screen is the saved design library.
- Start from an empty room or a furnished living room, bedroom, or home office.
- A preset immediately creates and opens the chosen room. Name editing happens in the editor, without a second preset picker.
- Designs have names, real document previews, room counts, areas, and modification dates.
- Search, sort, rename, duplicate, delete, and download designs. Imports create separate designs.
- No accounts or cloud services are required. Local storage failure remains visible and work stays exportable.
- A new or cleared workspace has no saved designs. Duplicating in the library preserves the active design and its undo history.

## Editor

- Measured SVG floor plan with grid snapping, zoom/pan, furniture drag/resize/rotation, and exact numeric editing.
- Rectangular/L-shaped rooms, alcoves, wall windows/doors, ceilings, and multiple rooms per design.
- Physical feet/meter conversion across all room contents.
- Contextual Furniture / Room / Selection panels. Searchable categorized catalog and editable custom footprints.
- Shared polygon-aware collision logic, bounds checking, and clearance measurements. Contact and floor-level rugs are not volumetric overlap errors.
- Bounded undo/redo. Save status, retry, JSON backup, and standalone SVG export.
- Lazy 3D view with orbit/walk controls and 2D fallback.
- Accessible keyboard controls, dialogs/menus, responsive mobile tools, and light/dark appearance.

## Assistant

- Local development uses Codex through Kessel's Chat Completions route. The local Node process retains the gateway key.
- Model choices come from Kessel's authenticated models endpoint.
- The assistant reads current state, invokes validated application tools, receives their results, checks the arrangement, and produces a short result.
- Preserve existing work unless replacement is requested. Tools use the room's current unit and the application's geometry/placement rules.
- Stop, room switches, design switches, and unmount cancel active work. Late responses must never mutate another room. Room-specific transcripts and drafts survive panel closure in tab memory; failed requests retain the draft.
- Direct provider adapters remain optional. API keys are tab-memory only.
- A deployed static build has no local gateway relay.

## Data and release gates

- Document schema version 4; library schema version 1. Imports validate nested values, limits, IDs, units, and geometry before rendering.
- Legacy single-document saves migrate automatically. Unreadable library data is preserved for recovery.
- Autosave flushes on navigation/page close and rejects stale writes from another tab.
- Core tests, browser workflows, strict compilation, lint, and production build pass before release. Live provider tests are explicit and use isolated data.

See [README.md](README.md) for current commands and operating limits.
