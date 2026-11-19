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

## Defects fixed in a third pass (2026-11-19)

The small items seen in the second pass that need no decision, fifteen commits, each fix with a test that failed before:

- **Data:** `/api/import` runs the engine also when a file only replaced or completed a stored run; the Apple Health
  Shortcut route stores runs first and the day last ("last upload" only names a complete upload) and then runs the
  engine with the user's own plan blocks; a workout sent twice in one upload counts once, more than 200 workouts are
  refused; `/api/runner/profile` only stores answers to its questions (unknown keys dropped, wrong kind → 400); the
  cross-training list refuses a `from`/`to` that is no calendar day; one activity that cannot be stored no longer stops
  the sync of the others (such a sync is saved with an error and covers no days); the Garmin card shows `failed` and
  the history import's `rejected` count; an activity that starts before 2000-01-01 or after tomorrow is rejected at
  the ingest; a delivered average speed nobody can reach is ignored and the pace comes from distance and time.
- **Editor:** km typed in on a marked rest day keep the kettlebell marker; a swap or move across the rebuild cut leaves
  and returns as a whole; a saved entry always carries the date of the day it is stored under; "Von dir angepasst." and
  the dot only show for a changed session, not for a marker alone (`changedBy` / `changeWhy` in `lib/plan/effective.ts`,
  used by the editor, the schedule and the today card); move targets are limited to days of the plan's weeks and a
  move into next week opens that week (the panel looked the target up in the week on screen only); restoring one day
  of a swap or move of two alike easy runs restores its own partner (`pairedDays` goes by km where the kind is the same).

Checked beyond the unit tests, against a local Postgres: marker-only label, km on a marked rest day and a move into
next week in the browser; the save route's date handling, the cross-training bounds and the profile check over HTTP;
two files dated 1970 and 2099 through `/api/import`; the Shortcut route over HTTP (run + a workout sent twice, the same
upload again, 201 workouts, a run dated 1970, a wrong token) — the run was stored once, the plan day showed 6/6 and
the engine wrote an `hr-cap` entry for two plan days.

## Open — defects not fixed

- Adapter: ACWR inflated after a pause (up to 4.0; a session softened on ACWR alone a week after the return window).
  The research note does not say what applies after a pause, so nothing was built. Proposal: while a marked pause of
  ≥ 4 days ended fewer than 28 days ago, ACWR alone does not make the engine "tired" (TSB and recovery flags keep
  working). Belongs to the rule decision "ACWR alone triggers after 1 day" above.
- Adapter, seen in the second pass: return caps also cut a test day (a Generalprobe went from 20 to 11 km) and never
  appear in the engine log; `fatigue`, `hrCap` and `recalibrate` do not check the pause window; a runner who stops
  uploading gets no missed-session notice until the next run arrives.
- Editor: a session note is built by code and can still pass 1000 characters (the save is then refused with a message
  naming the day); the swap pairing stays a heuristic — when the partner's km were edited after the move and another
  day in reach matches by km, the wrong day can be taken.
- Data: glitch rows stored before the filter are not cleaned up (needs a decision); a delivered `maxSpeedMs` is stored
  unchecked (nothing reads it); an upload whose `workouts` list holds no valid workout empties that day's stored list
  (the list is taken as the day's full list).
- Seen once, not reproduced: three API calls answered 404 during the local browser tests (the session was not
  recognised for a moment; 404 is what `auth.protect()` answers). Eleven further rounds were clean; cause unknown,
  suspected in the keyless Clerk dev instance.

## Not tested

Undo inside simulations, runs on the wrong day, two runs a day, midnight edges, block end, two live blocks, an empty
plan, B-races inside a block, the frozen past on regeneration, routes against a real Postgres (partly covered by 08-03).
