# 001 — Ground view entrances with physical motion

- **Status**: DONE
- **Commit**: f382e33
- **Severity**: LOW
- **Category**: Physicality & origin
- **Estimated scope**: 1 file, roughly 6 CSS declarations

## Problem

The three top-level views enter with opacity alone. This softens a view swap, but it does not give the new surface physical grounding. Because a landing page, replay cockpit, or debrief is entered only occasionally, a very small transform can explain the state change without adding repetitive motion.

```css
/* app/globals.css:67 — current */
.landing, .cockpit, .debrief { transition: opacity 180ms var(--ease-out); }
@starting-style { .landing, .cockpit, .debrief { opacity: 0; } }
```

## Target

Use the existing strong ease-out token, keep the UI duration below 300ms, and begin close to the final state rather than from `scale(0)`. Remove the position/scale change when reduced motion is requested while retaining the useful opacity feedback.

```css
/* target */
.landing, .cockpit, .debrief {
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);
}
@starting-style {
  .landing, .cockpit, .debrief {
    opacity: 0;
    transform: translateY(6px) scale(.995);
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing, .cockpit, .debrief {
    transform: none;
    transition: opacity 180ms var(--ease-out);
  }
}
```

## Repo conventions to follow

- Motion tokens already live in `app/globals.css:18-20`; reuse `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- State-card entrances in `app/globals.css:267-268` use `@starting-style`, opacity, and a near-final transform. Follow that pattern.
- The existing `prefers-reduced-motion` block starts at `app/globals.css:531` and removes position changes while retaining opacity.

## Steps

1. In `app/globals.css`, add `transform 180ms var(--ease-out)` to the top-level view transition.
2. In the adjacent `@starting-style`, add `translateY(6px) scale(.995)`.
3. In the existing reduced-motion media query, add a rule for the three views that removes the transform and keeps the 180ms opacity transition.

## Boundaries

- Do NOT change component markup or React view state.
- Do NOT add a page-transition library or dependency.
- Do NOT animate layout, filter, or positional properties outside `transform`.
- If these selectors or the reduced-motion block have drifted since the commit stamp, STOP and report instead of improvising.

## Verification

- **Mechanical**: run `pnpm lint && pnpm build`; both must exit 0.
- **Feel check**: run the UI, enter Judge Replay, exit, and reveal the Pressure Profile; confirm:
  - Each view appears immediately and settles over 180ms with only a 6px/0.5% change.
  - Rapid view changes never restart a keyframe because the implementation uses a transition plus `@starting-style`.
  - In DevTools, set playback to 10% and confirm the page begins near its final position rather than growing from nothing.
  - Toggle `prefers-reduced-motion` and confirm position/scale movement disappears but the opacity entrance remains.
- **Done when**: all three views use the same tokenized entrance and reduced-motion has no spatial movement.
