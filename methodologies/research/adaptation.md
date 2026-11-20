# Research: adaptation — missed sessions, fatigue triggers, volume review, goal, illness, interruptions, re-planning

Status: research note for plan 07-07 (adaptation from the template: engine + Plan anpassen) and 07-08 (Krank/Pause).
Maps every decision to the 6 triggers and 8 strategies in `lib/plan/methodology/schema.ts` and to the rules that exist
today in `lib/plan/engine.ts` and `lib/plan/workshop.ts`. Not a methodology template. Written 2026-10-24.

**Questions**

1. Missed km and missed key sessions: redistribute or drop, with which caps and spacing?
2. Fatigue triggers: which TSB / ACWR thresholds, and what is the evidence for ACWR (including the criticism)?
3. Volume review (below/above plan), goal adjustment from tests and races.
4. Illness and return to running, holidays and other interruptions.
5. When is the whole block re-planned instead of patched?

**Short answer**

- **Missed km: never make them up in full.** Spread the week's gap over its remaining easy days with the existing caps
  (template `cap_pct`/`cap_km`, SAFETY +50 %/+8 km) and only within the same week; past the week, the km are gone. Books
  agree (Daniels, Hansons: "don't make up"; Lydiard: reduce intensity, keep volume). Evidence: the spike studies
  (Frandsen 2025, Damsted 2019) say sudden extra load in a session is the risk, so adding km to a day is the thing to cap.
- **Missed key session: move, don't stack.** Within `max_shift_days` (template), keeping `key_gap_days` to other hard
  days, never into a recovery week, taper or the day before a test (existing `missed-key` rule). If no slot exists it is
  dropped and the progression index does not advance.
- **Fatigue: TSB is the working signal, ACWR a weak second opinion.** TSB (Banister impulse-response, Morton 1990) with
  `tsb_fatigue` −25 (band −40…−10) as the red zone is convention from the Coggan/TrainingPeaks school, not a validated
  threshold. ACWR's "sweet spot" 0.8–1.3 rests on team-sport cohorts (Gabbett 2016, Hulin 2016) and has been shown to
  be a statistical artefact of the ratio (Impellizzeri 2020, 2021; Wang et al. preprint), with a runners' cohort showing
  a *negative* dose-response (Frandsen 2025). Keep `acwr_caution` as a caution flag and SAFETY 1.5 as the "no extra km"
  bound; do not let ACWR alone soften sessions. The single-session spike rule (long-run.md) is the better-supported
  injury guard.
- **Volume review:** last 3 weeks ≤ 85 % of plan → scale the period's easy/long km by (ratio + 0.10), key sessions
  untouched (existing Werkstatt rule); ≥ 115 % and fresh (TSB ≥ −10) → +≤ 10 % on easy runs only. Both are convention.
- **Goal adjustment** comes from tests/races only (paces.md 3.3), never from volume alone — except that a volume ratio
  < 70 % over 4 weeks triggers a Plan-B suggestion.
- **Illness:** fever or below-neck symptoms → no running; return after ≥ 1 symptom-free day with easy runs, week 1
  ≤ 70 %, week 2 ≤ 90 % of the last load week, no key session until 2 symptom-free days (COVID: ≥ 10 days rest + 7
  symptom-free, Elliott 2020). ≥ 4 missed days = the week becomes a recovery week; ≥ 14 days = complete re-plan with a
  lower peak (peak-and-recovery.md). Evidence is expert guidance (IOC consensus, Schwellnus 2016), not trials.
- **Holidays/interruptions:** planned `holiday` weeks keep 50–70 % volume with one quality touch; two sessions a week
  at maintained intensity preserve VO2max for weeks (Hickson & Rosenkoetter 1981), so a 1–2 week holiday costs little
  if intensity is kept.
- **Re-plan the block** when the race date or goal changes, after ≥ 14 days out, when the 4-week volume ratio is < 70 %,
  or when the athlete asks. Otherwise patch.

---

