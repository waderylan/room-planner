# Build Spec: Room Planner (2D + 3D) — Production Rebuild

You are building a **room and furniture planner** from scratch in a **new, empty codebase**. A rough
single-file prototype exists (described in the Appendix) — you are NOT extending it. You are rebuilding
it properly. Read this entire document once before writing any code. Everything here is a requirement
unless labeled "optional." Ship it working in one pass.

The end user is a homeowner / renter / student who wants to lay out furniture to scale, check that
things fit and leave enough walking clearance, and then look at the room in 3D. They are not a CAD
professional. Precision matters, but the interface must feel effortless.

---

## 0. Design read (do this first, then obey it)

**Reading this as: a spatial-planning productivity tool for homeowners and renters, with a clean,
precise, Linear-style language, leaning toward a neutral zinc palette + a single accent, native CSS
tokens, restrained motion.**

This is a **tool / product UI**, NOT a landing page. So:

- **Dials:** DESIGN_VARIANCE 4, MOTION_INTENSITY 3, VISUAL_DENSITY 5. Calm, legible, dense-enough. The
  drawing canvas is the hero; chrome recedes.
- **Palette:** one neutral gray ramp (zinc/slate — pick one, lock it) plus **one** accent color used for
  selection, primary actions, and the "wall clearance" measurement. Do NOT use AI-purple gradients, neon
  glows, or a second accent. A good accent here is a confident blue or emerald. Lock it across the whole
  app.
- **A second, distinct color** is allowed for ONE semantic purpose only: the "furniture-to-furniture
  clearance" measurement (use a warm amber/orange), and a danger red for out-of-bounds/overlap. These are
  status colors, not decoration.
- **Typography:** a clean grotesk (Geist, or Inter Tight / system UI stack are acceptable here because it
  is a utility). Numbers in the canvas and stats use a mono or tabular-figures font so dimensions do not
  jitter. No serif.
- **Icons:** use one icon library (Phosphor via `@phosphor-icons/react`, single stroke weight). **Never
  hand-roll SVG icon paths.** No emoji anywhere in the UI.
- **Shape + theme lock:** one corner-radius scale (suggest 8px inputs/buttons, 12px cards). Support
  **light and dark mode**, defaulting to `prefers-color-scheme`, with a manual toggle. Every section obeys
  the same theme. No pure `#000`/`#fff` — use off-black/off-white.
- **Em-dash ban:** never emit the `—` or `–` character in any user-visible string, comment, tooltip, or
  label. Use a regular hyphen. This is binary: zero em-dashes.
- **Motion:** transitions on hover/selection/panel-open only (transform + opacity, ~150ms). No scroll
  animations, no infinite loops. Honor `prefers-reduced-motion`.
