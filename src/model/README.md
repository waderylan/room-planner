# src/model/

The document data model and everything that produces or transforms it. Framework-free; the
store (`src/store/`) holds an instance of this model and mutates it through actions.

Shape: `Doc` → `Room[]` → `Item[]`, with rooms carrying a shape, alcoves, openings, and a
derived outline polygon. `Doc.version` is currently **4**; bump it and add a migration when the
shape changes.

## Files

- `types.ts` — all model types: `Doc`, `Room`, `Item`, `Footprint`, `RoomShape`, `Alcove`,
  `Opening`, `Unit`, `MeasureMode`, etc. Includes the coordinate-frame and `pos`/rotation notes.
- `presets.ts` — the furniture preset catalog (`FURNITURE_PRESETS`) and the `CUSTOM_PRESET`
  plain-rectangle fallback: name, footprint, height, color, elevation.
- `factory.ts` — constructors for new docs, rooms, and items (from a preset or cloned), plus
  the default room shape; builds the initial outline and finds a free spot for new items.
- `freeSpot.ts` — `findFreeSpot`: scans a grid for the first position where an item fits without
  overlapping other furniture or leaving the room.
- `migrate.ts` — `safeParseDoc`: validates and upgrades arbitrary parsed JSON into the current
  `Doc` shape, throwing a human-readable message on anything unrecoverable (callers show a toast
  instead of crashing).
- `index.ts` — re-exports the modules above as the `model` barrel.