## 1. Missed km and missed key sessions

### 1.1 Evidence and practice

| Source | Finding | Rule |
|---|---|---|
| Frandsen et al. 2025, *Br J Sports Med* 59(17):1203–1210 | Single-session spikes > 10 % over the 30-day longest raise injury rates; week ratios do not | Cap what is added to any one day; the long run is the critical one |
| Damsted et al. 2019, *J Orthop Sports Phys Ther* 49(4):230–238 | 20–60 % weekly increase early in a HM build → more injuries | Do not stack missed km into a big catch-up week |
| Daniels 2014 [B] | Missed Q day: don't double up, continue the schedule | `missed_km: drop` for Daniels |
| Humphrey et al. 2012 [B] | Don't make up missed SOS or miles | `drop`, `missed_key: move ≤ 2 days` |
| Lydiard [B] | Reduce intensity, keep aerobic volume when tired | `redistribute`, fatigue share 0.6 |
| Pfitzinger [B] | Priority order when short of time: long run > LT > MLR; skip, don't cram | move ≤ 4 days |
| Runmate engine (exists) | `rebalance`: net missing km of the current week to remaining easy days, +≤ 30 %/+5 km per day (template), SAFETY +50 %/+8 km, ≥ 2 km gap only, not when tired, not in taper/recovery weeks, not the day before a test | keep |
| Runmate engine (exists) | `missed-key`: move within 7 days, no hard day adjacent, no key within ±2 days, not into recovery/holiday weeks, not into the last 9 days before the race; 80 % of km counts as done | keep; `max_shift_days` from template |

### 1.2 Proposed rules (template-driven; existing engine behaviour kept)

```text
Template (exists): adaptation.missed_km { strategy, cap_pct, cap_km }, adaptation.missed_key { strategy, max_shift_days },
                   adaptation.triggers.missed_km → volume_adjustment | drop, adaptation.triggers.missed_key →
                   workout_reordering (move) | workout_swapping (replace by another kind) | drop
Code constants: DONE_SHARE 0.8, MIN_REBALANCE_KM 2, KEY_GAP_DAYS 2 (overridden by week.key_gap_days), TAPER_DAYS 9

missed_km (per week, trigger fires when planned − run over past synced days ≥ MIN_REBALANCE_KM)
  strategy redistribute → rebalance (exists) with the template caps; only easy days; never the day before a key, test
                           or event; never when tired; never in taper/recovery/holiday weeks
  strategy drop         → info entry only ("{km} km entfallen")
  weekly bound: added km ≤ cap_pct × planned km of the target day and ≤ cap_km; the week never exceeds its planned km
                + 0 (missing km are moved, not added)

missed_key (trigger fires when a key session's matched run < DONE_SHARE)
  workout_reordering → move to the first free day ≤ max_shift_days with key_gap_days to other hard days, not adjacent
                       to a hard day, not into recovery/taper, not the day before a test; the replaced easy run's km
                       are dropped (the week keeps its planned km)
  workout_swapping   → keep the day's slot but replace the kind: VO2 ↔ threshold within the same phase menu when the
                       original is not possible (e.g. no track, heavy legs); race-pace sessions are never swapped away
  drop               → info entry; the progression index of that kind does not advance (next session repeats the
                       planned volume)
  long run missed    → next long run ≤ 1.10 × actual 30-day longest (long-run.md spike rule); a missed long run is
                       never moved by more than 2 days (it needs the rest day before it)
```

### 1.3 Which past days count: data coverage

Both triggers only look at days the stored data covers ("synced days" above): a day that is not covered may still get
its run with the next sync or upload, so it is not missed yet. Covered is every day up to the **later** of two days:
(a) the day before the latest successful sync of a pull source (a source whose last sync failed covers nothing), and
(b) the date of the newest stored run, whatever its source. (b) is what makes the rules work for runners whose runs
arrive by file import or the Apple Health Shortcut, which leave no sync record: a run on day D shows that the runner's
data reached Runmate up to D, so earlier days without a run were really missed. An import of old history ends at its
last run and therefore claims nothing about the weeks after it; a runner who stops uploading is not told about missed
sessions until the next run arrives. With neither a sync nor a run nothing counts as missed. This is a data rule
(project decision, 08-02), not a training rule: no source. Code: `loadSyncedThrough` in `lib/plan/engine-store.ts`.

