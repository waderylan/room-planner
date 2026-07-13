# src/geometry/

Pure, framework-free geometry math. No React, no store — just data in, data out. This is the
shared source of truth for shapes, overlaps, clearances, and room outlines, reused by the 2D
editor, the 3D view, and the LLM placement engine. Prefer adding math here (with a self-test)
over inlining it in components.

Coordinate convention: X increases east (right), Y increases south (down / into the room).

## Files

- `types.ts` — the `Vec2` type and its `vec2()` constructor.
- `polygon.ts` — core polygon primitives: area, centroid, point-in-polygon, polygon
  intersection/containment, and segment/point distance helpers, plus grid `snap`.
- `shape.ts` — furniture footprint geometry: local footprint polygon (rect/circle/poly),
  world-space polygon after position+rotation, world center/axes, inside-outline tests, and
  clamping a shape inside the room.
- `roomOutline.ts` — builds the closed room floor outline from the base rect/L-shape plus
  alcove unions, by rasterizing covered cells and tracing the boundary.
- `lshape.ts` — builds a 6-point L-shaped polygon (rectangle with a corner notch); shared by
  the room and furniture L-shape editors, with helpers to derive params back from a polygon.
- `openings.ts` — wall geometry: wall segments/angles from the outline, opening spans, solid
  wall segments split around openings, and reclamping openings when the outline changes.
- `clearance.ts` — nearest-distance measurements from an item to walls and to other furniture,
  used by the measurement overlay and stats.
- `selfTest.ts` — lightweight runtime assertions for the tricky cases (overlap/touch/disjoint/
  nested/L-shape); run once in dev from `main.tsx`.
- `index.ts` — re-exports the modules above as the `geometry` barrel.