- **Interactive states are mandatory:** every button/input has hover, active (`:active` = translate-y 1px
  or scale .98), focus-visible ring, and disabled states. Empty states are composed, not blank ("No
  furniture yet. Add a piece to get started."). All button labels pass WCAG AA contrast against their
  background.

If you find yourself reaching for a template dashboard look (three equal stat cards with drop shadows,
generic gradient header, sidebar full of colored dots), stop. This is a precise instrument. Restraint is
the aesthetic.

---

## 1. Tech stack (use exactly this — do not substitute)

- **Build:** Vite + React 18 + **TypeScript** (strict mode on).
- **Styling:** Tailwind CSS v4. Define color/spacing/radius tokens as CSS variables; drive light/dark via
  `:root` and `[data-theme="dark"]`.
- **State:** **Zustand** — one store, holds the whole document + UI state. Persist to `localStorage`
  (autosave, debounced) via the store.
- **2D editor:** render with **SVG** (proven for this app; crisp text labels and dimension lines, easy
  hit-testing). Do the drawing by hand in React, not a charting lib.
- **3D view:** **react-three-fiber** (`@react-three/fiber`) + **`@react-three/drei`** (for `OrbitControls`,
  `PointerLockControls`, `Grid`, `Text`). Three.js under the hood.
- **Icons:** `@phosphor-icons/react`.
- **Geometry:** write a small pure-TS `geometry.ts` module (no dependency). If you want a polygon-clipping
  helper for room booleans you MAY add `polygon-clipping` (npm), but the orthogonal approach in §5 does not
  strictly require it.

Before importing anything, add it to `package.json`. Provide a working `npm install && npm run dev`. The
app is a single-page client app; no backend, no router needed (one screen with a 2D/3D toggle).

Project layout (suggested, keep it clean):

```
src/
  store/            # zustand store, persistence, json import/export
  geometry/         # pure functions: polygon math, distances, snapping
  model/            # TypeScript types + factory functions + migration
  components/
    Sidebar/        # room controls, add-furniture, item list, stats
    Canvas2D/       # SVG editor: grid, room, furniture, measurements, drag
    View3D/         # r3f scene
    ui/             # Button, NumberField, Segmented, etc. (design-system primitives)
  App.tsx
  main.tsx
```

---

## 2. Data model (the contract — implement these types)

Use these TypeScript types as the source of truth. The JSON save format (§9) is exactly this document
shape, versioned.

```ts
type Unit = "ft" | "m";

interface Vec2 { x: number; y: number; }         // in room units (feet or meters), origin top-left

// A furniture footprint is defined in LOCAL coordinates, then placed with pos + rotation.
type Footprint =
  | { kind: "rect";   w: number; d: number }                        // width x depth
  | { kind: "circle"; r: number }                                   // radius (optional but nice)
  | { kind: "poly";   points: Vec2[] };                             // arbitrary closed polygon (L-shapes live here)

interface Item {
  id: string;                 // uuid
  name: string;
  footprint: Footprint;
  pos: Vec2;                  // position of the footprint's local origin, in room units
  rotDeg: number;            // free rotation, any value 0..360 (NOT limited to 90-degree steps)
  height: number;            // vertical size for 3D, in room units
  elevation: number;         // base height off the floor (default 0; e.g. a wall shelf > 0)
  color: string;             // hex
  hidden: boolean;
}

interface Room {
  id: string;
  name: string;
  unit: Unit;
  // Room floor is an orthogonal polygon (supports rectangle, L-shape, and alcoves/bump-outs).
  // Stored as an explicit closed polygon in room units, plus the editing primitives that produced it.
  outline: Vec2[];            // closed CCW polygon of the floor boundary
  ceiling: number;           // ceiling height for 3D, in room units
  items: Item[];
  selectedItemId: string | null;
  measureMode: "wall" | "furniture";
}

interface Doc {
  version: 3;                 // bump on schema change; write a migrator
  rooms: Room[];
  activeRoomId: string;
}
```

Notes:
- **All geometry is polygon-based.** A rectangle item is just a 4-point poly at render/measure time; keep
  the `rect` kind for a simpler edit UI but convert to world polygon via a single `worldPolygon(item)`
  helper. Do not keep the old bounding-box-only code paths.
- Units are a display concern; store raw numbers. Converting ft<->m re-labels; you may optionally rescale.

---

## 3. Screen layout

```
+----------------+--------------------------------------------------+
|                |  [ 2D | 3D ]   ...toolbar...   [Save] [Load] [⚙]  |
|                |                                                  |
|                |                                                  |
|   Sidebar      |                Canvas (2D editor OR 3D view)     |
|   (scrolls)    |                                                  |
|                |                                                  |
|                |                                                  |
+----------------+--------------------------------------------------+
|                     Room tabs:  [Living Room] [Bedroom]  [+ New]  |
+------------------------------------------------------------------+
```

- Left **sidebar** (fixed ~300-320px, scrolls): Room panel, Add-furniture panel, Stats, Item list.
- **Main area:** toolbar on top, canvas fills the rest. Toolbar holds the **2D/3D segmented toggle**, the
  distance-mode toggle (Wall / Furniture), Save, Load, theme toggle, and a short keyboard hint.
- **Bottom room tabs:** switch/add/rename/delete rooms (rename via a clean inline edit, NOT a
  `window.prompt`).
- On viewports < 900px, sidebar collapses to a toggle drawer. Canvas is always usable.

Do not use native `alert`/`confirm`/`prompt` for anything user-facing — build small in-app dialogs and
toasts. (They are the biggest "unfinished prototype" tell in the current version.)

---

## 4. 2D editor (Canvas2D) — the core

Render an SVG whose `viewBox` frames the room outline plus padding. Everything below is required.

### 4.1 Grid + room
- Minor grid every 1 unit, major grid every 5 units, using non-scaling strokes so lines stay crisp at any
  zoom. **Clip the grid to the room outline polygon** (use an SVG `clipPath` from the outline) so grid
  only shows inside the floor — this is what makes L-shaped rooms read correctly.
- Draw the room outline as a heavy wall stroke. Label each outer wall segment with its length.
- **Pan + zoom:** scroll/pinch to zoom, space-drag or middle-drag to pan. Add a "fit to room" button.
  (The current prototype has neither; add both.)

### 4.2 Furniture rendering
- Each item is an SVG `<g>` transformed by `translate(pos) rotate(rotDeg, center)`. Draw its footprint
  polygon filled with `color` at ~0.72 opacity, plus a border. Draw the name + dimension text at the
  centroid, counter-rotated so text stays upright and readable at any rotation.
- Selected item: accent border + a subtle selection ring. Out-of-bounds or overlapping: red dashed border.

### 4.3 Move / rotate / snap (fix the rotation model)
- **Drag to move.** Snap position to a grid step (default 0.25 unit). Provide a snap toggle; holding a
  modifier (e.g. `Alt`) temporarily disables snapping for fine placement.
- **Free rotation (required, this is a headline feature):** selected item shows a **rotation handle** (a
  small grab dot on a stick above the item). Dragging it rotates to **any angle**, not just 90-degree
  steps. Snap rotation to 15-degree increments by default; holding `Shift` gives free 1-degree rotation
  (or invert this — pick one and put it in the hint). Also keep a keyboard `R` = rotate 90 degrees for
  quick orthogonal placement, and allow typing an exact angle in the item's edit fields.
- After any move/rotate, keep the item's **world polygon inside the room outline** where possible (clamp),
  and recompute overlap state.
- **Overlap + bounds must use true polygon math, not bounding boxes** (the prototype's bbox check is wrong
  for rotated and L-shaped pieces — do not reproduce that bug). Use the polygon routines in §7.

### 4.4 Clearance measurements (fix + improve — headline feature)
This is where the prototype is weakest. Requirements:

- When an item is selected, show its clearance to surroundings as dimension lines with a numeric label
  (value + unit), drawn on top of everything, non-interactive.
- Two modes via the toolbar toggle:
  - **Wall mode:** distance from the item to the room walls.
  - **Furniture mode:** distance to the nearest obstruction in each direction — if another item is between
    this item and the wall, measure to that item (amber) instead of the wall (accent); otherwise to the
    wall.
- **"Show the closest distance" (explicit user ask):** in addition to the four directional gaps, compute
  the single **minimum clearance** around the whole piece and highlight that one measurement prominently
  (thicker line, bold label, and echo the value as "Closest gap: X ft" somewhere in the sidebar). If the
  closest gap is below a small threshold (e.g. < 0.25 unit) treat it as touching.
- Measurements must be correct for **rotated** and **L-shaped** pieces and **non-rectangular rooms**. Use
  true polygon-to-polygon and polygon-to-wall minimum distance (§7), not axis-aligned box gaps. Directional
  gaps for a rotated piece should be measured along the piece's own local axes (left/right/front/back of
  the item as it is oriented), which reads far more intuitively than world-axis gaps.
