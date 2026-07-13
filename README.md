# Room Planner

A 2D + 3D room and furniture planner: lay out a room to scale, drag furniture into place,
check clearances and overlaps, and step into a 3D view of the same room.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL. `npm run build` produces a production build (TypeScript
strict mode, no errors). `npm run preview` serves that build locally.

## Tour

- **Room panel** (sidebar): set width/length and units (ft or m), switch the room to an
  L-shape with a visual corner-and-notch editor, add rectangular alcoves/bump-outs to any
  wall, and set the ceiling height for the 3D view.
- **Add furniture**: a one-click preset catalog (sofa, bed, desk, kitchen island, and more)
  drops a piece into the first free spot in the room and selects it. "Custom" adds a plain
  rectangle to edit from scratch.
- **Inspector**: the selected piece's name, shape (rectangle, circle, or a visual L-shape
  editor shared with the room shape), dimensions, height, elevation, exact rotation, and
  color, all editing live.
- **2D canvas**: pan (space-drag or middle-drag), zoom (scroll), and fit-to-room. Drag
  furniture to move it (snaps to a 0.25-unit grid; hold `Alt` to place freely). Select a
  piece to get a free-rotation handle (snaps to 15 degrees; hold `Shift` for 1-degree steps)
  and a `R` keyboard shortcut for a quick 90-degree turn. Overlapping or out-of-bounds pieces
  get a red dashed outline, computed with true polygon math so it's correct for rotated and
  L-shaped pieces in non-rectangular rooms.
- **Clearance measurements**: toggle between Wall mode (distance to the nearest wall) and
  Furniture mode (distance to the nearest piece, falling back to the wall) in the toolbar.
  The selected item shows its four directional gaps plus a highlighted single closest gap,
  echoed in the sidebar stats.
- **Stats**: room area, used area, and free area update live and turn red when the room is
  overfilled.
- **Rooms**: the tabs at the bottom add, inline-rename (double-click), switch, and delete
  rooms. Furniture can be duplicated in place (`Ctrl/Cmd+D`) or copied into another room.
- **3D view**: toggle to see the same room as extruded walls, a floor, and furniture boxes
  with correct heights, elevations, rotations, and colors. Orbit around the room, or switch
  to Walk mode for a first-person view (click to lock the mouse, WASD to move, `Esc` to let
  go) constrained to stay inside the room.
- **Save / Load**: Save downloads the full document as pretty-printed JSON; Load restores it
  from a file, with a toast (not a crash) on anything malformed. The document also autosaves
  to `localStorage` as you work, so a reload picks up where you left off.
- **Light / dark mode**: follows the system theme by default, with a manual toggle in the
  toolbar.

## Keyboard shortcuts

`R` rotate 90 degrees, rotation handle drag for free rotation (`Shift` = 1-degree steps),
`Delete`/`Backspace` delete, `Ctrl/Cmd+D` duplicate, `Esc` deselect or exit walk mode,
`Alt`-drag ignore grid snap, scroll to zoom, space-drag or middle-drag to pan.

## Stack

Vite, React 19, TypeScript (strict), Tailwind CSS v4, Zustand, hand-rolled SVG for the 2D
editor, `@react-three/fiber` + `@react-three/drei` for the 3D view, and `@phosphor-icons/react`
for icons.
