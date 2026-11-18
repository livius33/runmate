---
phase: 08-test-sweep
plan: 01
completed: 2026-11-18
description: "Plan edits keep every session field"
type: Summary
about: "Runmate"
---


# Phase 8 Plan 01: Plan edits keep every field Summary

**A kettlebell marker switched on in the week editor stays on. The PUT schema of `/api/running/plan-overrides` listed
seven fields and zod dropped the rest; it now lives in `lib/plan/override-schema.ts`, covers `PlanSession` with a
compile-time guard and is tested with the round trip (4b448ad).**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 Kettlebell toggle survives the save | Pass | Round-trip test; in the browser on three days with a reload each (08-03) |
| AC-2 Zone 2 ↔ pace keeps the pace session | Pass | Switched to Zone 2 and back on a tempo day, both states survive a reload (08-03) |
| AC-3 The schema still rejects junk | Pass | Unknown keys and out-of-range values → 400 |

Open: the personal dashboard carries the same schema bug. It gets its own fix there (port, not cherry-pick).
