# Methodik-Vorlagen – Recherche, Mapping, Schema-Lücken (07-04 Entwurf)

This file documents how the templates in `methodologies/` were derived: key facts per method with sources, how they
were mapped to template parameters, a comparison table, and a gap report for the schema. It lives in the subfolder
`methodologies/research/` because `listMethodologies()` reads every `*.md` directly in `methodologies/` except `README.md`
as a template (non-recursive); a research file there would be reported as invalid.

## 0. Design decision: one file per method × distance

`paces.offsets` are seconds per km **relative to the race pace of the template's goal race**, and the intensity bands use
the same reference ("moderate" = quality km up to 15 s/km faster than race pace, see `describe.ts`, `MODERATE_BAND_S`). A
3:05 marathoner's threshold pace is ≈ −14 s/km from marathon pace but ≈ +4 s/km from a sub-1:25 half-marathon pace; easy
pace is ≈ +60 vs. ≈ +75. A template listing both `half` and `marathon` therefore produces wrong paces and wrong intensity
shares for one of them. To keep every file correct under the current schema, each file supports **one** distance and the
method is split where both distances matter (Daniels, Pfitzinger). This is gap G-1 below.

Result: **8 new templates, 6 methods** — 4 half-marathon options (user's next goal: HM ~02/2027, sub 1:25) and 4 marathon
options.

## 1. Comparison

| id | Idea | Dist. | Runs/wk | Intensity build (km, easy/mod/hard) | Long-run cap | Taper | Suits |
|---|---|---|---|---|---|---|---|
| `daniels-marathon` | Every stimulus at the pace that triggers it; VDOT paces; phases I–IV; 2 Q days | M | 6 | 84/6/10 (peak 78/18/4) | 25 %, 32 km, 150 min | 3 wk 80/70/45 % | experienced, wants numbers, recent race result |
| `daniels-half` | same, T pace as HM core | HM | 6 | 84/7/9 (peak 80/15/5) | 25 %, 26 km, 120 min | 2 wk 80/55 % | experienced, time goal, recent race |
| `pfitzinger-marathon` | Volume + midweek medium-long run + LT runs + MP long runs | M | 6 | 84/13/3 (peak 80/13/7) | 32 %, 35 km, 210 min | 3 wk 78/60/40 % | high mileage (≥ 70 km base), ambitious |
| `pfitzinger-half` | LT run as the core, VO2max + medium-long run | HM | 6 | 82/13/5 | 28 %, 27 km, 140 min | 2 wk 80/55 % | ≥ 50 km/wk, time goal |
| `hansons-marathon` | Cumulative fatigue, 3 SOS, long run capped at 16 mi | M | 6 | 76/16/8 (peak 73/27/0) | 30 %, 26 km, 180 min | 2 wk (~10 d) 85/45 % | 6 days/wk available, no 3-h runs |
| `polarized-80-20-half` | 80 % easy, 20 % hard, little grey zone | HM | 6 | 82/6/12 (peak 80/12/8) | 30 %, 24 km, 120 min | 2 wk 75/50 % | all levels, limited time, "everything moderately fast" runners |
| `norwegian-threshold-half` | Lots of easy volume + 3 controlled sub-threshold interval sessions | HM | 6 | 77/21/2 | 25 %, 24 km, 110 min | 2 wk 90/60 % | disciplined, 60–100 km/wk, 10 k–HM |
| `lydiard-marathon` | Aerobic base → hills → anaerobic → coordination → freshen | M | 7 | 82/6/12 (base 88/12/0) | 30 %, 35 km, 180 min | 2 wk 75/45 % | long lead time, likes volume |
| `runmate-porto-2026` (existing) | The reference runner's measured Porto plan | M | 6 | 81/12/7 | 33 %, 41 km, 240 min | 3 wk 70/56/24 % | — |

Phase split (base/build/peak of pre-taper weeks): Daniels 25/50/25 · Pfitz-M 40/33/27 · Pfitz-HM 35/35/30 · Hansons
31/31/38 · 80/20 35/40/25 · Norwegian 30/45/25 · Lydiard 50/33/17.

## 2. Per template: key facts, sources, mapping

Legend: **[B]** = from the method's book (to the best of my knowledge of the text; secondary reviews consulted where
possible), **[P]** = peer-reviewed, **[D]** = my default where the source gives a range or nothing, **[S]** = clamped or
shaped by Runmate's schema/safety limits.

