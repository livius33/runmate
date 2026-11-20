# Research: changes the runner asks for — goal time, race date, method, weekdays, interruption

Status: research note for milestone v1.1, plans 10-02 (change model) and 10-03 (page „Plan anpassen“). It adds no new
training science: the rules it needs are in `adaptation.md` §4–5, `phases-and-taper.md` §1, `paces.md` §1 and §3,
`peak-and-recovery.md` §1 and `week-layout.md` §1. What is new here: which of those rules apply when the **runner**
changes something (not the engine), what the plan may be rebuilt from, when the data is good enough to recommend a
value, and what the runner is shown before anything changes.

## Questions

1. The runner changes goal time, race date, method or weekly availability inside a live block: patch or rebuild?
2. What does a rebuild start from, and what stays untouched?
3. What is the base after an interruption?
4. How late can a block still be rebuilt?
5. When is the data good enough to recommend a value, and what happens when it is not?
6. What must the runner see before the change, and how is it reversed?

## Short answer

- **Rebuild, not patch.** Each of the four levers changes an input of the generator (goal pace, number of weeks,
  template, days). `adaptation.md` §5 already names race date and "the user asks" as `complete_replan`. A rebuild runs
  the same generator with the changed input, so every safety limit of a fresh plan holds for the rest of the block.
