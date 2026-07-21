# src/landing

The PS2-styled landing page shown before the app on each new browser session
(gated in `main.tsx` via `sessionStorage`; `#landing` in the URL forces it back).

- `LandingPage.tsx` — DOM shell: boot sequence, section words, memory-card chip,
  PlayStation-style button legend, and the ✕ CONTINUE button. Owns the scroll and
  pointer listeners and hands refs down to the scene.
- `PixelScene.tsx` — the react-three-fiber scene. Renders at ~230 vertical pixels
  (low `dpr`) and upscales with `image-rendering: pixelated` for the retro look.
  Toon-shaded "brick" furniture assembles a 16x12 ft diorama room as you scroll.
- `timeline.ts` — pure scroll-progress math: phase boundaries, quantized stepped
  easing (`qsteps`), drop/squash animation, and the camera orbit. No three.js or
  React imports; keep it that way so it stays easy to tune.
- `palette.ts` — the brick color palette, separate from the app theme.
- `landing.css` — pixel-font styling. Hard cuts only: no transitions or fades.

The landing intentionally does not import from `src/store` or mutate the doc;
its only coupling to the app is reading `localStorage["room-planner:doc"]` to
show save-data state. Reduced-motion users get the finished room, no scroll
choreography.
