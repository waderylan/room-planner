# src/components/Tutorial/

First-run onboarding tour. Shows once per browser (gated on a `room-planner:tour-done`
`localStorage` flag), walking a new user through the essential UI with a spotlight and a
Next / Back / Skip card.

## Files

- `Tutorial.tsx` — the whole tour. Defines the ordered steps, each anchored to a real element
  via a `data-tour="…"` attribute (`room`, `furniture`, `canvas`, `view`, `assistant`,
  `settings`, `rooms`). It measures the target's bounding rect, dims the rest of the screen with
  a box-shadow spotlight, positions the step card beside the target (clamped to the viewport),
  and blocks interaction with the app until the user finishes or skips. Mounted once in
  `src/App.tsx`; finishing opens the assistant so it's ready to try.

To reset the tour during development, clear the `room-planner:tour-done` key from
`localStorage`.
