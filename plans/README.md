# Replay animation improvement plans

| Number | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Ground view entrances with physical motion | LOW | DONE |
| 002 | Stop spinner rotation for reduced motion | MEDIUM | DONE |
| 003 | Respect reduced motion across audio meters | MEDIUM | DONE |

## Recommended execution order

1. **003** — complete the accessibility behavior of the new analyser-backed bar visualizer.
2. **002** — retained historical plan, already complete.
3. **001** — retained historical plan, already complete.

Plan 003 supersedes the broad reduced-motion override left by the earlier visual system and should be kept in sync with both audio hooks.
