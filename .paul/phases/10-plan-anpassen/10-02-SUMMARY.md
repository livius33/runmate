---
phase: 10-plan-anpassen
plan: 02
completed: 2026-11-18
description: "Rebuild model: preview, reasons, data check, apply, undo"
type: Summary
about: "Runmate"
---


# Phase 10 Plan 02: Rebuild model Summary

**One function family takes a live generated block and a change (goal time, race date, method, profile, base km) and
returns the block with the same past and a new rest: a fresh generator run from next Monday. Pure model in
`lib/plan/rebuild.ts` (9b0c5d0), store and route with preview, apply, undo and history (c02a2c6).**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 No change → past weeks identical | Pass | |
| AC-2 Change → new rest from the generator, with reasons | Pass | Before/after per week, reasons carry the numbers |
| AC-3 Too close to the race → refused with a German sentence | Pass | Fewer than taper + 3 weeks |
| AC-4 Base: mean of the last 2 completed weeks; return base after a marked pause | Pass | Sources `runs2` and `return` |
| AC-5 Data check: base good / thin / missing, goal checked / unchecked | Pass | A manual value is always allowed |
| AC-6 Apply stores removed edits in the history; undo restores them | Pass | |
| AC-7 Preview free, apply needs `rebuild` | Pass | 402 with the upsell; preview writes nothing |
| AC-8 A rebuilt block passes the generator's invariants | Pass | Property test over the grid |

33 tests (`tests/plan/rebuild.test.ts`, `tests/plan/rebuild-store.test.ts`).