- **From next Monday; the past stays.** Past weeks and the running week are never changed (the week in progress has
  runs in it and the runner's own edits). Manual and engine edits from the cut on belong to sessions that no longer
  exist; they are removed and restored by an undo.
- **Base = what was run, not what was planned.** `adaptation.md` §5: mean of the last 2 run weeks. After an
  interruption the base is a share of the level before it (0.7 from 4 days, 0.5 from 28 days), never below what was
  actually run.
- **Not in the taper.** The generator needs taper + 3 weeks (`phases-and-taper.md` §1.3, hard floor). Below that the
  block stays as it is and single days are edited in the week view. "Nothing new in the taper" is also the pace rule
  (`paces.md` §3: no recalibration in the last 4 weeks).
- **Data check per value.** A measured value is recommended only when its data is there (base: runs in ≥ 3 of the last
  4 weeks; goal: a race in the last 6 months or a threshold test). Otherwise the page says what is missing and takes a
  typed value, marked as typed.
- **Preview before, undo after.** Before: weeks, peak, weekly km old/new, key sessions, taper start, paces, the
  generator's warnings and one reason per difference, with numbers. After: one undo that restores the block and the
  removed edits.

## 1. Evidence and practice

| Source | Finding | Used for |
|---|---|---|
| `adaptation.md` §5 (convention) | Re-plan when race date or distance changes, after ≥ 14 days out, when the 4-week volume ratio is < 0.70, or when the user asks; start from the Monday after today, B = mean of the last 2 run weeks | rebuild procedure |
| Damsted et al. 2019, *J Orthop Sports Phys Ther* 49(4):230–238 | Weekly distance increases of > 20 % went with more injuries in half-marathon preparation than ≤ 20 % | the rebuilt first week starts at the run level, not the planned one |
| Frandsen et al. 2025, *Br J Sports Med* 59(17):1203–1210 | A single run more than 10 % longer than the longest of the last 30 days raises injury risk | the long run of the rebuilt plan starts from the longest run of the last 30 days (generator, unchanged) |
| Mujika & Padilla 2000, *Sports Med* 30(2):79–87 | Short-term detraining (< 4 weeks) already lowers VO2max and blood volume; long-term (> 4 weeks) loses more and takes longer to come back | lower base share from 28 days |
| Schwellnus et al. 2016, *Br J Sports Med* 50(17):1043–1052 | Graded return after illness; rapid load changes raise illness risk | staged return (exists, `lib/plan/pause.ts`) |
| Bosquet et al. 2007, *Med Sci Sports Exerc* 39(8):1358–1365 (as cited in `phases-and-taper.md` §2) | Taper: volume down, intensity and frequency kept | no structural change inside the taper |
| Daniels 2014 [B], secondary summaries only | Training paces move up by at most one VDOT step after several weeks at one level; a race result can move them at once | a faster goal is a warning, not a block (`paces.md` §1.2); not verified against the book |
| `phases-and-taper.md` §1.2–1.3 (convention) | Minimum weeks 12 / 8 / 6 as a warning, hard floor taper + 3; what is cut first when weeks are short | moving the race date |
| `week-layout.md` §1 (convention) | Runs per week follow the profile's days; fewer days means fewer km, not longer days beyond the caps | weekday changes |

There is no trial that compares "rebuild" against "patch" after a goal or date change. The procedure is convention,
built from limits that have evidence (weekly increase, long-run spike, taper).

## 2. Proposed rules

```text
rebuild(block, change, today)
  cut      = Monday after today
  refuse   when cut > race date − (taper weeks + 3) weeks        "zu kurz" (generator's own error)
  inputs   goal      = change.goalS      ?? block goal
           raceDate  = change.raceDate   ?? block race date
           template  = change.templateId ?? template the block was built from
           profile   = change.profile    ?? stored profile
           B         = change.currentKm  ?? base(today)             see below
           P         = measured (52 weeks), unchanged
           longest30 = measured, unchanged
  draft    = generateDraft(start = cut, inputs)
  block'   = weeks and sessions of block before cut  +  draft from cut  (+ recovery weeks after the race)
  edits    manual and engine edits with date ≥ cut are removed and kept for the undo
  nothing is saved before the runner confirms the preview

base(today)
  runs2    = mean km of the last 2 completed weeks
  pause    = a marked pause (krank/pause) with ≥ returnRules.recoveryDays (4) days in the last 28 days
  if no pause:            B = runs2                                   source "Schnitt deiner letzten 2 Wochen"
  else: before = mean km of the 2 completed weeks before the pause began
        share  = 0.7 for 4–27 paused days, 0.5 from 28 days
        B      = max(runs2, share × before)                           source "Wiedereinstieg nach {n} Tagen Pause"
  B is rounded to 0.5 km; B = 0 → no recommendation (data check)

data check (per value; never blocks a typed value inside the generator's ranges)
  base       good:    runs in ≥ 3 of the last 4 completed weeks
             thin:    runs in 1–2 of them      → value shown, "bitte prüfen", typed value offered first
             missing: no run in 4 weeks        → typed value required
  goal time  checked: a race ≤ 6 months old or a threshold test exists → plausibility warning from paces.md §1.2
             unchecked: neither                → allowed, text "nicht prüfbar: kein Rennen in den letzten 6 Monaten"
  long run   good:    a run in the last 30 days; else the generator's conservative start, said in one line
  sleep/HRV  never needed for a rebuild

preview (old rest of the block vs new)
  per week: km old → new, kind (Belastung/Erholung/Taper), key sessions
  totals:   weeks to the race, peak km, longest long run, taper start, race pace, easy pace
  reasons:  one sentence per difference, with the numbers that caused it
  removed:  how many own edits and engine changes from the cut on go away
```

Changing the **race date** also changes the Saison goal (the block's anchor). Earlier date: the generator shortens
phases in its `shorten_order`; later date: more weeks, the same peak rules. Changing the **distance** is a new plan
(`/plan/neu`), not a rebuild: a block is bound to its goal.

**Weekdays** (profile): saving the profile alone changes nothing in a live block (a frozen block does not follow the
profile). The page says so and offers the rebuild with the new days.

**Interruption**: marking Krank/Pause and the staged return stay as they are (`lib/plan/pause.ts`, 0.7 → 0.9, long run
≤ 0.8). From 14 paused days the page offers the rebuild with the base above instead of only naming it.

## 3. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `REBUILD.baseWeeks` | 2 | fixed | code constant | `adaptation.md` §5. **Convention** |
| `REBUILD.pauseLookbackDays` | 28 | fixed | code constant | same window as `RETURN_RULES.lookbackDays`. **Convention** |
| `REBUILD.returnShare` | 0.7 | fixed | code constant | = `RETURN_RULES.week1Share`; graded-return guidance. **Weak** |
| `REBUILD.longReturnShare` / `longPauseDays` | 0.5 / 28 | fixed | code constant | Mujika & Padilla 2000 (> 4 weeks = long-term detraining); the share itself is **convention** |
| `DATA.baseWeeksGood` | 3 of 4 | fixed | code constant | **Convention** |
| hard floor taper + 3 weeks | fixed | — | safety (exists) | `phases-and-taper.md` §1.3 |

No new template field and no new SAFETY entry: a rebuild is a generator run and inherits its limits.

## 4. German explanation text

> **Was passiert, wenn du den Plan neu aufbaust?** Runmate plant die Wochen ab dem nächsten Montag neu, mit denselben
> Regeln wie bei einem neuen Plan. Alles davor bleibt, wie es war. Grundlage ist, was du zuletzt wirklich gelaufen
> bist: der Schnitt deiner letzten zwei Wochen, nach einer Pause ein Teil deines Umfangs davor. Eigene Änderungen ab
> dem nächsten Montag fallen weg, weil es die Einheiten dann nicht mehr gibt. Vor dem Übernehmen siehst du alt und neu
> nebeneinander, danach kannst du es rückgängig machen. In den letzten Wochen vor dem Rennen wird nicht mehr neu
> aufgebaut: dort änderst du einzelne Tage in der Wochenansicht.

## 5. Strength of evidence per rule

| Rule | Strength |
|---|---|
| Start the rebuilt plan from the run level, not the planned level | **Moderate** (weekly-increase studies) |
| Long run from the longest run of the last 30 days | **Moderate** (Frandsen 2025) |
| No rebuild inside taper + 3 weeks | **Moderate** for "nothing new in the taper", the number is **convention** |
| Base share 0.7 / 0.5 after an interruption | **Weak / convention** |
| Data thresholds (3 of 4 weeks, 6 months) | **Convention** |
| Rebuild instead of patch for goal, date, method, weekdays | **Convention** |

## 6. Suggestions for the plans

1. 10-02: `lib/plan/rebuild.ts` (pure: base, data check, splice, preview with reasons, undo entry) and a store that
   writes block, edits and history in one step. A new base source for the generator's wording ("Schnitt deiner letzten
   2 Wochen", "Wiedereinstieg nach der Pause") instead of "von dir gesetzt".
2. 10-03: the page in four areas; the preview is the same component for every lever.
3. Later: a pace-only change inside the taper (goal time), and distance changes as a guided new plan.

## Sources

See `adaptation.md`, `phases-and-taper.md`, `paces.md` and `long-run.md` for the full references of the studies named
above. Not verified in this session: Daniels' wording on VDOT steps (secondary summaries only).
