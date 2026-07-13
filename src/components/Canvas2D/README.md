# src/components/Canvas2D/

The 2D floor-plan editor, drawn as a single hand-rolled SVG. Handles pan/zoom (via the SVG
`viewBox`), furniture drag and rotate, grid snapping, live overlap/out-of-bounds highlighting,
and clearance measurements.

## Files

- `Canvas2D.tsx` — the main component and interaction controller: owns the viewBox
  (pan/zoom/fit), pointer handling, selection, and renders the grid, room outline, and
  furniture. Computes overlap/bounds state via `geometry/`.
- `Grid.tsx` — renders the background measurement grid, clipped to the room outline.
- `RoomOutlineView.tsx` — draws the room walls (with openings) and per-wall dimension labels.
- `FurnitureItemView.tsx` — renders a single furniture piece with its drag body and rotation
  handle; converts pointer motion to moves/rotations with grid snapping.
- `Measurements.tsx` — draws the selected item's directional clearance gaps (to walls or
  nearest furniture) and the highlighted closest gap.
- `viewBox.ts` — pure helpers for the SVG viewBox: fit-to-outline, zoom, pan, and serialize.
- `svgPoint.ts` — converts client/screen coordinates to SVG user space honoring the current CTM.
