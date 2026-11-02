# Research notes for the plan generator and the adaptation engine

This folder holds the research behind Runmate's deterministic plan generator (Phase 7). **Files here are not
templates.** `listMethodologies()` in `lib/plan/methodology/load.ts` reads every `*.md` directly in `methodologies/`
(non-recursively, skipping `README.md`) as a template with a YAML header; anything in this subfolder is ignored by the
loader and by the app. Write notes here, write templates one level up.

Every note follows the same format (see `peak-and-recovery.md`): questions · short answer · evidence table with
citations · proposed deterministic rule (pseudocode) · parameter table (name, default, range, where: template | SAFETY |
engine rule | code constant, basis) · German user-facing explanation text · evidence strength per rule · suggestions for
the plan. Evidence strength is labelled **strong / moderate / weak / convention**; numbers that could not be verified are
marked as such. Schema gaps continue the G-numbering of `RESEARCH.md` (G-1 … G-13 there, G-14 … G-28 in the notes
below).

## Decision index

Pipeline (CONTEXT.md): profile → phases → weekly km → week layout → workouts + long run → safety check → draft.
Adaptation: trigger → strategy → diff → confirm.

| # | Decision | Note | Plan | Status |
|---|---|---|---|---|
| **Generator** | | | | |
| 1 | How the 9 templates were derived, what the schema can express (G-1 … G-13) | [RESEARCH.md](RESEARCH.md) | 07-01, 07-04 | answered |
| 2 | Peak weekly volume and the climb towards it (B, P, g, n, K) | [peak-and-recovery.md](peak-and-recovery.md) §1 | 07-02 | answered |
| 3 | Recovery (down) weeks: depth, placement, restarts, illness interaction | [peak-and-recovery.md](peak-and-recovery.md) §2 | 07-02 | answered |
| 4 | How many load weeks in a row (3:1 vs 4:1, the reference runner's "never more than 3"), the block before the taper, SAFETY bound vs default | [load-cycles.md](load-cycles.md) | 07-02, 07-07 | answered |
| 5 | Phase split, minimum build length per distance, what to cut in short plans | [phases-and-taper.md](phases-and-taper.md) §1 | 07-02 | answered |
| 6 | Taper length, depth, intensity and frequency per distance; race-week layout | [phases-and-taper.md](phases-and-taper.md) §2 | 07-02, 07-03 | answered |
| 7 | Runs per week by level/volume; profile days and day caps as constraints | [week-layout.md](week-layout.md) §1 | 07-03 | answered |
| 8 | Key-session spacing, hard days per week, long-run day, rest day | [week-layout.md](week-layout.md) §2 | 07-03 | answered (convention) |
| 9 | Doubles | [week-layout.md](week-layout.md) §3 | 07-03 (G-2) | answered (convention) |
| 10 | Kettlebell/strength placement relative to key sessions and the long run | [week-layout.md](week-layout.md) §4 | 08-02 | answered |
| 11 | Long-run caps (share, km, minutes) per distance and phase | [long-run.md](long-run.md) §1 | 07-03 | answered |
| 12 | Long-run progression and the single-session spike rule (Frandsen 2025) | [long-run.md](long-run.md) §2 | 07-03, 07-07 | answered |
| 13 | Race pace inside long runs: when, how much | [long-run.md](long-run.md) §3 | 07-03 | answered (convention) |
| 14 | Intensity distribution per phase and distance (pyramidal / polarized / threshold) | [workouts-and-intensity.md](workouts-and-intensity.md) §1 | 07-03 | answered |
| 15 | Workout menus and progressions per phase and distance | [workouts-and-intensity.md](workouts-and-intensity.md) §2 | 07-03, 07-04 follow-up | answered (convention) |
| 16 | When race-pace work starts per distance | [workouts-and-intensity.md](workouts-and-intensity.md) §2.3 | 07-03 (G-18) | answered (convention) |
| 17 | Quality km caps per session and per week | [workouts-and-intensity.md](workouts-and-intensity.md) §3 | 07-03 (G-4) | answered |
| 18 | Pace sources (goal time / VDOT / threshold test) and goal plausibility | [paces.md](paces.md) §1 | 07-03, 07-05 | answered |
| 19 | Mapping paces to the HR model (`hr.ts`) | [paces.md](paces.md) §2 | 07-03 | answered |
| 20 | Novice / masters / high-volume modifiers | [modifiers.md](modifiers.md) §1–3 | 07-02, 07-03 | answered (weak evidence) |
| 21 | Safety check: which limits are SAFETY vs template | every note's parameter table; summary below | 07-02 … 07-07 | answered |
| 22 | Draft review: which warnings to show | phases-and-taper.md §1.3, paces.md §1.2, long-run.md §2.2 | 07-06 | answered |
| **Adaptation** | | | | |
| 23 | Missed km: redistribute vs drop, caps | [adaptation.md](adaptation.md) §1 | 07-07 | answered |
| 24 | Missed key sessions: move / swap / drop, spacing; missed long run | [adaptation.md](adaptation.md) §1, long-run.md §2 | 07-07 | answered |
| 25 | Fatigue triggers: TSB and ACWR thresholds, what the ACWR evidence actually is | [adaptation.md](adaptation.md) §2 | 07-07 | answered |
| 26 | Volume review below/above plan | [adaptation.md](adaptation.md) §3 | 07-07 | answered |
| 27 | Goal adjustment and pace recalibration from tests and races | [paces.md](paces.md) §3, adaptation.md §3 | 07-07 | answered |
| 28 | Illness and return to running (Krank) | [adaptation.md](adaptation.md) §4 | 07-08 | answered (expert guidance) |
| 29 | Holidays and interruptions (Pause/Urlaub) | [adaptation.md](adaptation.md) §4 | 07-08 | answered |
| 30 | When to re-plan the whole block | [adaptation.md](adaptation.md) §5 | 07-07 | answered (convention) |
| 31 | Mapping of the 6 triggers to the 8 strategies; missing triggers | [adaptation.md](adaptation.md) §6 | 07-07 (G-22) | answered |
| 32 | Readiness flags from sleep / HRV | [modifiers.md](modifiers.md) §4 | 07-07, 09-02 | answered, dormant until 09-02 |
| 33 | B-races and tune-ups inside a block | [modifiers.md](modifiers.md) §5 | 07-07, 07-08 | answered (convention) |
| 34 | Post-race recovery, rolling base block, hand-over into a goal block | [between-blocks.md](between-blocks.md) | 07-08, 06-01 | answered (convention) |
| 39 | Subjective feedback after a run (session RPE, Gefühl, Schmerzen) and the weekly feedback as adaptation inputs | [feedback.md](feedback.md) | 07-25, 07-26 | answered (convention; suggestions and hints only) |
| **Cross-training** | | | | |
| 40 | Load of strength, swim, bike and gym sessions (sRPE vs HR-TRIMP, scale 0,2, cycling factor, Porto gate) | [cross-training.md](cross-training.md) | 08-01, 08-04 | answered |
| **Open** | | | | |
| 35 | Backyard template ("Zeit auf den Beinen") | — | later | open |
| 36 | Multi-distance templates (threshold anchor, G-1) | RESEARCH.md G-1, paces.md | later | open |
| 37 | Lactate/HR-guided threshold sessions (Norwegian for amateurs, G-2) | RESEARCH.md G-2 | later | open |
| 38 | Garmin sleep/HRV availability | modifiers.md §4 | 09-02 | open (research endpoints first) |
| 41 | LTHR zone model (Friel's 85/90/95/100 % LTHR shares; how to get an LTHR: test, race, device estimate) — note missing; the option stays hidden (`LTHR_ZONES_ENABLED` in `lib/profile.ts`) until it exists | — (paces.md §2 covers the HFmax model only) | later | open |

## Proposed SAFETY additions (collected)

Existing: `rampMax 0.15`, `acwrMax 1.5`, `tsbFatigue [−40, −10]`, `longRunShareMax 0.40`, `longRunKmMax 42`,
`longRunMinutesMax 240`, `rebalancePctMax 0.5`, `rebalanceKmMax 8`, `fatigueShareMin 0.5`, `recoveryVolumeMax 0.9`,
`taperVolumeMax 1`.

| Proposed | Value | Note | Evidence |
|---|---|---|---|
| `peakOverBaseMax` | 2.0 | peak-and-recovery.md | convention |
| `netGrowthMax` | 0.10 | peak-and-recovery.md | convention |
| `maxLoadWeeksInRow` | 5 | load-cycles.md | convention |
| `maxRampWeeksInRow` | 3 | load-cycles.md | moderate (overreaching studies) |
| `preTaperLoadWeeksMin` | 2 | load-cycles.md | moderate (taper meta-analysis) |
| `taperRaceWeekMax` | 0.60 | phases-and-taper.md | convention |
| `taperMeanMax` | 0.85 | phases-and-taper.md | convention |
| `longRunSpikeMax` | 0.10 | long-run.md | moderate (Frandsen 2025) |
| `qualityKmPerSessionMax` | 0.25 × week | workouts-and-intensity.md | convention |
| novice / masters clamps | fixed | modifiers.md | weak |

## Schema gaps added by these notes (continuing RESEARCH.md G-1 … G-13)

| Gap | What | Note |
|---|---|---|
| G-14 | `phases.taper.{quality_share, last_hard_days_before, runs_delta}`; `week.runs_by_phase` | phases-and-taper.md |
| G-15 | `week.hard_long_km`, `week.max_hard_days` (optional overrides of code constants) | week-layout.md |
| G-16 | `week.strength` placement preferences (low priority; kettlebell lives in the profile) | week-layout.md |
| G-17 | `week.long_run.progression`, `week.long_run.race_pace` | long-run.md |
| G-18 | `workouts.race_specific.start_weeks_before[distance]` | workouts-and-intensity.md |
| G-19 | `paces.hr_zone[name]` (intent only; zones stay in `hr.ts`) | paces.md |
| G-20 | `paces.recalibration` policy (step, confirmation, freeze window) | paces.md |
| G-21 | `volume.recovery_week.max_load_weeks`, `.pattern: fixed | adaptive | both` | load-cycles.md |
| G-22 | Triggers `illness`, `interruption`, `holiday`, `race_result`, `test_result`, `readiness_low`, `long_run_spike`; a trigger for `complete_replan` | adaptation.md |
| G-23 | Strategy parameters (`strategies.volume_adjustment.step`, `goal_adjustment.below_ratio`, …) | adaptation.md |
| G-24 | Fatigue caution band and persistence (`tsb_caution`, `fatigue.persist_days`) — ACWR 3-day persistence + caution note done (07-23); `tsb_caution` and `persist_days` for insertion open | adaptation.md |
| G-25 | Profile fields `yearsRunning`, `injuryHistory`, readiness inputs (HRV, sleep) | modifiers.md |
| G-26 | `adaptation.minor_race` constants (pre/post easy days, gap to goal) | modifiers.md |
| G-27 | `post_race_recovery[distance]`, `base_block` | between-blocks.md |
| G-28 | Triggers `feedback_rpe`, `feedback_pain`, `feedback_week` and their thresholds (07-25 uses code constants) | feedback.md |

## Reading order for a plan

- 07-02 (phases + weekly km): peak-and-recovery → load-cycles → phases-and-taper §1–2.3 rules 1, 6, 7
- 07-03 (week layout, workouts, paces): week-layout → long-run → workouts-and-intensity → paces §1–2 → phases-and-taper §2.3
- 07-05 (picker/editor): workouts-and-intensity §1.2 (PI label), paces §1 (three race paces side by side), load-cycles §5 hint
- 07-06 (review + go live): the warnings listed in decision 22
- 07-07 (adaptation): adaptation → paces §3 → load-cycles §2 rule 5 → modifiers §4–5
- 07-08 (minor races, base block, Krank/Pause): modifiers §5 → between-blocks → adaptation §4–5