- Dimension lines get witness lines at the item edge and a tick at the boundary, like a drafting drawing.
  Keep it clean: thin non-scaling strokes, label with a white halo so it stays legible over the fill.

### 4.5 Selection / deselection
- Click an item to select; click empty floor to deselect. Selecting also highlights the row in the list.
- Do not rebuild the whole SVG on every pointer-move during a drag (the prototype does a full rebuild on
  pointerup, which is fine, but live drag must update only the dragged node + its measurements for
  smoothness). With React, this means local drag state / refs, committing to the store on pointer-up.

---

## 5. Non-rectangular rooms (L-shapes + alcoves) — headline feature

Model the room floor as an **orthogonal polygon** and give a simple, visual editor. Do NOT ask the user to
type polygon coordinates.

Recommended editing model (choose this; it is the most one-shot-reliable):

- Room starts as a **rectangle** (Width x Length). This is the common case and stays a one-field-each edit.
- A **"Shape"** control offers presets: **Rectangle**, **L-shape**. Choosing L-shape reveals a **live
  mini-preview** (a small SVG of the floor) plus a corner picker: "remove which corner?" (4 buttons showing
  the 4 corners) and the notch size (notch width, notch depth). The preview updates live. This is the same
  interaction pattern you will use for L-shaped furniture (§6) — build it once, reuse it.
- **Alcoves / bump-outs:** allow the user to add a rectangular **alcove** onto any wall (pick a wall, set
  width + depth + offset along the wall). Each alcove unions into the outline. Support deleting alcoves.
  Internally: maintain the base rect + a list of {wall, offset, width, depth, type: "add" | "notch"}
  primitives, and recompute `outline` (the closed polygon) from them. Because everything is axis-aligned,
  you can compute the union by walking a grid of rectangles and tracing the boundary, or by using
  `polygon-clipping`. Keep vertices on the snap grid.

