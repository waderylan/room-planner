# src/components/Sidebar/

Contextual Furniture, Room, and Selection tabs, controlled by store UI state. Adding a
preset keeps the catalog open; selecting an existing canvas/list item opens its inspector.
The catalog stays mounted so its search, category, and scroll position survive tab changes.
Panels read and write the Zustand store through actions.

## Files

- `Sidebar.tsx` — keyboard-accessible tabs and scrollable panels; mobile drawer close control.
- `RoomPanel.tsx` — room shape (rect/L-shape via `LShapeEditor`), width/length, unit, ceiling
  height, alcoves/bump-outs, and openings (opens `WallEditorDialog`).
- `AddFurniturePanel.tsx` — searchable categorized catalog with footprint previews and dimensions.
- `Inspector.tsx` — editor for the selected item: name, footprint shape (rect/circle/L-shape),
  dimensions, height, elevation, rotation, and color. Names commit on blur/Enter; Escape
  restores the original text. Numeric inputs follow the same commit/cancel convention.
- `StatsPanel.tsx` — room area, visible furniture count, conflicts, and selected-item clearance.
- `ItemList.tsx` — list of all furniture in the active room with select, hide, duplicate,
  delete, and copy-to-room actions.