---

## 2. Fatigue triggers

### 2.1 TSB (fitness–fatigue model)

- Banister's impulse-response model (Morton, Fitz-Clarke, Banister 1990, *J Appl Physiol* 69(3):1171–1177): a training
  impulse produces a fitness and a fatigue response, each decaying exponentially; performance ≈ fitness − fatigue. The
  model's parameters can be fitted per athlete and predicted performance correlated with actual performance in
  runners. Runmate's CTL/ATL/TSB (`lib/analytics/load.ts`: 42- and 7-day constants, TRIMP from HR) is the Coggan-style
  simplification of this model with fixed, unfitted constants. **The −25 red line, −10 "fresh" and the band −40…−10
  are coaching convention (TrainingPeaks/Coggan), not validated thresholds.** No study links a TSB value to injury or
  illness in runners.
- TRIMP (Banister) is HR-based, so easy volume at low HR counts little and intensity counts a lot — reasonable for
  fatigue, blind to mechanical load (which is why ACWR stays km-based, Phase 8 decision).

### 2.2 ACWR — evidence and criticism

| Source | Finding |
|---|---|
| Gabbett 2016, *Br J Sports Med* 50(5):273–280 | Narrative review, team sports: ACWR 0.8–1.3 "sweet spot", > 1.5 high risk; high chronic load protective |
| Hulin et al. 2016, *Br J Sports Med* 50(4):231–236 | Rugby league: very high ACWR (> 2.1 in that study) associated with injury |
| Maupin et al. 2020, *Open Access J Sports Med* 11:51–75 | Systematic review, 27 studies: high variability in variables and cut-offs; trend toward 0.8–1.3 lowest risk; standardisation needed |
| Griffin et al. 2020, *Sports Med* 50(3):561–580 | Systematic review: EWMA more sensitive than rolling averages; optimal windows sport-specific |
| Impellizzeri et al. 2020, *Int J Sports Physiol Perform* 15(6):907–913 | Conceptual pitfalls: ratio data, causal assumptions unrecognised |
| Impellizzeri et al. 2021, *Sports Med* 51(3):581–592 | Replacing chronic load with fixed or random values reproduced the published ACWR–injury associations: the ratio rescales the acute load and inflates its effect; "time to dismiss ACWR and its underlying theory" |
| Wang, Vargas, Stokes, Steele, Shrier (preprint, arXiv 1907.05326; published version not located here) | Limitations of ACWR: mathematical coupling, sparse data, arbitrary windows |
| Dijkhuis et al. 2020, *Int J Sports Med* 41(11) | 23 competitive runners, 24 months: a fortnightly *increase* of ACWR (0.10–0.78) associated with injury | In runners, the change in ACWR, not its level, carried signal |
| Nakaoka et al. 2021, *Sports Med* 51(11) | Dutch runners, three cohorts: results depend heavily on the calculation method (coupled/uncoupled/EWMA); EWMA sparse and non-significant |
| Toresdahl et al. 2023, *Br J Sports Med* 57(3):146–152 | 735 NYC marathoners: each day at ACWR ≥ 1.5 raised injury odds (OR 1.06/day) | Sustained high ratios matter, weakly |
| Frandsen et al. 2025, *Br J Sports Med* 59(17):1203–1210 | 5,205 runners: ACWR showed a **negative** dose-response (higher ratios, fewer injuries); the single-session spike predicted injury | The ratio does not do what it was meant to do in runners |

