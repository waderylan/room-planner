# src/components/

All React UI. Feature areas live in their own subdirectories; a few cross-cutting components
sit at the top level, and shared primitives live in `ui/`.

## Files

- `DesignLibrary.tsx` — local design management, room templates, search/sort, JSON import, and backups.
- `DesignPreview.tsx` — document-driven floor-plan thumbnails.
- `Toolbar.tsx` — design naming/save state, undo/redo, views, measurements, appearance, exports, and assistant.
- `RoomTabs.tsx` — bottom room tabs: add, switch, inline-rename (double-click), duplicate, and
  delete rooms.
- `LShapeEditor.tsx` — reusable visual L-shape editor (overall size + notch corner/size),
  shared by the room shape and furniture footprint editors.
- `WallEditorDialog.tsx` — dialog for adding/editing wall openings (windows and doors) on a
  chosen wall, with offset, width, height, sill, and hinge side.
- `ErrorBoundary.tsx` — recoverable failures for the application and lazy 3D view.

## Subdirectories

- `Canvas2D/` — the SVG-based 2D floor-plan editor.
- `View3D/` — the Three.js 3D view (walls, floor, furniture, walk mode).
- `Sidebar/` — the left sidebar panels (room, add furniture, stats, inspector, item list).
- `Chat/` — the LLM assistant chat panel.
- `Settings/` — the LLM provider/model/API-key settings dialog.
- `ui/` — shared, presentational primitives (buttons, dialogs, fields, menus, toggles).