### 2.1 Daniels (`daniels-marathon`, `daniels-half`)

Sources: Daniels, J. (2014) *Daniels' Running Formula*, 3rd ed., Human Kinetics; (2022) 4th ed. Secondary check:
reviews of the 2Q plan (3rd ed., ch. 14, table 14.3: 2Q = two quality days, Q1 is usually the long run in marathon plans;
longest run ≈ 32 km in the 56–70 mi plan; peak-mileage tiers 40/55/70/85/100/120/120+ mi).

| Fact | Mapping |
|---|---|
| Ideal season 24 weeks = 4 phases × 6 weeks: I foundation (E, L, strides), II early quality (R), III transition quality (I, hardest), IV final quality (T, M / race-specific) [B] | `split` 25/50/25 with build = II+III; `key_sessions.base` 0; workouts per phase as listed |
| Paces from a race result via VDOT: E, M, T, I, R [B] | `paces.source: vdot`; offsets computed for VDOT ≈ 52 (3:05 M: M 4:23, T ≈ 4:09, I ≈ 3:50, R ≈ 3:35/km) and ≈ 54–55 (1:25 HM: T ≈ 3:57–4:02, I ≈ 3:43) relative to race pace [B/D] |
| Per-session caps: L ≤ 25 % of weekly mileage (30 % below ~40 mi/wk) and ≤ 150 min; M ≤ 20 % or 18 mi; T ≤ 10 %; I ≤ 8 % or 10 km; R ≤ 5 % or 8 km [B] | `long_run.share` 0.25, `max_minutes` 150 (HM 120 [D]); other caps only as notes → gap G-4 |
| Mileage: hold a level 3–4 weeks, then add ≤ 1 mile per weekly session [B] | `ramp_max` 0.10 (≈ +6 mi on 60 mi at 6 runs); step pattern → gap G-6 |
| No fixed recovery weeks; 2Q weekly volumes vary between ~70 and 100 % of peak [B, secondary] | `recovery_week` every 4 @ 0.85 [D/S] |
| Missed Q day: don't make it up / don't double up [B] | `missed_km: drop`, `missed_key: move` ≤ 3 days |
| Shorter season: keep phase I and IV, shorten II/III first [B] | body text only → gap G-7 |
| Taper: no single % rule across plans [B] | M 80/70/45, HM 80/55 [D] within Bosquet et al. 2007 [P] (2 wk, −41–60 %) |

### 2.2 Pfitzinger (`pfitzinger-marathon`, `pfitzinger-half`)

Sources: Pfitzinger, P. & Douglas, S. (2019) *Advanced Marathoning*, 3rd ed.; (2009) 2nd ed.; Pfitzinger, P. & Latter, P.
(2015) *Faster Road Racing: 5K to Half Marathon*. Secondary: plan reviews (mileage tiers ≤ 55, 55–70, 70–85, 85+ mi;
18- and 12-week plans; mileage builds over 5–6 weeks, holds 8–9 weeks near peak, then 3-week taper; LT = 15 k–HM pace;
long run 10–20 % slower than MP; general aerobic 15–25 % slower than MP; VO2max 600–1600 m at ~5 k pace; long runs up to
20–22 mi).