**Reading.** ACWR is at best a weak caution signal in runners and at worst an artefact. Runmate should (1) keep showing
it, (2) keep `SAFETY.acwrMax = 1.5` as the bound above which no km are added (that follows Toresdahl), (3) **not** let
ACWR alone trigger `intensity_reduction` — require TSB in the red zone or a persisting ACWR > caution for ≥ 3 days,
(4) add the Frandsen single-session rule as the primary mechanical guard (long-run.md).

### 2.3 Proposed rules

```text
Template (exists): adaptation.thresholds { tsb_fatigue, acwr_caution }, adaptation.fatigue { share, days },
                   triggers.fatigue_tsb → intensity_reduction | recovery_week_insertion,
                   triggers.acwr_high  → intensity_reduction | recovery_week_insertion
SAFETY (exists): tsbFatigue band [−40, −10], acwrMax 1.5, fatigueShareMin 0.5
Template (new, G-24): adaptation.thresholds.tsb_caution (default tsb_fatigue + 10), adaptation.fatigue.persist_days (5)

fatigue_tsb  : TSB < tsb_fatigue                                       → red
acwr_high    : ACWR > acwr_caution for ≥ 3 consecutive days            → red (ACWR alone needs persistence)
caution      : tsb_caution > TSB ≥ tsb_fatigue, or ACWR > acwr_caution for 1–2 days → note only ("vorsichtig")

intensity_reduction (exists as fatigue guard): next hard session within `days` → easy at `share` of its km; anchors
   (race, test) stay with a warning; one softened session at a time; no rebalance while red
recovery_week_insertion: red on ≥ persist_days of the last 7 days AND not in taper AND ≥ preTaperLoadWeeksMin weeks
   before the taper → the coming week becomes a recovery week (volume × recovery_week.volume, one key session),
   the recovery-week count restarts (load-cycles.md); the following weeks keep their planned km (no catch-up)
readiness (modifiers.md): low HRV / short sleep flags only shift a key session by one day; they never soften it alone
```

---

## 3. Volume review and goal adjustment

```text
Template (exists): adaptation.volume_review { weeks, below, above }, triggers.volume_below → volume_adjustment |
                   goal_adjustment | phase_restructuring, triggers.volume_above → volume_adjustment
Constants (exist): RECENT_LOW 0.85, RECENT_HIGH 1.15, FRESH_TSB −10, MIN_CHANGE_KM 2
Template (new, G-23): adaptation.strategies.volume_adjustment { step: 0.10, max_step: 0.30 }
                       adaptation.strategies.goal_adjustment { below_ratio: 0.70, weeks: 4 }

volume_below (ratio of run/planned km over `weeks` complete weeks ≤ below)
   volume_adjustment     → easy and long km of the period × clamp(ratio + 0.10, 0.70, 0.95); key sessions unchanged
                           (exists); the peak K is lowered accordingly for the rest of the block (peak-and-recovery.md:
                           the peak only goes down)
   phase_restructuring   → (Lydiard) extend base by one week, shorten build; same total weeks; re-run buildSkeleton
                           from today with the new split; past weeks untouched
   goal_adjustment       → (Daniels) if ratio < below_ratio over `weeks` → suggest Plan B (fallback goal), paces.md 3.3
volume_above (ratio ≥ above AND TSB ≥ FRESH_TSB AND not taper/recovery)
   volume_adjustment     → easy runs × min(1 + step, ratio), never more than SAFETY.rampMax vs. the previous week,
                           never beyond the peak K × 1.05 (a reviewed plan does not grow a new peak)
goal_adjustment from tests/races → paces.md 3.3 (asymmetric, ≤ 1 VDOT per step, frozen in the last 4 weeks)
complete_replan → section 5
```

---

## 4. Illness, return to running, holidays

### 4.1 Evidence

