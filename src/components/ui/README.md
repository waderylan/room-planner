# src/components/ui/

Shared, presentational UI primitives. No app/business logic — they take props and render, and
are reused across the toolbar, sidebar, dialogs, and chat.

## Files

- `Button.tsx` — button with `primary`/`secondary`/`ghost`/`danger` variants, sizes, and an
  optional leading icon.
- `IconButton.tsx` — square icon-only button with an `active` state; requires an `aria-label`.
- `Dialog.tsx` — modal dialog rendered through a portal, with title, body, footer, and
  Esc/backdrop close.
- `Menu.tsx` — dropdown/popover menu of actions, closing on outside click.
- `NumberField.tsx` — labeled numeric input with step/min/max, unit suffix, and local-edit
  buffering.
- `InlineTextEdit.tsx` — in-place text editor (e.g. for renaming) that toggles between label
  and input.
- `Segmented.tsx` — segmented (pill) single-choice control, generic over a string union.
- `Toggle.tsx` — labeled on/off switch.
- `ToastStack.tsx` — renders the transient toast notifications from the store (success/error/
  info).
