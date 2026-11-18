---
phase: 08-test-sweep
plan: 02
completed: 2026-11-18
description: "Sweep by four test agents: editor, generator, adapter, data"
type: Summary
about: "Runmate"
---


# Phase 8 Plan 02: Test sweep Summary

**Four agents, each in its own worktree, went through the week editor, the plan generator, the plan adapter and
data in/out. Every defect got a failing test first, then the fix. 19 fix commits merged (2b8e1c9, 7411ab8, 3fdc1ba,
262c937), plus a 60-case generator grid that now runs with the suite (85e80fc). What was not fixed is listed below,
by area, so nothing is lost.**

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1 Findings are reproducible | Pass | One test per fix |
| AC-2 Nothing else moved | Pass | `npx tsc --noEmit` and `npm test` green after each merge |
| AC-3 Open points are written down | Pass | This file |

## Fixed

- **Week editor:** stale overrides after moving a session back or an edit and its inverse; km edit and Tempolauf on a
  day the engine or a return cap changed; a paused day is no move target; an open pause older than 14 days can be ended.
- **Generator:** dress rehearsal never on a day without room for the pace km; recovery weeks and the base block keep
  the day limit; build readable from 10:00/km; no run longer than the long run (a7a5919, reported case: 56 km "tempo"
  on a Friday); key sessions named by their workout (a15aa56).
- **Adapter:** the engine reads the sync record the sync writes; rebalance no longer refills a day the fatigue guard
  softened; self-correction keeps a second rebalance of the same week; taking over one suggestion no longer carries
  another one's km; taking back a rebalance keeps a key session moved onto its day.
- **Data and account:** one upload unpacks to at most 200 MB (zip bomb); Apple Health whole-number fields read decimal
  text; profile heart rates saved as whole numbers (was a 500). Secret scan over the history: clean.

## Open — rule decisions (Livius)

- Low-volume long-run share (11-01): rises to the 40 % ceiling at 32 km/week and below. Built on secondary sources;
  Daniels' 30 % was not checked in the book. Affects every runner under 64 km/week, including the base block.
- Low weeks keep 4 runs although 5 days were stated; `/plan` → Regeln then says "4 Läufe pro Woche".
- Capped base week below the 30-km floor; low day limits flatten cutback and taper weeks; 23 of 1066 recovery weeks
  exceed share × last load week; marathon plan accepted from 5 km/week; recovery after a half with two run days starts
  with a 0-km week; a threshold pace of 2:30/km is accepted (strides at 1:47/km).
- Adapter notes vs code: a missed long run moves up to 7 days (note: 2); ACWR alone triggers after 1 day (note: 3);
  raising the volume has no ramp bound.

## Defects fixed in a second pass (2026-11-18)

Fifteen of the sixteen defects left open by the sweep, each with a test that failed before the fix:

- **Adapter:** runs from file import and Apple Health now count as data coverage (`syncedThrough` = the later of the
  last successful sync and the newest stored run; `adaptation.md` 1.3), so missed sessions are noticed for those users;
  the return cap after a pause no longer hands km the engine took off to another day.
- **Editor:** saves only for days the plan covers (or the editor reaches), with a German reason for a refused save; a
  swapped or moved pair goes back together; the kettlebell toggle stores the marker alone (`strengthOnly`) and the day
  keeps following the engine; a run moved onto a marked rest day keeps the marker; a pause open > 90 days can be ended.
- **Data:** impossible activities are rejected at the ingest (`PLAUSIBLE` in `lib/sources/ingest.ts`) and named in the
  import report; a file stored without detail data is reported as such and completed on re-import; a truncated .gz is
  reported as damaged; impossible dates are refused by the cross-training and Shortcut routes; `/api/runner/profile`
  answers bad JSON with 400; a failed Shortcut upload no longer loses a day's workouts; cross-training ids are UUIDs.

Checked beyond the unit tests: the save route, the kettlebell toggle (on, reload, off) and two bad imports in the
browser against a local Postgres; the reordered Apple Health writes against the same Postgres.

## Open — defects not fixed

- Adapter: ACWR inflated after a pause (up to 4.0; a session softened on ACWR alone a week after the return window).
  The research note does not say what applies after a pause, so nothing was built. Proposal: while a marked pause of
  ≥ 4 days ended fewer than 28 days ago, ACWR alone does not make the engine "tired" (TSB and recovery flags keep
  working). Belongs to the rule decision "ACWR alone triggers after 1 day" above.
- Adapter, seen in the second pass: return caps also cut a test day (a Generalprobe went from 20 to 11 km) and never
  appear in the engine log; `fatigue`, `hrCap` and `recalibrate` do not check the pause window; a runner who stops
  uploading gets no missed-session notice until the next run arrives; the Shortcut route does not run the engine.
- Editor, seen in the second pass: a session note is built by code and can still pass 1000 characters (the save is then
  refused with a message naming the day); `setDayKm` on a marked rest day drops the kettlebell marker; `stripEdits` in
  `rebuild-store.ts` can split a swapped pair; swaps of two same-titled sessions are not recognised as a pair.
- Data, seen in the second pass: glitch rows stored before the filter are not cleaned up; the Garmin history UI does not
  show the rejected count; `/api/import` does not run the engine when a file only replaced rows; `/api/runner/profile`
  stores any JSON object unvalidated; no cap on workouts per Shortcut upload.

## Not tested

Undo inside simulations, runs on the wrong day, two runs a day, midnight edges, block end, two live blocks, an empty
plan, B-races inside a block, the frozen past on regeneration, routes against a real Postgres (partly covered by 08-03).