Everything downstream (grid clip, wall labels, bounds clamping, wall-distance, 3D wall extrusion) consumes
`room.outline` and therefore "just works" for any orthogonal shape. Test with: a plain rectangle, an
L-shape, and a rectangle with one bump-out alcove.

(Non-orthogonal / angled room walls are out of scope. Keep room edges axis-aligned.)

---

## 6. Furniture: simpler add flow, presets, L-shapes, copy

The current add-furniture form is clunky and the L-shape inputs are unintelligible. Redesign it.

### 6.1 Preset catalog (make adding effortless)
- Provide a small **catalog of presets** with sensible real-world default dimensions AND heights, e.g.:
  Sofa (6x3, h 2.8), Loveseat, Armchair, Coffee table, Dining table, Dining chair, Bed (Queen 5x6.7, King),
  Nightstand, Dresser, Desk, Bookshelf, TV stand, Rug (h ~0), Wardrobe, Fridge, Kitchen island, Toilet,
  Sink, Bathtub, Plant. Each preset: name, footprint, default height, a default color.
- Clicking a preset **immediately adds it** to the room at the first free spot and selects it. That is the
  fast path. No modal, no multi-field form to fill first.
- Also provide a **"Custom"** option that adds a generic rectangle you then edit inline.

### 6.2 Inline edit (replace the mode-switching form)
- Editing an item happens **in place** in the item's row / a compact inspector for the selected item, not
  by repopulating a shared "Add" form that swaps between Add and Edit modes (a confusing part of the
  prototype). The selected item gets an **Inspector** panel showing: Name, Shape, dimensions, Height,
  Elevation, Rotation (exact degrees), Color. Editing any field updates live.
- Fields shown depend on shape: rect = W x D; circle = radius; L-shape = the visual editor below.

### 6.3 L-shaped furniture editor (fix the confusing UI — explicit user ask)
Replace "cut width / cut length" with a **visual, labeled** editor:

- Show a **live footprint preview** (small SVG) of the piece.
- Fields: **overall Width**, **overall Depth**, then a **corner picker** ("notch corner": 4 buttons, each
  showing an L oriented that way) and **notch Width** + **notch Depth**. As the user changes any value the
  preview redraws, and the resulting polygon is what gets placed. Label the notch clearly ("the cut-out
  corner"). Clamp notch < overall on each axis.
- Internally this produces a `poly` footprint (6 points). The corner picker just changes which corner the
  notch is subtracted from.
- This is the SAME preview+picker component as the L-shaped room (§5). Build a reusable `<LShapeEditor>`.

### 6.4 Copy / duplicate (explicit user ask)
- **Duplicate within the room:** a copy button (and `Ctrl/Cmd+D`) clones the selected item with a small
  positional offset, a new id, and " copy" appended or kept-same name; selects the clone.
- **Copy to another room:** keep the prototype's "copy to room X" capability, via a clean menu (not the
  ad-hoc popover). Placement in the target room uses the free-spot finder.

### 6.5 Item list
- Left sidebar lists all items in the active room: color swatch, name, dimensions, and quick actions
  (visibility toggle, duplicate, copy-to-room, delete). Selecting a row selects on canvas and vice-versa.
- Multi-select is optional; if you skip it, single-select is fine.

---

## 7. Geometry module (write these pure functions; they power correctness)

Put these in `src/geometry/`. All work in room units. Cover the tricky cases so measurements and overlap
are actually right.

- `worldPolygon(item): Vec2[]` — footprint (rect/circle-as-polygon/poly) transformed by rotation about its
  center and translated by `pos`. For circle, approximate with e.g. 48 points (or handle circle specially
  in distance math).
- `polygonArea(poly): number`, `centroid(poly): Vec2`.
- `pointInPolygon(p, poly): boolean` (ray cast) — for hit-testing and containment.
- `polygonContainsPolygon(inner, outer): boolean` — item fully inside the room (all vertices in + no edge
  crossing). Use for the out-of-bounds check.
- `polygonsIntersect(a, b): boolean` — separating-axis or edge-crossing test, plus a containment check
  (one fully inside the other). Use for overlap detection. Must be correct for concave (L) polygons —
  prefer the edge-intersection + point-in-polygon approach over pure SAT (SAT assumes convex).