| Fact | Mapping |
|---|---|
| 18-wk plan mesocycles: endurance (~6) → LT + endurance (~5) → race preparation (~4) → taper + race (3) [B] | `split` 40/33/27, `taper.weeks.marathon` 3 |
| Taper: roughly −20–25 %, −40 %, −60 % in the last three weeks [B, 2nd ed.] | `taper.volume` [0.78, 0.60, 0.40] |
| Builds to near peak in 5–6 weeks, then holds [B/secondary] | `volume.start` 0.75, base → 0.92, build/peak 0.92–1.0 |
| Medium-long run 11–16 mi midweek; long run up to 20–22 mi [B] | `medium_long` 18–26 km; `long_run.max_km` 35, `share` 0.32 (35/113) |
| Key days can be consecutive (LT Tue, MLR Wed) [B] | `key_gap_days` 1, `key_sessions` 2/3/3/2 |
| Paces: GA +15–25 %, long +10–20 %, LT 15 k–HM pace, VO2 ≈ 5 k [B] | offsets easy +55, long +40, threshold −15, VO2 −38 (for 263 s/km MP) |
| Tier default 18/70 (6 runs) [D] | `runs` 6; tiers → gap G-8 |
| Recovery weeks at mesocycle ends, tune-up races [B] | every 5 @ 0.82 [D] |
| Half: LT runs central, VO2max, MLR, tune-up races 8–15 k [B] | `pfitzinger-half` workouts; phase lengths, taper 2 wk 80/55, long-run cap 27 km are **[D]** — I could not verify the FRR half-marathon tables line by line; flagged in the body |

### 2.3 Hansons (`hansons-marathon`)

Source: Humphrey, L. with Hanson, K. & Hanson, K. (2012) *Hansons Marathon Method*, VeloPress (rev. 2016). Secondary:
six running days/week; three SOS workouts (speed/strength, tempo at goal MP, long run); longest run 16 mi; easy pace
1–2 min/mile slower than MP; beginner plan peaks ≈ 57 mi, advanced ≈ 63 mi.

| Fact | Mapping |
|---|---|
| Cumulative fatigue instead of very long runs; long run ≤ 16 mi and ≤ ~25–30 % of the week / ~2.5–3 h [B] | `long_run` 0.30, 26 km, 180 min |
| 18 wk: easy intro (~5 wk, beginner), speed (~5 wk, 5–10 k pace, ~3 mi of fast running per session), strength (~6–7 wk, MP − 10 s/mi, ~6 mi of reps), tempo at MP all along (5 → 10 mi) [B] | `split` 31/31/38; `intervals_vo2` 4.8 km; `threshold` 9.6 km with note (offset −6 s/km); `marathon_pace` 8 → 16 km |
| Taper ≈ last 10 days, last SOS ~10 days out [B] | `taper.weeks.marathon` 2, [0.85, 0.45] [D] |
| No planned down weeks [B] | `recovery_week` every 8 @ 0.90 = weakest allowed value [S] → gap G-9 |
| Don't make up missed SOS/miles [B] | `missed_km: drop`, `missed_key: move` ≤ 2 days, trigger `workout_swapping` |
| Fatigue is part of the method | `tsb_fatigue` −30 [D], within safety band |

### 2.4 80/20 polarised (`polarized-80-20-half`)

Sources [P]: Seiler & Kjerland 2006 (elite junior XC skiers: ~75/8/17 % of sessions in zones 1/2/3 by HR); Seiler 2010
(best-practice review: ~80 % low intensity across elite endurance sports); Esteve-Lanao et al. 2007 (sub-elite runners,
5 months: 80/12/8 group improved more than 67/25/8 group); Stöggl & Sperlich 2014 (48 trained athletes, 9 weeks:
polarised > threshold, HIIT, high-volume for VO2peak, time to exhaustion); Muñoz et al. 2014 (30 recreational runners,
10 weeks: 5.0 % vs 3.6 % 10 k improvement, **main comparison not significant**; adherence sub-analysis favoured
polarised). Book [B]: Fitzgerald 2014 *80/20 Running* (zones, 80/20 by time, plans 5 k–M in several levels).

| Fact | Mapping |
|---|---|
| ~80 % below VT1, rest mostly above VT2, little between [P] | build 82/6/12 by km (≈ 85/15 by time) |
| Distribution becomes more pyramidal/race-specific near competition [P: Seiler 2010; Haugen 2022] | peak 80/12/8 (HM pace counts as "moderate") |
| 80/20 counted by time/sessions, not km [P/B] | km shares adjusted [D] → gap G-3 |
| Regular recovery weeks in Fitzgerald's plans [B] | every 3 @ 0.80 [D] (cadence not verified line by line) |
| Hard days must be fresh | `tsb_fatigue` −20, `acwr_caution` 1.3, trigger `recovery_week_insertion` [D] |
| Taper | 2 wk 75/50 [D] per Bosquet 2007 |

