---
phase: 11-onboarding
plan: 01
completed: 2026-11-18
description: "Onboarding for a runner Runmate knows nothing about"
type: Summary
about: "Runmate"
---


# Phase 11 Plan 01: Onboarding Summary

**Sign in → consent → profile → data source or skip → race or "Erstmal ohne Ziel" → first plan → overview, walked with
new accounts on both paths at 1440 and 390 px, and fixed where it got in the way (67c206e). A runner without a single
recorded run now gets a plan that looks like training: 30 km on 5 days with a 12-km longest run starts with
6, 6, 6, 12 km instead of five runs of 5 km and 10 km.**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 "weiß ich nicht" ticks on a click on the text; empty HFmax is estimated from the age or asked for | Pass | Never the silent example value |
| AC-2 Longest run of the last 4 weeks (optional) | Pass | Stored in the training profile |
| AC-3 Goal step without runs: longest run from the profile, else weekly km ÷ run days | Pass | A measured run always wins |
| AC-3b Low volume: long-run share rises from the template's value at 64 km/week to 40 % at 32 km | Pass | Research note long-run.md 1.3 first. **Rule decision to confirm** (see 08-02 SUMMARY) |
| AC-4 "Ohne Ziel": base weeks with a long run from the same number; no session at an example pace | Pass | Strides instead of a threshold session without a known pace |
| AC-5 Preview: race pace, one pace hint per source, no internal notes | Pass | |
| AC-6 No source connected: header offers "Datenquelle verbinden" | Pass | |
| AC-7 Walked again, both paths, both widths | Pass | No console error, no overflow |
| AC-8 tsc and tests green, new rules tested | Pass | |

Open for Livius: the base block for an unknown runner shows the example easy pace "ca. 6:20/km"; should the
onboarding's undated "Bestzeit oder letztes Rennen" count as a recent race for the paces?
