# Research: training paces — goal time, VDOT, threshold test, HR model, recalibration

Status: research note for plan 07-03 (`trainingPaces`, pace per workout) and 07-07 (goal adjustment / recalibration).
Not a methodology template. Written 2026-10-24.

**Questions**

1. Where do the paces come from: the goal time, a VDOT from a race result, or a threshold test — and how do the three
   relate?
2. How do paces map onto Runmate's HR model (`lib/analytics/hr.ts`: HFmax 200, Z2 130–142, Z4 155–170, race cap 170)?
3. When and how are paces recalibrated when a test run or race says slower or faster?

**Short answer**

- **Three sources, one anchor.** `goal_time` gives race pace directly; `vdot` derives all paces from a recent race
  (Daniels & Gilbert 1979 equations); `threshold` anchors on a measured threshold pace (30-min time trial, McGehee 2005:
  velocity within 0.21 m/s and HR within 8 bpm of lab lactate threshold). The generator should compute **all three
  when the data exist**, use the template's `paces.source` as the anchor, and warn when the others disagree by more
  than ~3 % (one VDOT step ≈ 1.5–2 % in pace at the reference runner's level — approximate, from the tables, not a quoted rule).
- **Goal plausibility.** Race predictions from a shorter race: Riegel's exponent 1.06 is well calibrated up to the half
  marathon but underestimates marathon times by ≥ 10 min for half of recreational runners (Vickers & Vertosick 2016,
  2,303 runners). Rule: predict with Riegel, and for the marathon add a correction or use the two-race model; a goal
  more than 3 % faster than the prediction from current fitness gets a warning, not a refusal.
- **HR model.** Pace prescribes, HR checks. Easy runs: HR ≤ Z2 max (142; the existing `hr-cap` rule); threshold ≈ Z4
  (155–170 = 78–85 % HFmax); race-pace blocks: block HR < 170 = on course, ≥ 175 = too hard (the existing
  `recalibrate` rule). The zone boundaries are Runmate's one HR model and are not derived from the templates.
- **Recalibration.** Asymmetric: evidence that the pace is **too fast** acts immediately (one block with HR ≥ 175 or
  > +10 s/km → fallback pace, existing rule); evidence that it is **too slow** (block clearly under HR cap and ≤ −5 s/km)
  only sets a flag, and the goal moves faster only after a race or test confirms it and never inside the last 4 weeks.
  Pace steps are ≤ 1 VDOT (≈ 3–5 s/km) per recalibration.

---

## 1. Pace sources

### 1.1 Evidence

| Source | What it gives | Accuracy / caveat |
|---|---|---|
| Daniels & Gilbert 1979, *Oxygen Power*; Daniels 2014 [B] | VDOT from any race; E/M/T/I/R paces from VDOT. Equations (as reproduced in secondary sources): VO2 = −4.60 + 0.182258·v + 0.000104·v² (v in m/min); %VO2max = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t) (t in min) | Widely used; the tables are the book's. McGehee 2005: VDOT estimated threshold velocity with SEE 0.41 m/s (less precise than the 30-min TT) |
| Riegel 1981, *American Scientist* 69(3):285–290 | T2 = T1 × (D2/D1)^1.06 | Fits records; for recreational runners the marathon is underestimated (below) |
| Vickers & Vertosick 2016, *BMC Sports Sci Med Rehabil* 8:26 | 2,303 recreational runners: Riegel well calibrated up to HM, underestimated marathon by ≥ 10 min for half the runners; a two-race model (MSE 208) beat Riegel (MSE 381) | Use two prior races where available; marathon predictions need a correction |
| McGehee, Tanner, Houmard 2005, *J Strength Cond Res* 19(3):553–558 | 27 competitive runners/triathletes: 30-min TT velocity SEE 0.21 m/s and HR SEE 8 bpm vs. lab LT (4 mmol/L); VDOT SEE 0.41 m/s; Conconi less accurate | A 30-min all-out TT is the best field threshold test; the "last 20 min" HR averaging is Friel's coaching variant, not in the study |
| Casado et al. 2023, *Int J Environ Res Public Health* 20(5):3782 | Norwegian threshold paced by lactate (2–4.5 mmol/L), not by pace | Without lactate: anchor on the 30-min TT pace and the HR band (G-2) |
| Pfitzinger & Douglas 2019 [B] | Paces relative to MP: GA 15–25 % slower, long 10–20 %, LT = 15 k–HM pace, VO2 ≈ 5 k | Goal-time anchoring works when the goal is realistic |
| Humphrey et al. 2012 [B] | Easy 1–2 min/mile slower than MP; strength MP − 10 s/mi; speed 5–10 k pace | same |

