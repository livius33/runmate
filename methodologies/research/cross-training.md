# Research: cross-training load (Kraft, Schwimmen, Rad, Gym)

Status: research note for plans 08-01 (import, RPE, load) and 08-04 (showing cross-training). Extends the load model in
`lib/analytics/load.ts` (TRIMP → CTL/ATL/TSB) to sessions that are not runs. Not a methodology template (the loader
ignores this folder). Written 2026-11-01.

**Questions**

1. How should a strength, swim, bike or gym session count in the load model (TSB, fatigue guard)? With heart rate
   (TRIMP) where it exists, or by session-RPE (minutes × RPE)?
2. Is the HR of a swim or a bike ride comparable to running HR, i.e. can the one HR model (`lib/analytics/hr.ts`,
   HFmax 200, HFrest 65) be reused as it is?
3. Does cycling load count 1:1 against running load, or with a discount?
4. What is the scale between session-RPE and TRIMP, and is 0,2 (decided for kettlebell in 08-01) still right?
5. What must stay runs-only? (km, ACWR, Prognose, recalibration, pace checks, run lists)

**Short answer**

- **One load unit for every sport, TRIMP-equivalent.** Runs keep Banister's HR-TRIMP. Strength and swimming use
  session-RPE (`minutes × RPE × 0,2`), because wrist HR understates strength work and is unreliable or absent in water.
  Cycling and gym cardio use HR-TRIMP when an average HR exists, session-RPE otherwise. No cross-training session is
  ever counted by HR *and* RPE.
- **Cycling counts 1:1 by HR, no extra discount.** Foster's session-RPE diary adds cycling, skating, weights and running
  in the same unit (Foster 2001, Table 5); the multi-sport Performance Management Chart does the same with TSS. The
  lower HR of cycling at equal oxygen uptake already discounts the number. A `BIKE_LOAD_FACTOR` constant (1,0) keeps
  the knob visible.
- **sRPE → TRIMP scale stays 0,2.** The reference runner's easy runs since June 2026 carry a median 1,03 TRIMP per minute (n = 65,
  regeneration runs 1,00); an easy session is RPE 5 on the 1–10 scale, and 5 × 0,2 = 1,0 TRIMP/min. Tempo runs are
  1,6 TRIMP/min ≈ RPE 8 × 0,2. Default RPE when none is tapped: 6 (middle of the expected 5–8).
- **Porto stays frozen.** Cross-training load counts from 2026-11-09 (`CROSS_LOAD_FROM`); rows before that are imported
  and shown but carry no load, so the race-week readiness, the race-day TSB projection and the fatigue guard are
  byte-identical to today. Prod has no non-run rows today (checked read-only 2026-11-01), so the fitness numbers are
  unchanged either way.
- **Runs-only stays runs-only:** km, ACWR, weekly grid km, Prognose, recalibration, pace checks, run metrics and the
  run lists filter on `RUN_ACTIVITY_TYPES`. Cross-training adds to TSB only.

## 1. Evidence