### 2.5 Norwegian threshold model (`norwegian-threshold-half`)

Sources [P]: Casado, Foster, Bakken & Tjelta 2023 (IJERPH 20:3782) — model description: 3–4 lactate-guided threshold
interval sessions + 1 VO2max/hill session per week, 150–180 km/week for elite 1500–5000 m runners; Bakken's sample week:
Tue/Thu doubles (AM 5 × 6 min / 5 × 2 km @ ~2.5 mmol/L; PM 10 × 1000 m / 25 × 400 m @ ~3.5 mmol/L, 30–60 s rest), Sat
20 × 200 m hills, Sun long run ~21 km (longest reported); lactate targets 2–4.5 mmol/L measured every 1–3 reps; **no
controlled studies** of the model. Tjelta 2019 (Ingebrigtsen brothers' training diaries); Tjelta 2016 (international
distance runners); Haugen et al. 2022 (world-class runners: ≥ 80 % low intensity, taper starts 7–10 days out); Casado
et al. 2021 (easy volume + tempo and short intervals predict world-class performance).

| Fact | Mapping |
|---|---|
| 3–4 threshold interval sessions/week, short rests, controlled (2–4 mmol/L) [P] | `key_sessions` 2/3/3/2; three threshold variants (long/medium/short reps) |
| Doubles on threshold days (elite) [P] | single-session adaptation (Tue/Thu/Sat) [D] — the amateur "sub-threshold" variant is **not** peer-reviewed; stated in body → gap G-2 |
| Threshold paced by lactate, not by pace [P] | `paces.source: threshold`, offset +3 s/km vs HM pace as midpoint (range ≈ −3…+10) [D] → gap G-2 |
| Very easy low-intensity running, ≥ 80 % [P] | easy +80, recovery +100; build 77/21/2 by km |
| Little VO2max (one hill/fast session, elites) [P] | hard 2–3 %, optional hills, VO2 only in peak |
| Longest run ~21 km [P] | `long_run` 24 km / 110 min / 25 % [D] (HM needs a bit more) |
| Taper 7–10 days [P: Haugen 2022] | 2 wk [0.90, 0.60] (first taper week barely reduced) |
| Slow, steady build of threshold volume | `ramp_max` 0.08 [D] |

### 2.6 Lydiard (`lydiard-marathon`)

Sources [B]: Lydiard & Gilmour 1978 *Running the Lydiard Way*; Lydiard & Gilmour 2000 *Running with Lydiard* (rev. ed.,
Meyer & Meyer); Livingstone 2009 *Healthy Intelligent Training*. [P] Tjelta, Enoksen & Tønnessen 2014 (Grete Waitz case
study: 119–132 km/week in best seasons, mostly continuous running at relatively high aerobic intensity) as an example of
volume-based aerobic training; Bosquet 2007 for the taper.

| Fact | Mapping |
|---|---|
| Sequence: marathon conditioning (≥ 10–12 wk) → hills (~4 wk, sources say 4–6) → anaerobic (~4 wk max) → coordination/sharpening (~2–4 wk) → freshening [B; secondary agree on sequence, differ on lengths] | `split` 50/33/17 (24-wk block: 12/8/4) |
| Highest volume at the end of conditioning; long run 2–3 h (Waiatarua ~22 mi); a second longer run midweek [B] | base [0.55, 1.0], build [0.85, 0.90], peak [0.80, 0.85]; `long_run` 35 km / 180 min / 30 %; `medium_long` |
| Aerobic runs at ¼, ½, ¾ effort, never oxygen debt [B] | base moderate 12 % (¾-effort runs as `progression`) |
| Daily running [B] | `runs` 7 |
| "Train, don't strain"; reduce intensity, not aerobic volume, when tired [B] | `missed_km: redistribute`, `fatigue.share` 0.6, `volume_below → phase_restructuring` |
| No fixed recovery weeks (hard/easy days) [B] | every 6 @ 0.85 [D/S] |
| Hill phase: bounding, springing, steep running, flat sprints [B] | `hills` in minutes 30–60 |