### 1.2 Proposed rule

```text
Inputs
  goal        { distance D, time G }                        → RP_goal = G / D
  races[]     recent results (≤ 12 months; weight by recency)
  profile     thresholdPaceS (30-min TT), fiveKS            (athlete profile, exists)
  template    paces.source, paces.offsets (s/km vs RP), G-1 anchor later

Derived
  VDOT_race   = max over races of VDOT(result) with age ≤ 6 months (older: −1 VDOT per further 6 months — convention)
  RP_pred     = Riegel(best recent race → D); for D = marathon from ≤ HM: RP_pred × 1.02 (Vickers correction, approx.)
                or the two-race model when two races exist
  T_pace      = profile.thresholdPaceS ?? VDOT T-pace ?? RP_half + 0–5 s
  anchor      = template.paces.source: goal_time → RP_goal; vdot → RP from VDOT_race; threshold → T_pace with offsets

Paces per name = anchor + offsets[name]   (exists)

Plausibility (warnings only, shown in the draft review)
  RP_goal faster than RP_pred by > 3 %           → "Ziel {G} liegt {x} % über deiner aktuellen Form ({pred})"
  RP_goal faster than RP_pred by > 6 %           → stronger warning + suggest Plan-B goal (fallback pace, exists)
  |T_pace − VDOT T-pace| > 8 s/km                → "Schwellentest und Wettkampf-VDOT passen nicht zusammen"
  no race ≤ 6 months and no TT                   → "Tempi aus Zielzeit – Test in Woche 2–3 einplanen" (test session)
```

---

## 2. Mapping to the HR model

`lib/analytics/hr.ts` is the only source of zones (HFmax 200, HFrest 65; Z1 < 130, Z2 130–142, Z3 142–155, Z4 155–170,
Z5 ≥ 170). Templates must not carry HR values. The mapping is a code table:

| Pace name | Zone check | Rule in the engine |
|---|---|---|
| recovery, easy, long (no block) | avg HR ≤ Z2 max (142) | `hr-cap` rule (exists): 2 of last 3 easy runs above → note on upcoming easy runs |
| marathon_pace | block HR < `ATHLETE.raceHrCap` 170 = on course; ≥ 175 = too hard | `recalibrate` (exists) |
| half_marathon_pace | block HR < 178 on course, ≥ 183 too hard (2.1) | `recalibrate` with `raceHr(21,1)` (07-20) |
| threshold | Z4 (155–170), ≈ 78–85 % HFmax | consistent with typical LT HR ranges (convention; McGehee: TT HR ≈ LT HR ± 8) |
| intervals_vo2 | Z5 reached late in reps; not a pacing target | no check |
| strides | n/a | no check |

Heat and hills raise HR at a pace; the engine's rules already use block HR with a 5-bpm margin (170/175). A template may
later declare `paces.hr_zone[name]` to say which zone a pace *should* fall in (optional, **G-19**), but the zone
boundaries stay in `hr.ts`.

### 2.1 Race HR per distance (07-20, closes G-19)

Race-pace blocks in training are checked against the HR of the race they prepare. The longer the race, the lower the
sustainable fraction of HFmax: marathon effort sits around 80–88 % HFmax, half-marathon effort around 85–92 %, 10 km
around 90–95 % (coaching books: Daniels 2014 and Pfitzinger & Douglas 2019 give marathon pace ≈ 80–90 % HFmax and
lactate-threshold/HM effort ≈ 85–92 %; exact bands differ between sources, **convention**). The reference runner's own data fit:
marathon race average ≈ 84 % HFmax, half-marathon test block ≈ 88 % HFmax.

Rule (code table in `lib/analytics/hr.ts` `raceHr(distanceKm)`, HFmax 200; Porto unchanged):

| Race | Block HR on course (below) | Too hard (from) | Share of HFmax |
|---|---|---|---|
| Marathon (> 30 km) | 170 | 175 | 85 % / 87,5 % (Porto plan rule, unchanged) |
| Half marathon (> 15 km) | 178 | 183 | 89 % / 91,5 % |
| 10 km and shorter | 185 | 190 | 92,5 % / 95 % |

