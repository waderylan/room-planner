# src/model/

Framework-free document data, constructors, conversion, validation, and placement.
The version 4 document remains `Doc -> Room[] -> Item[]`. Project metadata belongs to the
library wrapper in `src/store/persistence.ts` rather than changing the portable document.

- `types.ts`: document, room, item, footprint, opening, and room-shape types. Coordinates
  increase east and south. Item position is the unrotated footprint's top-left; rotation
  is around its footprint center.
- `presets.ts`: furniture dimensions in feet. `factory.ts` converts presets to the room's
  unit before placement; clones and new documents retain independent state.
- `units.ts`: scales every linear measurement when switching room units, including item
  footprints/positions, ceiling, openings, alcoves, outline, and L-shape notches.
- `collision.ts`: shared collision rules. Touching footprint edges, floor coverings,
  hidden furniture, and vertically separated items do not cause collisions.
- `freeSpot.ts`: unit-aware placement with a bounded grid search (at most 81 x 81 candidates).
- `migrate.ts`: validates every nested import value before rendering or geometry work.
  Rebuilds derived outlines; bounds array sizes, dimensions, and file size; normalizes
  rotation and colors; rejects nonfinite coordinates, invalid shapes, duplicate IDs, and
  unsupported future versions. Existing v1-v4 records with compatible shapes migrate.
- `templates.ts`: named starting layouts used by the design library.
- `index.ts`: public model barrel.

Keep `Doc.version` at 4 unless the document's persisted shape changes. Add migration and
round-trip tests whenever changing that contract. Core tests live in `tests/core/`.
