# src/components/Sidebar/

Contextual Furniture, Room, and Selection tabs. Selecting furniture opens its inspector.
Panels read and write the Zustand store through actions.

## Files

- `Sidebar.tsx` — keyboard-accessible tabs and scrollable panels; mobile drawer close control.
- `RoomPanel.tsx` — room shape (rect/L-shape via `LShapeEditor`), width/length, unit, ceiling
  height, alcoves/bump-outs, and openings (opens `WallEditorDialog`).
- `AddFurniturePanel.tsx` — searchable categorized catalog with footprint previews and dimensions.
- `Inspector.tsx` — editor for the selected item: name, footprint shape (rect/circle/L-shape),
  dimensions, height, elevation, rotation, and color, all live.
- `StatsPanel.tsx` — live room area, used area, and free area (turns red when overfilled), plus
  the selected item's closest-gap readout.
- `ItemList.tsx` — list of all furniture in the active room with select, hide, duplicate,
  delete, and copy-to-room actions.