The 5-bpm margin between "on course" and "too hard" is the Porto rule (heat, hills, drift) kept for every distance.
Evidence strength: **convention** anchored on the athlete's own race HR; no trial sets these cut-offs.

### 2.2 HFmax without a measurement (Phase 5 onboarding)

A new runner often does not know their HFmax. The onboarding then asks the age and stores **208 − 0,7 × Alter**
(Tanaka, Monahan & Seals 2001: meta-analysis of 351 studies, ~18,700 subjects, confirmed in a lab study of 514 healthy
adults; the classic 220 − age underestimates HFmax in older adults). Any age formula is a population mean: individual
HFmax scatters by roughly ±10 bpm around it, so the onboarding says so and asks for the real value (e.g. the peak of a
hard race) in Settings. The resting HR has no useful estimate: unknown stays empty and the example default is marked.
Evidence strength: **moderate** for the mean, **weak** for any individual (that is why it is labelled an estimate).

---

## 3. Recalibration

### 3.1 What exists

- `recalibrate` (engine): the latest ≥ 10 km race-pace block decides — HR ≥ 175 or > +10 s/km → all remaining
  race-pace sessions to the fallback pace (Plan B); never faster than the goal; "not attempted" blocks give no verdict.
- `checkPace` (pace-check.ts): ±5 s/km = on target; easy runs "too fast" beyond +15 s.
- Porto rule: two tests (20 km @ MP, HM @ MP) decide Plan A/B.

### 3.2 Evidence for recalibration rules

There is no trial of recalibration policies. The relevant facts: (1) race-based VDOT is the best single predictor of
training paces (Daniels); (2) field threshold tests agree with lab LT within ~0.2 m/s (~5 s/km at 4:00/km; McGehee
2005); (3) marathon predictions from shorter races are optimistic for recreational runners (Vickers 2016). The
asymmetry below (slow evidence acts, fast evidence waits) is a precaution against over-reaching, not a finding.

### 3.3 Proposed rule

```text
Template (new, G-20): paces.recalibration = {
   sources: ['test', 'race', 'block'],       which events may move paces (block = race-pace block in a long run)
   min_block_km: 10,                         exists as MIN_BLOCK_KM
   max_step_vdot: 1,                         per recalibration, ≈ 3–5 s/km at VDOT 50–55
   faster_needs_confirmation: true,          two independent signals before paces get faster
   freeze_weeks_before_race: 4               no faster goal inside the last 4 weeks (taper + 1)
}
Signals (from the matched run of a key session, pace-check.ts):
   SLOW:  block HR ≥ cap + 5 (175) OR pace > target + 10 s/km, block ≥ min_block_km       → act now
   FAST:  block HR < cap − 5 (165) AND pace ≤ target − 5 s/km, block ≥ min_block_km       → flag
   RACE:  a race/test result → new VDOT_race
Actions
   SLOW  → goal_adjustment: race-pace sessions to the fallback pace (exists); threshold/HM paces unchanged
   FAST  → flag only; if a second FAST signal or a RACE confirms within 3 weeks and weeks_to_race > freeze:
           goal faster by ≤ max_step_vdot (≈ 3–5 s/km), all offsets follow; log "Ziel angepasst"
   RACE  → VDOT_race updated; if |ΔVDOT| ≥ 1: paces move by ≤ max_step_vdot in that direction (slower immediately,
           faster only outside the freeze window); the race also counts as a test for Plan A/B
   Easy paces never speed up from signals; they follow the HR cap only (hr-cap rule).
```

---