| Source | Finding | Rule |
|---|---|---|
| Schwellnus et al. 2016, *Br J Sports Med* 50(17):1043–1052 (IOC consensus, illness) | Rapid load changes and poor load management raise illness risk; monitor load, well-being and illness; graded return | principle |
| Elliott et al. 2020, *Br J Sports Med* 54(19):1174–1175 | COVID-19: return after ≥ 10 days rest and 7 days symptom-free, staged with caps | the strictest template |
| "Neck check" (attributed to Eichner 1993, *Physician Sportsmed*) | Above-the-neck symptoms: light exercise ok; fever, chest, body aches: rest | **Clinical heuristic, no trial; its validity has been challenged**. Used only as "fever = no running" |
| Aubry et al. 2014 | Overreached athletes had 70 % infection rate vs 10–20 % | illness is often a load signal: lower the peak after illness |
| Hickson & Rosenkoetter 1981, *Med Sci Sports Exerc* 13(1):13–16; Hickson et al. 1985, *J Appl Physiol* 58(2):492–499 | After 10 weeks of training, VO2max was maintained for 15 weeks with 2 or 4 sessions/week or ⅓ of the duration, as long as intensity was kept; cutting intensity by ⅓–⅔ lost most of the gains | holidays: keep intensity, cut volume |
| Mujika & Padilla 2000, *Sports Med* 30(2):79–87 | Short-term detraining (< 4 weeks): rapid VO2max and blood-volume decline in highly trained athletes | an interruption > 2 weeks needs a lower restart |
| Pfitzinger [B] | 5-week post-marathon return schedule | between-blocks.md |
| Daniels [B] | Return-after-break table (percentages not verified) | not used |

### 4.2 Proposed rules (trigger `illness` / `interruption` / `holiday` — not in the schema today, gap G-22)

```text
Inputs: Garmin sync (days without runs), the user's "Krank" / "Pause" / "Urlaub" marking (07-08), optional symptom flag

illness (user marks Krank, or ≥ 3 days without runs + user confirms)
   day 0 … last symptom day        : all sessions → rest (engine, no diff needed; shown as "krank")
   fever or below-neck symptoms    : no running (user attestation)
   return day R = first day ≥ 1 symptom-free day (COVID flag: ≥ 10 days rest and 7 symptom-free)
   week of R and the next 6 days   : ≤ 0.70 × last load week km, easy only, runs ≤ 45 min, HR ≤ Z2 cap
   next 7 days                     : ≤ 0.90 × last load week, first key session ≥ 2 symptom-free days after R,
                                     threshold before race pace, no long run > 0.8 × previous
   then                            : planned km, but the peak K is recomputed: K' = min(K, climb(B_now, weeks left))
   the illness week is a recovery week for the cadence count (load-cycles.md)
   missed km/key during illness    : dropped, never redistributed; progression indices do not advance
   duration ≥ 14 days              : complete_replan (section 5)

holiday (planned, user marks dates; `holiday` flag exists on weeks)
   volume 0.50–0.70 × planned (user choice), runs ≥ 2–3, one short quality touch (threshold 15–20 min or strides) per
   week, no key moves into or out of the week, no rebalance; counts as a recovery week for the cadence if ≤ 0.75
   > 14 days holiday: on return week 1 ≤ 0.80 × last load week, then planned

interruption (unplanned, ≥ 4 days without runs, not illness — travel, work)
   as holiday without the quality touch; the week counts as recovery; next week ≤ 0.85 × last load week
```

**German text ("Nach der Krankheit")**

```text
Zurück nach {n} Tagen Pause. Diese Woche höchstens {km} km (70 % der letzten Belastungswoche), alles locker, Puls unter
142; die erste Schlüsseleinheit frühestens zwei symptomfreie Tage nach dem Wiedereinstieg. Verpasste Kilometer werden
nicht nachgeholt – die Spitze des Blocks sinkt auf {K'} km, der Renntag bleibt. Mit Fieber wird nicht gelaufen.
Grundlage: Konsens-Empfehlungen (IOC 2016, Rückkehr nach Infekten); die Prozentwerte sind Praxiswerte, keine
Studienergebnisse.
```

### 4.3 Per method (07-18)

