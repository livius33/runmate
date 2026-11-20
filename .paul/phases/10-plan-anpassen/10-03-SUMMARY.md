---
phase: 10-plan-anpassen
plan: 03
completed: 2026-11-18
description: "Plan anpassen changes the whole plan"
type: Summary
about: "Runmate"
---


# Phase 10 Plan 03: Plan anpassen page Summary

**The page changes the plan as a whole. Three cards (Ziel und Rennen, Alltag, Unterbrechung) feed one preview:
before/after totals, weekly bars, reasons, warnings, week by week. "Übernehmen" and "Zurücknehmen" run through the
rebuild store; the history lists rebuilds next to single suggestions (405c6e4).**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 Ziel und Rennen: goal time, race date, method with data check and preview | Pass | |
| AC-2 Alltag: days, long-run day, caps; a live plan changes only through the preview | Pass | |
| AC-3 Unterbrechung: Krank/Pause here too; rebuild offer from 14 days | Pass | |
| AC-4 Vorschläge und Verlauf: suggestions plus one history | Pass | |
| AC-5 Without Plus: preview works, "Übernehmen" shows the upsell | Pass (tests) | Not driven in the browser: the local instance runs without billing |
| AC-6 No live generated block → says what is missing, links to `/plan/neu` | Pass | |
| AC-7 Wide grid on desktop, one column on a phone | Pass | |
| AC-8 Checked at 390 and 1440 px | Pass | 08-03: no overflow, no console error |