## 4. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `paces.source` | per template | goal_time / vdot / threshold | template (exists) | Books |
| `paces.offsets` | per template | −60…+150 s/km | template (exists) | Books; G-1 for a distance-independent anchor |
| Riegel exponent | 1.06 | fixed | code constant | Riegel 1981. **Moderate** up to HM (Vickers 2016) |
| marathon correction from ≤ HM | × 1.02 on pace | 1.00–1.04 | code constant | Vickers 2016: Riegel underestimates M by ≥ 10 min for half of runners (≈ 5 % of a 3:05). 2 % is a cautious midpoint — **approximation, not a published factor** |
| goal warning thresholds | 3 % / 6 % | fixed | code constant | **Convention** |
| VDOT age decay | −1 VDOT per 6 months beyond 6 | fixed | code constant | **Convention** (Daniels' tables are for recent races) |
| race-pace HR verdicts | < 170 ok, ≥ 175 slow | fixed | code constant (exists, ATHLETE.raceHrCap) | Porto plan rule; HR model |
| easy HR cap | Z2 max 142 | fixed | hr.ts (exists) | HR model |
| `paces.recalibration.max_step_vdot` | 1 | 0.5–2 | template (new, G-20) | **Convention** |
| `paces.recalibration.freeze_weeks_before_race` | 4 | 2–6 | template (new, G-20) | Taper evidence: nothing new in the taper. **Convention** |
| `paces.hr_zone[name]` | — | zone 1–5 | template (new, G-19, optional) | — |
| 30-min TT as threshold test | — | — | test session kind | McGehee 2005. **Moderate** |

**Can the schema express it?** Source and offsets: yes. Anchor independent of goal distance: **G-1**. HR-zone intent
per pace: **G-19 (new)**. Recalibration policy: **G-20 (new)**. Lactate/HR-guided pacing: **G-2**.

---

## 5. German explanation text ("Woher die Tempi kommen")

```text
Renntempo {RP}/km aus {„deiner Zielzeit {G}“ | „deinem {race} ({time}, VDOT {vdot})“ | „deinem Schwellentest
({T}/km)“}. Daraus: locker {easy}, Schwelle {T}, Intervalle {I}.
{Warnung: „Dein Ziel liegt {x} % über dem, was dein letztes Rennen vorhersagt ({pred}). Für den Marathon unterschätzen
Formeln die Zeit bei den meisten Hobbyläufern – der 20-km-Test entscheidet.“}
Die Tempi geben die Einheit vor, der Puls prüft sie: lockere Läufe unter 142, Renntempo-Blöcke unter 170. Zeigt ein
Block Puls ab 175 oder mehr als 10 s/km zu langsam, wechselt Runmate auf Plan B. Schneller wird das Ziel erst, wenn
zwei Signale oder ein Rennen es bestätigen – und nie in den letzten vier Wochen.
```

## 6. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| VDOT from a recent race as pace source | **Moderate** (established tables; field validation vs. LT only indirect) |
| 30-min TT as threshold anchor | **Moderate** (one validation study, n = 27) |
| Riegel up to HM; marathon correction | **Moderate** (Vickers 2016); the 2 % factor is **approximation** |
| HR zones as checks, pace as prescription | **Convention**, consistent with the HR model |
| Asymmetric recalibration, 1 VDOT steps, freeze 4 weeks | **Convention** |
| Easy HR cap 142 | Runmate's HR model (Porto plan) |

## 7. Suggestions for the plans

1. 07-03: implement 1.2 (compute all three sources, anchor by template, warnings) and the HR mapping table.
2. 07-07: extend `recalibrate` with the FAST flag and RACE handling per 3.3, read from G-20 defaults in code.
3. 07-05: show the three derived race paces side by side in the picker ("Zielzeit · letztes Rennen · Schwellentest").
4. Schema: G-1, G-19, G-20.

## Sources

Peer-reviewed:

- McGehee JC, Tanner CJ, Houmard JA (2005). A comparison of methods for estimating the lactate threshold. *J Strength Cond Res* 19(3):553–558.
- Tanaka H, Monahan KD, Seals DR (2001). Age-predicted maximal heart rate revisited. *J Am Coll Cardiol* 37(1):153–156.
- Riegel PS (1981). Athletic records and human endurance. *American Scientist* 69(3):285–290.
- Vickers AJ, Vertosick EA (2016). An empirical study of race times in recreational endurance runners. *BMC Sports Sci Med Rehabil* 8:26.
- Casado A, Foster C, Bakken M, Tjelta LI (2023). *Int J Environ Res Public Health* 20(5):3782 (lactate-guided threshold).

Books: Daniels J, Gilbert J (1979). *Oxygen Power: Performance Tables for Distance Runners*. Daniels J (2014). *Daniels'
Running Formula*, 3rd ed. Pfitzinger & Douglas 2019. Humphrey, Hanson & Hanson 2012.

Not verified: the Daniels/Gilbert equation coefficients were taken from widely reproduced secondary sources, not from the
1979 book; the "one VDOT per 4–6 weeks" adjustment rule sometimes attributed to Daniels could not be found and is not
used; the 2 % marathon correction is my approximation of Vickers' finding, not a published factor.
