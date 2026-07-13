# src/components/View3D/

The 3D view, built with `@react-three/fiber` + `@react-three/drei` (Three.js). Renders the
same room and furniture as the 2D editor, extruded to real heights, with orbit and first-person
walk cameras.

## Files

- `View3D.tsx` — the `<Canvas>` scene: lighting, camera (orbit vs. walk), and composition of
  floor, walls, openings, and furniture from the active room.
- `Floor.tsx` — the room floor mesh, triangulated from the outline polygon.
- `Walls.tsx` — extruded wall meshes, split around door/window openings via `geometry/openings`.
- `Openings.tsx` — window/door meshes (glass panes, door leaves) filling the wall gaps.
- `FurnitureMesh.tsx` — one mesh per furniture item, sized/positioned/rotated/colored from its
  footprint, height, and elevation.
- `WalkControls.tsx` — first-person walk mode: pointer-lock look, WASD movement, and clamping
  the camera to stay inside the room outline.
- `coords.ts` — the single source of truth for the 2D↔3D mapping (2D x→3D x, 2D y→3D z, up=+Y)
  and rotation conversion; every 3D component goes through it so 2D and 3D never disagree.