### 2.7 Considered but not included

- **Canova (specific endurance, % of race pace):** strong practice base but mostly coach articles/presentations, few
  primary peer-reviewed sources; the core idea (progressions expressed in % of race pace, specific long runs at 90–105 %
  of race pace) needs gap G-5 first.
- **MAF / Maffetone (180 − age):** popular, but the HR formula is not supported by peer-reviewed validation, and it
  conflicts with Runmate's one HR model (`hr.ts`, HFmax 200). Could be a "base only" template later.
- **Hansons Half-Marathon Method** (Humphrey 2014, VeloPress — verified to exist): easy to add as `hansons-half`
  following the same logic; left out to keep the set at 8 and because its plan tables could not be checked.

### 2.8 Cross-cutting sources (load progression, taper, ACWR)

- Mujika & Padilla 2003, Bosquet et al. 2007 — taper: ~2 weeks, volume −41–60 %, keep intensity and frequency. Used for
  every taper where the method gives no numbers.
- Gabbett 2016 — ACWR 0.8–1.3 "sweet spot", > 1.5 high risk. Conservative templates (80/20, Norwegian) use 1.3, Daniels
  and Lydiard 1.4, volume-heavy ones (Pfitzinger, Hansons) the safety maximum 1.5.
- Buist et al. 2008 (RCT, 532 novices: graded 10 %-rule programme did not reduce injuries vs. standard programme) and
  Nielsen et al. 2014 (874 novices: > 30 % increase over two weeks associated with more distance-related injuries,
  HR 1.59, not significant overall) — basis for keeping `ramp_max` at 8–12 % instead of a fixed 10 % rule; none of the
  methods' canonical ramps exceeded the 15 % safety limit, so nothing had to be clamped for the ramp.

All sources were checked for existence (author, year, title) via PubMed/PMC, publisher or library records. Journal issue
numbers that could not be confirmed were left out of the body texts.

## 3. Safety-limit interactions

No template needed a value above a safety limit. Where the schema forced a value the method does not have:

- `recovery_week` is mandatory (every 2–8, ≤ 0.9): Hansons (none planned) → every 8 @ 0.90; Lydiard, Daniels (no fixed
  down weeks) → every 6 @ 0.85 and every 4 @ 0.85.
- Long-run caps all lie inside 40 % / 42 km / 240 min.

## 4. Schema gap report

Ordered by impact. Each gap names the method(s) that need it and a concrete proposal. No schema or code was changed.

**G-1 Paces and intensity bands are relative to the goal race pace → a template can't serve two distances.**
(All methods.) Offsets and the moderate/hard boundary depend on which race is the goal; Daniels, Pfitzinger, 80/20 and
Norwegian are all multi-distance methods.
*Proposal:* anchor paces to a distance-independent reference: `paces.anchor: threshold | vdot | marathon_pace` with
offsets relative to that anchor, and define intensity bands relative to threshold (e.g. moderate = threshold + 25 s …
threshold − 5 s). Alternative with less change: `paces.offsets_by_distance: { half: {…}, marathon: {…} }` and
`intensity_by_distance`. Then `daniels-*` and `pfitzinger-*` could merge into one file each.

**G-2 Lactate/HR-guided threshold and doubles.** (Norwegian; Pfitzinger 85+ tiers; Lydiard; 80/20 level 3.)
No way to say "pace this by lactate 2–3.5 mmol/L or by HR cap" or "two sessions on one day".
*Proposal:* workout field `guide: pace | hr | lactate | rpe` with `target` (e.g. `{ lactate: [2.0, 3.5] }`,
`{ hr_zone: 3 }` resolved through `hr.ts`), and `week.doubles: { days: n, phases: [...] }` plus `session: am | pm` on
workouts.

**G-3 Intensity measured by km only.** (80/20, Seiler.) The literature counts time or sessions.
*Proposal:* `intensity.basis: km | time | sessions` (default km); the describer converts using pace offsets.

