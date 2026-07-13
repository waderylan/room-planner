# src/components/Sidebar/

The left sidebar: a vertical stack of panels for editing the room and its contents. All panels
read and write the Zustand store directly.

## Files

- `Sidebar.tsx` — container that stacks the panels below in order.
- `RoomPanel.tsx` — room shape (rect/L-shape via `LShapeEditor`), width/length, unit, ceiling
  height, alcoves/bump-outs, and openings (opens `WallEditorDialog`).
- `AddFurniturePanel.tsx` — one-click furniture preset catalog (plus "Custom"); drops a piece
  into the first free spot and selects it.
- `Inspector.tsx` — editor for the selected item: name, footprint shape (rect/circle/L-shape),
  dimensions, height, elevation, rotation, and color, all live.
- `StatsPanel.tsx` — live room area, used area, and free area (turns red when overfilled), plus
  the selected item's closest-gap readout.
- `ItemList.tsx` — list of all furniture in the active room with select, hide, duplicate,
  delete, and copy-to-room actions.
