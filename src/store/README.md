# src/store/

Zustand state for the design library, active document, editor history, and UI. Mutate document
state through store actions so history, library records, and autosave remain consistent.

- `store.ts`: `useStore` exposes `projects`, `activeProjectId`, `doc`, `saveStatus`, and
  `saveError`. Design actions create, open, rename, duplicate, delete, and import designs.
  The active project's `doc` is updated synchronously with the editor document. Imports
  create an independent design and never append to or replace existing work.
- Undo/redo keeps at most 80 immutable document snapshots per active design. Selection,
  measurement mode, and room switching do not consume undo history. Continuous edits to
  the same property are grouped within 600 ms. Opening another design clears the history.
  `withHistoryGroup(token, fn)` groups synchronous tool mutations by request token. A later
  batch can reuse the token only while no manual document edit has intervened. Its scope
  is restored immediately after the callback, including when a callback throws.
- `persistence.ts`: validates the versioned library in `room-planner:library:v1`, migrates
  the legacy `room-planner:doc` without deleting it, and keeps an unreadable library in
  `room-planner:library:recovery` where storage permits. Saves debounce for 350 ms and
  flush on design changes, page hide, hidden visibility, and before unload. Quota errors
  retain the pending save for retry and set `saveError`. Optimistic comparison of the
  stored library prevents a stale tab from overwriting a newer tab's work.
- `settingsStore.ts`: separate provider/model configuration. Provider credentials follow
  its explicit credential-retention policy; design backups contain no provider settings.
- `toast.ts`: feedback message types used by the store and toast UI.

Local storage is browser- and origin-specific. Exported JSON files are portable design
backups. No account, hosted database, or cloud service is required.