The graded return (4.2) is research-based (consensus, not a method), so its caps stay the same for every method; what
differs is **what quality comes back first** — each method's own "lowest" quality. Template field `adaptation.return`
(optional; missing = 4.2 values). **c** = convention, **b** = book.

| Method | First quality after a break | Values |
|---|---|---|
| Pfitzinger [B] | LT (threshold) runs before marathon-pace work | 4.2 (`week2_quality threshold`) |
| Daniels [B] | T before M/I; returning runners start with E + strides, then T | 4.2 |
| Hansons [B] | Tempo is at marathon pace, but after a break the strength (threshold-ish) work comes first; SOS resumes gradually | 4.2 (c) |
| Lydiard [B] | Aerobic running only until the base is back; no quality in the return weeks | `week2_quality easy` (b: aerobic first) |
| Norwegian [B/R] | Sub-threshold is the core session and the gentlest quality | 4.2 |
| Polarized 80/20 [R] | No threshold zone by design; quality = short high-intensity intervals, which do not belong in a return week | `week2_quality easy` (c: strides only in week 2) |

Shares (`week1_share 0.7`, `week2_share 0.9`, `long_share 0.8`) are the same for every method: no method gives
verified percentages (Daniels' return table not verified, 4.1). Safety limits (fixed): week 1 ≤ 0.8, week 2 ≤ 1.0,
long ≤ 0.9; race pace never in the return weeks.

---

## 5. When to re-plan the whole block

```text
complete_replan when any of:
   race date or goal distance changes
   illness/interruption ≥ 14 days
   4-week volume ratio < 0.70 and > 4 weeks to the taper
   the user asks ("Block neu planen")
   ≥ 3 engine changes of kind missed-key in the same 2 weeks (the plan does not fit the life)
Procedure: buildSkeleton from the Monday after today with B = mean of the last 2 run weeks (or the illness rule),
P unchanged, the same template; past weeks and manual edits stay; the diff is shown as one suggestion.
Otherwise: patch (rules 1–4).
```

---

## 6. Mapping: triggers × strategies

| Trigger (schema) | Strategy (schema) | Rule here | Exists today |
|---|---|---|---|
| `missed_km` | `volume_adjustment` (redistribute) · drop | 1.2 | engine `rebalance`, Werkstatt `missed-km` |
| `missed_key` | `workout_reordering` (move) · `workout_swapping` · drop | 1.2 | engine `missed-key`, Werkstatt `key-catchup`; swapping is new |
| `fatigue_tsb` | `intensity_reduction` · `recovery_week_insertion` | 2.3 | engine `fatigue` (3-day window), Werkstatt `fatigue` (7-day); insertion is new |
| `acwr_high` | `intensity_reduction` · `recovery_week_insertion` | 2.3 with persistence | yes (07-23): same code path as TSB (`tired()`), ACWR alone after 3 days in a row; Porto 1 day |
| `volume_below` | `volume_adjustment` · `goal_adjustment` · `phase_restructuring` | 3 | Werkstatt `volume-down`; the other two are new |
| `volume_above` | `volume_adjustment` | 3 | Werkstatt `volume-up` |
| — (new) `illness`, `interruption`, `holiday`, `race_result`, `test_result`, `readiness_low`, `long_run_spike` | `complete_replan`, `goal_adjustment`, `intensity_reduction`, `workout_reordering` | 4, 5, paces.md, long-run.md, modifiers.md | partly (`recalibrate`, `holiday` flag, recovery blocks) |

`complete_replan` and `goal_adjustment` have no trigger of their own in the schema; `goal_adjustment` is reachable only
via `volume_below`. That is **G-22**.

---

## 7. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `adaptation.missed_km.cap_pct / cap_km` | 0.30 / 5 | ≤ 0.50 / ≤ 8 | template (exists) | Spike studies (**moderate** that single-day additions matter), values **convention** |
| `adaptation.missed_key.max_shift_days` | 3–7 per template | 1–14 | template (exists) | Books. **Convention** |
| `DONE_SHARE` 0.8, `MIN_REBALANCE_KM` 2 | fixed | — | code constant | **Convention** |
| `adaptation.thresholds.tsb_fatigue` | −25 | −40…−10 | template (exists) | Coggan convention. **Convention** |
| `adaptation.thresholds.tsb_caution` | tsb_fatigue + 10 | — | template (new, G-24) | **Convention** |
| `adaptation.thresholds.acwr_caution` | 1.3–1.5 | ≤ 1.5 | template (exists) | Gabbett 2016 (**weak**, contested) |
| ACWR persistence 3 days before acting | 3 | fixed | code constant (built 07-23: `ACWR_PERSIST_DAYS`; Porto 1) | Toresdahl 2023 (days above 1.5). **Weak** |
| `adaptation.fatigue.share / days` | 0.7 / 3 | ≥ 0.5 / 1–7 | template (exists) | **Convention** |
| `adaptation.fatigue.persist_days` (insertion) | 5 of 7 | 3–7 | template (new, G-24) | **Convention** |
| `adaptation.volume_review` | 3 weeks, 0.85, 1.15 | — | template (exists) | **Convention** |
| `strategies.volume_adjustment.step` | 0.10 | 0.05–0.15 | template (new, G-23) | runmate-app "±10 %". **Convention** |
| `strategies.goal_adjustment.below_ratio` | 0.70 over 4 weeks | — | template (new, G-23) | **Convention** |
| illness return 70 % → 90 %, key after 2 symptom-free days | fixed | — | engine rule | Graded-return guidance. **Weak** |
| COVID: 10 days rest + 7 symptom-free | fixed | — | engine rule | Elliott 2020. **Expert guidance** |
| fever = no running | fixed | — | engine rule (user attestation) | Clinical heuristic. **Convention** |
| holiday 50–70 %, one quality touch | user choice | — | engine rule | Hickson 1981/1985 (**moderate**) |
| re-plan after ≥ 14 days / ratio < 0.70 | fixed | — | engine rule | Mujika & Padilla 2000 (**moderate** for the physiology), thresholds **convention** |
| SAFETY `acwrMax` 1.5 = no extra km | exists | — | safety | Toresdahl 2023 (**weak**) |
| SAFETY `longRunSpikeMax` 0.10 | new | — | safety | Frandsen 2025 (**moderate**) |

**Can the schema express it?** Caps, shift days, thresholds, review: yes. Missing: triggers for illness, interruption,
holiday, race/test results, readiness, long-run spike (**G-22**); strategy parameters (**G-23**); a caution band and a
persistence rule for fatigue (**G-24**).

## 8. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| Cap added km per day; never stack catch-up | **Moderate** (single-session spike evidence) |
| Move key sessions with spacing, else drop | **Convention** (all books) |
| TSB thresholds | **Convention** (model is established, thresholds are not) |
| ACWR as caution only, never alone | **Moderate** that it is *not* a valid predictor in runners |
| Volume review ±10–15 % | **Convention** |
| Illness: graded return, lower peak, never compress | **Expert guidance**, percentages **convention** |
| Holidays: keep intensity, cut volume | **Moderate** (Hickson studies, small n, 1980s) |
| Re-plan thresholds | **Convention** |

## 9. Suggestions for the plans

1. 07-07: read `adaptation.*` from the template into the engine constants (caps, shift days, thresholds, share, days);
   add ACWR persistence; add `recovery_week_insertion` with `preTaperLoadWeeksMin`; add `workout_swapping` as a
   Werkstatt suggestion.
2. 07-08: Krank/Pause/Urlaub as user-marked periods with the rules in 4.2; illness → recovery-week count restart and
   peak recompute; ≥ 14 days → `complete_replan` suggestion.
3. Schema: G-22, G-23, G-24; keep `acwr_caution` but document it as a caution flag in methodologies/README.md.
4. Tests: property "no engine or Werkstatt change adds > cap_km to a day" and "no change moves a key into a recovery or
   taper week" already exist in spirit (07-00/07-11); add "illness week adds nothing".

## Sources

Peer-reviewed:

- Damsted C, Parner ET, Sørensen H, Malisoux L, Hulme A, Nielsen RO (2019). The association between changes in weekly running distance and running-related injury: preparing for a half marathon. *J Orthop Sports Phys Ther* 49(4):230–238.
- Dijkhuis TB, Otter R, Aiello M, Velthuijsen H, Lemmink KAPM (2020). Increase in the acute:chronic workload ratio relates to injury risk in competitive runners. *Int J Sports Med* 41(11) (pages not verified).
- Elliott N, Martin R, Heron N, et al. (2020). Infographic. Graduated return to play guidance following COVID-19 infection. *Br J Sports Med* 54(19):1174–1175.
- Frandsen JSB, et al. (2025). How much running is too much? *Br J Sports Med* 59(17):1203–1210.
- Gabbett TJ (2016). The training—injury prevention paradox. *Br J Sports Med* 50(5):273–280.
- Griffin A, Kenny IC, Comyns TM, Lyons M (2020). The association between the acute:chronic workload ratio and injury and its application in team sports: a systematic review. *Sports Med* 50(3):561–580.
- Hickson RC, Rosenkoetter MA (1981). Reduced training frequencies and maintenance of increased aerobic power. *Med Sci Sports Exerc* 13(1):13–16.
- Hickson RC, Foster C, Pollock ML, Galassi TM, Rich S (1985). Reduced training intensities and loss of aerobic power, endurance, and cardiac growth. *J Appl Physiol* 58(2):492–499.
- Hulin BT, Gabbett TJ, Lawson DW, Caputi P, Sampson JA (2016). The acute:chronic workload ratio predicts injury: high chronic workload may decrease injury risk in elite rugby league players. *Br J Sports Med* 50(4):231–236.
- Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *Int J Sports Physiol Perform* 15(6):907–913.
- Impellizzeri FM, Woodcock S, Coutts AJ, Fanchini M, McCall A, Vigotsky AD (2021). What role do chronic workloads play in the acute to chronic workload ratio? Time to dismiss ACWR and its underlying theory. *Sports Med* 51(3):581–592.
- Maupin D, Schram B, Canetti E, Orr R (2020). The relationship between acute:chronic workload ratios and injury risk in sports: a systematic review. *Open Access J Sports Med* 11:51–75.
- Morton RH, Fitz-Clarke JR, Banister EW (1990). Modeling human performance in running. *J Appl Physiol* 69(3):1171–1177.
- Mujika I, Padilla S (2000). Detraining: loss of training-induced physiological and performance adaptations. Part I. *Sports Med* 30(2):79–87.
- Nakaoka G, Barboza SD, Verhagen E, van Mechelen W, Hespanhol L (2021). The association between the acute:chronic workload ratio and running-related injuries in Dutch runners: a prospective cohort study. *Sports Med* 51(11) (pages not verified).
- Schwellnus M, et al. (2016). How much is too much? (Part 2) IOC consensus statement on load in sport and risk of illness. *Br J Sports Med* 50(17):1043–1052.
- Toresdahl BG, et al. (2023). Training patterns associated with injury in New York City Marathon runners. *Br J Sports Med* 57(3):146–152.
- Wang C, Vargas JT, Stokes T, Steele R, Shrier I. The acute:chronic workload ratio: challenges and prospects for improvement. arXiv 1907.05326 (preprint; the *Sports Medicine* 2020 version was not located in this session).

Coaching books (secondary): Daniels 2014; Humphrey, Hanson & Hanson 2012; Pfitzinger & Douglas 2019; Lydiard & Gilmour 2000.

Not verified: Eichner's 1993 article itself (only secondary references found; the rule is used only as "fever = rest");
Daniels' return-after-break percentages; the Hickson 1981 sample size and exact group results (secondary summaries);
TSB threshold values have no primary source — they are coaching convention.
