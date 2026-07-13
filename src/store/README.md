# src/store/

Application state, built on Zustand. The store is the single source of truth for the document
plus UI state; components read slices from it and mutate only through its actions (so autosave
and derived state stay consistent).

## Files

- `store.ts` — the main store: holds the `Doc` and all UI state (theme, view mode, camera mode,
  snap, sidebar/walls/chat visibility, toasts) and every action that mutates them (rooms,
  furniture, room shape, openings, selection, save/load). Rebuilds the outline and reclamps
  openings when shape/alcoves change; autosaves on change.
- `settingsStore.ts` — a separate store for LLM settings (active provider, per-provider model
  names and API keys), with `DEFAULT_MODELS`. Persists to `localStorage`.
- `persistence.ts` — loads the persisted doc on startup and debounces autosaving it to
  `localStorage` (via `model/migrate.safeParseDoc` on load).
- `toast.ts` — the `Toast` type and variants used by the toast actions and `ToastStack`.
