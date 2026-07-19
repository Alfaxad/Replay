# 003 — Respect reduced motion across audio meters

- **Status**: DONE
- **Commit**: f382e33
- **Severity**: MEDIUM
- **Category**: Accessibility and performance
- **Estimated scope**: 3 files, small

## Problem

The CSS fallback removes every transition, including useful color/opacity feedback, while both JavaScript audio loops continue updating transforms that are no longer visible.

```css
/* app/globals.css:553 — current */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

```ts
// components/ui/bar-visualizer.tsx:21 — current
const timer = window.setInterval(() => setFrame((value) => value + 1), interval);
```

```ts
// hooks/use-streamed-speech.ts:64 — current
meterFrameRef.current = requestAnimationFrame(tick);
```

Several pressable controls also transition `box-shadow`, which adds paint work to interactions that only need transform feedback.

## Target

- Stop demo/state interval animation when `prefers-reduced-motion: reduce` is active.
- Skip the TTS frequency `requestAnimationFrame` loop for reduced-motion listeners.
- Remove transform changes in the reduced-motion CSS block while retaining 120–160ms color and opacity state feedback.
- Remove `box-shadow` from transition declarations; keep `transform 140ms var(--ease-out)` and color/background transitions.
- Add one 180ms `opacity` + `scale(.97)` `@starting-style` entrance for the occasional conversation transcript, with transform removed under reduced motion.

## Repo conventions to follow

- Easing tokens live in `app/globals.css:18`: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.
- Button press feedback already uses `transform 140ms var(--ease-out)` in `app/globals.css:145`.
- Hover movement is correctly gated at `app/globals.css:472`.

## Steps

1. In `components/ui/bar-visualizer.tsx`, track the reduced-motion media query and do not start `setInterval` while it matches; return stable idle/state values.
2. In `hooks/use-streamed-speech.ts`, return from `startMeter` before starting `requestAnimationFrame` when the same media query matches.
3. In `app/globals.css`, replace the universal transition-duration override with targeted transform suppression and short color/opacity feedback.
4. Remove `box-shadow` from the button transition declarations.
5. Add the transcript entrance and its reduced-motion override.

## Boundaries

- Do NOT change audio playback or Realtime session behavior.
- Do NOT add dependencies.
- Do NOT animate scores, evidence, or chapter text.

## Verification

- **Mechanical**: run `pnpm lint` and `pnpm build`; both exit 0.
- **Feel check**: switch the browser's reduced-motion emulation on and confirm bars are static, buttons retain immediate color feedback, and no element translates or scales on hover/press.
- **Done when**: JS motion loops do not start under reduced motion, the transcript entrance remains legible, and normal-motion press feedback remains under 160ms.
