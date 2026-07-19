# 002 — Stop spinner rotation for reduced motion

- **Status**: DONE
- **Commit**: f382e33
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, 1 CSS declaration

## Problem

The reduced-motion override merely slows the infinite spinner. Users who request reduced motion still receive continuous rotation, even though the adjacent loading text already communicates progress.

```css
/* app/globals.css:531-536 — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; }
  .decision-card, .pressure-card, .consequence, .fulltime-banner, .voice-call { transform: none; transition: opacity 180ms var(--ease-out); }
  .matrix circle { transition-duration: 160ms; }
  .spinner { animation-duration: 1600ms; }
}
```

## Target

Remove continuous rotation when reduced motion is requested. Keep the icon visible; the button label continues to say what is loading.

```css
/* target */
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
```

## Repo conventions to follow

- Reduced-motion overrides live together in `app/globals.css:531-536`.
- Other reduced-motion rules keep non-spatial feedback instead of globally disabling every transition.
- The normal spinner remains `850ms linear infinite` in `app/globals.css:436`, which correctly reserves linear easing for constant progress motion.

## Steps

1. In the existing reduced-motion block in `app/globals.css`, replace `.spinner { animation-duration: 1600ms; }` with `.spinner { animation: none; }`.

## Boundaries

- Do NOT change the normal-motion spinner.
- Do NOT remove loading text or the loader icon.
- Do NOT add a replacement pulse or other looping animation.
- If the reduced-motion block has drifted since the commit stamp, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm lint && pnpm build`; both must exit 0.
- **Feel check**: trigger profile or poster generation and confirm:
  - With normal motion, the loader rotates linearly at 850ms per turn.
  - With `prefers-reduced-motion`, the loader remains visible but does not rotate.
  - The loading label still communicates the active operation.
  - In DevTools at 10% playback, there is no residual spinner rotation in reduced-motion mode.
- **Done when**: the spinner has no animation under reduced motion and normal behavior is unchanged.