- `segSegDistance(a1, a2, b1, b2): number` — minimum distance between two segments.
- `polygonPolygonDistance(a, b): number` — 0 if they intersect, else min over all edge-pairs of
  `segSegDistance`. This is the workhorse for the "closest distance" feature. It is O(n*m) but n,m are
  tiny (<= ~8 for furniture), so it is fine.
- `polygonToWallsDistance(poly, outline)` — min distance from the item polygon to each wall segment of the
  room outline, returning both the value and which wall/point, so you can draw the dimension line to the
  right spot.
- `snap(v, step)`, `clampPolygonInside(item, outline)` — nudge an item back inside the outline after a
  move/rotate/resize.
- Directional clearance: given the item's oriented local axes, cast from the item's edge midpoints along
  +/- local X and +/- local Y to the nearest obstruction (other item polygon in "furniture" mode, else the
  wall), returning the gap and the hit point for drawing. The **closest gap** is the min across all
  directions AND the true `polygonPolygonDistance` to the single nearest neighbor.

Write a few inline sanity checks or a tiny test file for `segSegDistance` and `polygonsIntersect`
(overlapping, touching, disjoint, one-inside-other, L-shape cases). Getting these right is the difference
between "looks production" and "prototype."

---

## 8. 3D view (View3D) — headline feature

A toggle in the toolbar switches the main area between the 2D editor and a 3D view of the **same active
room**. State is shared (same store); toggling does not lose selection or data.

### 8.1 Scene
- **Floor:** the room outline polygon as a filled floor (`ShapeGeometry` from the outline).
- **Walls:** extrude each wall segment up to `room.ceiling` (thin boxes or an extruded wall loop with a
  small thickness). Walls should be semi-transparent or single-sided/back-face-culled so the camera inside
  can see the room (a common approach: render walls, and either lower opacity or cull front faces so you
  always see in). Make sure standing inside the room you can see the far walls and the near walls do not
  black out the view.
- **Furniture:** each visible item is a **box** (or its extruded polygon for L-shapes: `ExtrudeGeometry`
  from the footprint) with height = `item.height`, sitting at `elevation` off the floor, positioned at its
  2D `pos`, rotated by `rotDeg` about the vertical (Y) axis, colored with `item.color`. This is exactly the
  "rectangular cubes for all the items" the user asked for. A subtle edge outline on each box reads much
  cleaner than flat shaded boxes.
- Light: one ambient + one directional light. Keep it simple and evenly lit; this is a diagram, not a
  render. Ground/rooms in the app's neutral tones; do not over-style.