**G-4 Per-session caps relative to weekly volume.** (Daniels: M ≤ 20 %/29 km, T ≤ 10 %, I ≤ 8 %/10 km, R ≤ 5 %/8 km;
Hansons: SOS amounts fixed.)
*Proposal:* optional workout fields `max_share` (of weekly km) and `max_km`, checked by the generator and the invariants.

**G-5 Progressions in % of race pace / workout ladders.** (Canova; Hansons speed/strength ladders 12×400 → 3×1600;
Pfitzinger LT 4 → 7 mi.) `from → to` is a single number; no rep structure, no pace progression.
*Proposal:* `structure: [{ reps, distance_m | minutes, pace, rest_s }]` per step and an optional `pace_from`/`pace_to`
(e.g. `{ pct_race_pace: [95, 103] }`) so a session can progress in pace as well as volume.

**G-6 Step-wise volume progression.** (Daniels: hold 3–4 weeks, then step; Lydiard: steady high volume.)
Volume is linear within a phase.
*Proposal:* `volume.progression: linear | step` with `step_weeks` (hold length).

**G-7 Phase priority when time is short.** (Daniels: keep I and IV; Lydiard: keep base.) Phases scale proportionally.
*Proposal:* `phases.min_weeks: { base, build, peak }` and `phases.shorten_order: [build, peak, base]`.

**G-8 Volume tiers.** (Pfitzinger ≤ 88 / 88–113 / 113–137 / 137+ km; Daniels 2Q tiers; Fitzgerald levels; Hansons
beginner/advanced.) One template = one tier.
*Proposal:* `tiers: [{ id, peak_km: [min, max], runs, long_run, key_sessions }]` chosen from the athlete's current km.

**G-9 "No recovery weeks" not expressible.** (Hansons, Lydiard.) `recovery_week` is mandatory.
*Proposal:* allow `recovery_week: null` (or `every: 0`); safety stays guaranteed by `ramp_max`, ACWR and TSB.

**G-10 Workout kinds missing.** No `repetition` (Daniels R, faster than I — used `strides` with a note), no `fartlek`,
no `time_trial` separate from `test`, no `tempo` pace name (kind `tempo` exists but `PACE_NAMES` has no `tempo`, so it
must map to `threshold`).
*Proposal:* add kinds `repetition`, `fartlek`; add pace names `repetition`, `tempo`.

**G-11 Week layout per phase.** (Lydiard: hill days vs. track days; Hansons: Tue/Thu/Sun SOS fixed; Pfitzinger:
consecutive key days but recovery after.) Only `runs` and `key_gap_days` exist.
*Proposal:* optional `week.layout: { <phase>: [mon … sun as kind or 'rest'] }` used as the generator's first choice.

**G-12 Long run in time vs. km and per phase.** (Lydiard 2–3 h; Daniels 150 min; Hansons ≤ 3 h.) A global cap exists,
but the progression is in km and per phase not settable.
*Proposal:* `long_run.by_phase: { base: { max_km, max_minutes } … }` and `unit: minutes` honoured for `long_easy`.

**G-13 Taper shape per distance with one volume list.** `taper.volume` is one list but `taper.weeks` is per distance;
a multi-distance template can't give the HM taper its own percentages.
*Proposal:* `taper.volume` keyed by distance (fits G-1's `*_by_distance` approach).

## 5. Open questions / uncertainties

- Daniels taper percentages, Pfitzinger half-marathon phase lengths/taper/long-run cap, 80/20 recovery-week cadence and
  Hansons' exact taper volumes are reasoned defaults within the books' principles, not values copied from plan tables
  (marked [D]).
- The Norwegian single-session variant is an adaptation; the peer-reviewed literature describes elite doubles.
- Offsets are calibrated for the reference runner's level (3:05 M ≈ VDOT 52, 1:25 HM ≈ VDOT 54–55); at very different levels the
  offsets drift (another argument for G-1's threshold anchor).

## Note for the loader

`listMethodologies()` skips only `README.md` and does not recurse, hence this file's location. If the research notes
should sit next to the templates, the loader would need to skip a second name (e.g. `RESEARCH.md`) — a one-line change in
`lib/plan/methodology/load.ts`, left out here because this PR does not touch `lib/`.