| # | Finding | Source | Strength |
|---|---|---|---|
| 1 | Session-RPE (CR-10 RPE × minutes) is a valid single-number load for steady, interval and very high intensity work; the same unit is used across cycling, skating, running and resistance training in one diary (Table 5: "Cycle 100 km RPE 5 · 180 min · 940", "Explosive weights RPE 7 · 40 min · 280") | Foster C et al. (2001) A new approach to monitoring exercise training. *J Strength Cond Res* 15(1):109–115. [PubMed 11708692](https://pubmed.ncbi.nlm.nih.gov/11708692/) | strong |
| 2 | Session-RPE correlates with HR-based load (Banister TRIMP, Edwards zones) and with distance in competitive swimmers; proposed as the practical measure for swim training | Wallace LK, Slattery KM, Coutts AJ (2009) The ecological validity and application of the session-RPE method for quantifying training loads in swimming. *J Strength Cond Res* 23(1):33–38. [PubMed 19002069](https://pubmed.ncbi.nlm.nih.gov/19002069/) | moderate |
| 3 | Session-RPE is valid and practical across sports, including resistance training; influencing factors (time of rating, training status) reviewed | Haddad M et al. (2017) Session-RPE method for training load monitoring: validity, ecological usefulness, and influencing factors. *Front Neurosci* 11:612. [doi 10.3389/fnins.2017.00612](https://www.frontiersin.org/journals/neuroscience/articles/10.3389/fnins.2017.00612/full) | moderate (review) |
| 4 | Maximal HR in swimming is lower than in running: 6,7 ± 5,3 bpm lower in a 2019 swimmer study; 11–21 bpm lower in the classic immersion studies (face immersion, horizontal position, cooling) | Olstad BH et al. (2019) Maximal heart rate for swimmers. *Sports (Basel)* 7(11):235. [PMC6915385](https://pmc.ncbi.nlm.nih.gov/articles/PMC6915385/); McArdle WD, Glaser RM, Magel JR (1971) Metabolic and cardiorespiratory response during free swimming and treadmill walking. *J Appl Physiol* 30(5):733–738. [doi 10.1152/jappl.1971.30.5.733](https://journals.physiology.org/doi/pdf/10.1152/jappl.1971.30.5.733) | strong |
| 5 | Wrist optical HR is not available or not reliable in the water on most Garmin running watches; swim HR needs a chest strap (HRM-Pro/Swim) | Garmin support, "Wrist-based heart rate while swimming" (checked 2026-11-01; model-dependent) | convention |
| 6 | Cycling cross-training improves running performance, but less than the same training load as running (3,2 km time trial: running −26 s, cycling −13 s, control −5 s) — the aerobic stimulus transfers, the specific one does not | Foster C, Hector LL, Welsh R, Schrager M, Green MA, Snyder AC (1995) Effects of specific versus cross-training on running performance. *Eur J Appl Physiol* 70(4):367–372. [PubMed 7649149](https://pubmed.ncbi.nlm.nih.gov/7649149/) | moderate |
| 7 | Banister's TRIMP: minutes × HR-reserve fraction × 0,64 · e^(1,92 · HRR) for men; the model behind CTL/ATL/TSB in `load.ts` | Banister EW (1991) Modeling elite athletic performance. In: *Physiological Testing of Elite Athletes*, Human Kinetics, 403–424; Morton RH, Fitz-Clarke JR, Banister EW (1990) Modeling human performance in running. *J Appl Physiol* 69(3):1171–1177 | strong (model) |
| 8 | The reference runner's own data (read-only, 2026-06-01 … 2026-10-29, runs > 10 min with HR): median TRIMP per minute Locker 1,03 (n = 65), Regeneration 1,00 (7), Longrun 1,28 (18), Laufband 0,95 (6), Tempo 1,61 (8) | prod query 2026-11-01 | measured |
| 9 | Strength work raises HR little for the muscular strain it causes; HR-based load understates it (Foster 2001 discussion: "muscularly strong individuals are comparatively poor at rating" only on HR, sRPE still tracks); 08-01 decided: never HR for strength | Foster 2001 (#1); STATE decision 08-01 | moderate |

Not found: a validated discount factor between cycling TRIMP and running TRIMP for a runner's fatigue. Multi-sport
tools (TrainingPeaks PMC) add rTSS, TSS, sTSS and hrTSS 1:1. Any discount here would be a guess, so the factor is 1,0
and named.

## 2. Proposed deterministic rule

```
SRPE_TO_TRIMP     = 0.2          // TRIMP per (minute × RPE); easy run ≈ 1.0 TRIMP/min ≈ RPE 5
DEFAULT_RPE       = 6            // when no RPE was tapped (middle of 5–8)
BIKE_LOAD_FACTOR  = 1.0          // cycling / gym HR-TRIMP against running TRIMP (no evidence for less)
CROSS_LOAD_FROM   = 2026-11-09   // Porto block frozen: cross-training load counts from the day after the race

load(row):
  if row.type in RUN_ACTIVITY_TYPES (or row has no type):      unchanged: HR-TRIMP, else sufferScore × 0.4
  if row.date < CROSS_LOAD_FROM:                                0
  sport = sportOf(row.type)                                     // Strength | Swim | Ride | Gym
  if sport in (Strength, Swim):                                 minutes × (rpe ?? DEFAULT_RPE) × SRPE_TO_TRIMP
  if sport in (Ride, Gym):
      if row.averageHr > HR_REST:                               trimp(durationS, averageHr) × BIKE_LOAD_FACTOR
      else:                                                     minutes × (rpe ?? DEFAULT_RPE) × SRPE_TO_TRIMP

ACWR, km, Prognose, recalibration, pace checks, run metrics, run lists: rows where type in RUN_ACTIVITY_TYPES only.
```

Sport mapping of Garmin `activityType.typeKey` (stored as `activities.type` / `sport_type`):

| `type` | Label | Garmin typeKeys | Load |
|---|---|---|---|
| `Strength` | Kraft | `strength_training` | sRPE, never HR |
| `Swim` | Schwimmen | `lap_swimming`, `open_water_swimming`, `swimming` (any key containing `swim`) | sRPE, never HR |
| `Ride` | Rad | `cycling`, `road_biking`, `indoor_cycling`, `virtual_ride`, `mountain_biking`, `gravel_cycling`, `cyclocross`, `track_cycling`, `recumbent_cycling`, `e_bike_fitness`, `e_bike_mountain`, `bmx` (any key containing `cycling`, `biking`, `bike`, `ride`) | HR-TRIMP × 1,0, else sRPE |
| `Gym` | Gym | `indoor_cardio`, `fitness_equipment`, `cardio_training`, `hiit`, `elliptical`, `stair_climbing`, `indoor_rowing`, `rowing` | HR-TRIMP × 1,0, else sRPE |

E-bike rides count like rides: the HR says how hard it was. Walking, hiking, yoga, pilates, breathwork and the rest
stay out of the import as before (no load, no list) — open point below.

## 3. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `SRPE_TO_TRIMP` | 0,2 | 0,15–0,25 | code constant (`load.ts`) | The reference runner's easy runs 1,03 TRIMP/min (#8) vs RPE 5; Foster 2001 (#1) |
| `DEFAULT_RPE` | 6 | 5–7 | code constant | 08-01 decision; middle of the expected 5–8 |
| `BIKE_LOAD_FACTOR` | 1,0 | 0,7–1,0 | code constant | no validated discount (#6, multi-sport PMC convention) |
| `CROSS_LOAD_FROM` | 2026-11-09 | — | code constant | Porto block frozen (STATE 2026-10-23) |
| RPE scale | 1–10 | — | `activities.perceived_exertion` | Foster CR-10 (#1); shared with run RPE (07-25) |
| Manual entry | 5–480 min | — | API validation | kettlebell 30–40 min up to a long ride |

## 4. German explanation (user-facing)

"Kraft, Schwimmen, Rad und Gym zählen in Fitness und Ermüdung (TSB) mit, nicht in den Lauf-km. Kraft und Schwimmen
rechnen wir aus Minuten × Anstrengung (RPE 1–10, ohne Angabe 6): der Puls unterschätzt Krafttraining und ist im
Wasser nicht verlässlich. Rad und Gym rechnen wir über den Puls wie einen Lauf, ohne Puls ebenfalls aus Minuten × RPE.
Bis zum Porto-Marathon bleibt alles wie geplant: die Einheiten erscheinen, zählen aber erst ab dem 9.11. in die Form."

## 5. Evidence strength per rule

| Rule | Strength |
|---|---|
| sRPE for strength and swimming | strong (Foster 2001) / moderate (Wallace 2009) |
| No HR-TRIMP for swimming with the running HR model | strong (lower swim HRmax, #4; wrist HR in water, #5) |
| HR-TRIMP for cycling and gym cardio, factor 1,0 | convention (no validated factor; aerobic transfer exists, #6) |
| Scale 0,2 | measured on the reference runner's runs (#8), consistent with Foster's unit |
| Default RPE 6 | convention (08-01) |
| Cross-training never in km / ACWR / pace rules | convention: those rules are calibrated on running km and pace |

## 6. Suggestions for the plan

- Kettlebell days as plan markers (08-02) stay as planned; this note only fixes how the done sessions count.
- Revisit `BIKE_LOAD_FACTOR` after the first base block with bike rides: if TSB drops below −25 on days after an easy
  ride while the legs feel fine, 0,75 is the obvious second value.
- Apple Health workouts (09-07, table `health_workouts`) are not merged into the load yet; Garmin is the source for
  anything recorded with the watch. Merge only if a sport is recorded on the phone alone (open).
- Walking/hiking as load: out for now (very low TRIMP/min, would clutter the lists). Open.