### 8.2 Camera / navigation ("stand at any point in the room")
Provide two camera modes, toggleable:
- **Orbit** (default): `OrbitControls`, orbit around the room center, zoom, pan. Good for an overview.
- **Walk / first-person:** eye height ~ 1.7 units (5'7"-ish, scaled to unit), `PointerLockControls` with
  WASD to move and mouse to look, constrained to inside the room outline (clamp position to the floor
  polygon so you cannot walk through walls). Provide a clear way to enter/exit walk mode and an on-screen
  hint. Optionally: click a point on the floor to teleport the walk camera there.
- Coordinate systems: 2D uses (x = right, y = down/into-room). Map to 3D as x -> x, y -> z, up -> +Y. Keep
  the mapping in one helper so 2D and 3D never disagree about where a piece is.

### 8.3 Toggle behavior
- The 2D<->3D toggle is instant and non-destructive. Editing is primarily a 2D activity; the 3D view can be
  view-only for v1 (selection highlight is a nice-to-have, full 3D editing is out of scope). Height and
  elevation are edited in the 2D inspector and reflected live in 3D when you switch back.

---

## 9. Save / load (JSON) — required

- **Save / Download:** a toolbar button downloads the entire `Doc` (all rooms + items + room shapes +
  heights + units) as a `.json` file (e.g. `room-planner-<date>.json`). Pretty-print it.
- **Load / Import:** a button opens a file picker, reads the `.json`, validates it, runs the version
  migrator, and replaces (or offers to merge) the current document. Handle malformed files gracefully with
  a toast error, never a crash.
- **Autosave:** debounce-persist the whole `Doc` to `localStorage` on every change; restore on load. Keep
  a `version` field and a migration function so old saves upgrade cleanly (mirror the prototype's
  localStorage migration, but for the new schema).
- Export must round-trip: load(save(doc)) === doc.

---

## 10. Keyboard + interaction summary (put these in a discoverable hint / help)

- Drag: move. `R`: rotate 90 degrees. Rotation handle: free rotate (Shift = fine). `Delete`/`Backspace`:
  delete selected. `Ctrl/Cmd+D`: duplicate. `Esc`: deselect / exit walk mode. `Alt`-drag: ignore grid
  snap. Scroll: zoom. Space-drag / middle-drag: pan. Ignore shortcuts while typing in an input.

---

## 11. Bug fixes carried over from the prototype (do not reproduce these)

1. **Bounding-box overlap + clearance are wrong for rotated/L pieces.** Use true polygon math (§7).
2. **L-shape "cut width / cut length" fields are unintelligible.** Replace with the visual `<LShapeEditor>`
   (§6.3).
3. **Add/Edit share one form that swaps modes**, which is confusing. Use a dedicated inspector for the
   selected item (§6.2).
4. **`window.prompt/confirm/alert`** for renaming rooms, deleting, clearing. Replace with in-app dialogs
   and toasts (§3).
5. **No pan/zoom / fit-to-view.** Add them (§4.1).
6. Measurements only handle axis-aligned world directions. Measure along the item's own axes and support
   non-rectangular rooms (§4.4).

---

## 12. Acceptance checklist (all must pass before you call it done)

Functionality:
- [ ] Set room width/length/units; room renders to scale with clipped grid and labeled walls.
- [ ] Switch room shape to L-shape and add at least one alcove; grid, walls, bounds all follow the new
      outline.
- [ ] Add furniture from presets in one click; add a custom piece; edit its dimensions/height/color inline.
- [ ] Create an L-shaped piece using the visual editor with a live preview; it renders and measures
      correctly.
- [ ] Drag to move with grid snap; `Alt` disables snap.
- [ ] Free-rotate a piece to a non-90 angle via the handle; measurements and overlap stay correct.
- [ ] Overlap and out-of-bounds show red and are computed with polygon math (verify with a rotated piece
      partly over a wall / another piece).
- [ ] Clearance shows directional gaps AND highlights the single closest gap, in both Wall and Furniture
      modes, correctly for rotated pieces and an L-shaped room.
- [ ] Duplicate (Ctrl/Cmd+D) and copy-to-another-room both work.
- [ ] Stats (room area, used area, free area) update live and go red when overfilled.
- [ ] Multi-room tabs: add, rename (inline), switch, delete.
- [ ] Toggle to 3D: room walls + ceiling height + furniture boxes with correct heights, positions,
      rotations, colors. Orbit works; walk mode works and is constrained inside the room.
- [ ] Save downloads a JSON; Load restores it exactly (round-trip); autosave survives reload.

Design / quality:
- [ ] Light and dark mode both look intentional; toggle works; respects system default.
- [ ] One accent color, locked; measurement colors are the only semantic exceptions.
- [ ] No emoji, no hand-rolled icon SVGs, no em-dash characters anywhere.
- [ ] All buttons/inputs have hover/active/focus/disabled states; empty and error states are composed.
- [ ] No `alert`/`confirm`/`prompt`. No console errors. `npm run build` succeeds with TS strict.
- [ ] Canvas is smooth while dragging/rotating (no full-scene rebuild per pointer-move).

Deliver a `README.md` with run instructions and a one-paragraph tour of the features.

---

## Appendix: what the prototype (do not extend) does, for reference

A single `index.html` (~1000 lines, vanilla JS + SVG, IIFE) implements: multi-room tabs with localStorage
persistence and a v1->v2 migration; rectangle/square/L-shape furniture defined by width/depth (+ "cut
width/cut length" for L); drag-to-move with 0.25-unit grid snap and in-bounds clamping; 90-degree-only
rotation; **bounding-box** overlap and out-of-bounds detection (turns the border red/dashed); clearance
dimension lines to the nearest wall, or in "furniture" mode to the nearest piece blocking the axis-aligned
ray, drawn only for the selected item; room/used/free area stats; per-item hide, edit (via a shared
Add/Edit form that swaps modes), duplicate-to-room (popover), delete; keyboard `R` rotate and `Delete`.
It uses `window.prompt/confirm/alert` for room naming and destructive confirms. There is no 3D, no pan/zoom,
no free rotation, no height/ceiling, no JSON import/export, and the geometry is bounding-box based. Treat
all of that as the feature floor to preserve, with the corrections and additions specified above. Build
fresh in the new stack; copy no code.
```
