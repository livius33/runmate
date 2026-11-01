# Research: peak volume and recovery weeks for the plan generator

Status: research note for plan 07-02 (`buildSkeleton`). Not a methodology template: the loader only reads files with a
YAML header, so this file is ignored. Written 2026-10-23.

**Questions**

1. How should the generator pick the peak weekly volume and the climb towards it?
2. How often, how deep and where should recovery (down) weeks go?

**Short answer**

- **Peak.** Set it from three caps and take the smallest: what you run now × a growth factor, what you have already
  held in the last 12 months, and what the weeks before the peak phase allow at a net weekly growth rate. It is never
  below current volume and never more than 2 × current volume. This replaces the 07-02 draft rule
  "peak = current ÷ `volume.start`". That rule always gives peak ≈ 2 × current, which is more aggressive than any of the
  book plans reviewed.
- **Recovery weeks.** Every 4th week by default (every 3rd for novices or runners aged 50+), about 25 % lighter than the
  week before, at most one key session. Count from the start. Drop a recovery week if fewer than 2 load weeks would
  follow it before the taper. A tune-up race week or an illness week counts as a recovery week and restarts the count.
  After a recovery week, measure the ramp limit against the last load week, not the recovery week.
- **How strong is the evidence?** The evidence is weak for both rules. There is moderate evidence that sudden spikes
  matter, especially in a single session. There is no direct evidence for any weekly percentage cap, for the 3:1 rhythm
  or for an exact recovery depth. Most of the numbers below are coaching convention. They are kept as editable template
  fields, and only clear outer limits go into `SAFETY`.

---

## 1. Peak week and peak volume

### 1.1 What the research says about load progression and injury

| Study | Design | Finding | What it means for the generator |
|---|---|---|---|
| Buist et al. 2008, *Am J Sports Med* 36(1):33–39 | RCT, 532 novice runners, 8-week standard programme vs. 13-week programme graded by the 10 % rule | Injuries 20.8 % (graded) vs. 20.3 % (standard), no difference | A 10 %-per-week build did not prevent injuries in novices |
| Nielsen et al. 2014, *J Orthop Sports Phys Ther* 44(10):739–747 | Cohort, 874 novices with GPS, 1 year | No overall difference between < 10 %, 10–30 % and > 30 % progression (over 2 weeks). Distance-related injuries: HR 1.59 (95 % CI 0.96–2.66) for > 30 % vs. < 10 % | Weak signal against large jumps (> 30 % over two weeks). No support for 10 % as a threshold |
| Damsted et al. 2018, *Int J Sports Phys Ther* 13(6):931–942 | Systematic review | Only 4 studies qualified. "Very limited evidence" that sudden load changes raise injury risk | The whole area rests on thin evidence |
| Damsted et al. 2019, *J Orthop Sports Phys Ther* 49(4):230–238 | Cohort, 261 half-marathon runners, 14 weeks | After 21 days, more injuries with a 20–60 % weekly increase than with ≤ 20 % (risk difference 22.6 %, CI 0.9–44.3 %). Not significant at 56 or 98 days | Large increases early in a build are the risky part |
| Damsted et al. 2019, *J Sci Med Sport* (ProjectRun21) | Cohort, 784 runners, half-marathon schedule | < 15 km/week of experience and slower pace: more injuries, but CIs crossed zero | Experience matters a little; low certainty |
| Videbæk et al. 2015, *Sports Med* 45(7):1017–1026 | Meta-analysis | 17.8 injuries/1000 h in novices vs. 7.7 in recreational runners | Novices need more conservative settings |
| Gabbett 2016, *Br J Sports Med* 50(5):273–280 | Narrative review, mainly team sports | High chronic load protects. Rapid rises (high acute:chronic ratio) are the problem | Origin of the ACWR "sweet spot" idea |
| Impellizzeri et al. 2020, *IJSPP* 15(6):907–913; Impellizzeri et al. 2021, *Sports Med* 51:581–592 | Methodological critique | ACWR has ratio and coupling artefacts. No causal evidence that changing it changes injury rates | Use ACWR as a warning sign, not as a planning target |
| Toresdahl et al. 2023, *Br J Sports Med* 57(3):146–152 | Cohort, 735 NYC Marathon runners (Strava) | 40 % injured. Days at ACWR ≥ 1.5: OR 1.06 per day (1.02–1.10). The 10 % rule was not protective | Marathon-specific: sustained spikes matter, not the weekly 10 % |
| Frandsen et al. 2025, *Br J Sports Med* 59(17):1203–1210 | Cohort, 5,205 runners (Garmin), 588,071 sessions | A single run > 10 % longer than the longest run of the last 30 days raised injury rate (HRR 1.64 for > 10–30 %, 1.52 for > 30–100 %, 2.28 for > 100 %). No relation for the week-to-week ratio. ACWR showed a negative dose-response | The strongest data so far. Spikes in single sessions matter more than weekly percentages |
| Rasmussen et al. 2013, *Int J Sports Phys Ther* 8(2):111–120 | Retrospective cohort, 662 marathon finishers | < 30 km/week: RR 2.02 (1.26–3.24) vs. 30–60 km/week. > 60 km/week: no difference | A marathon needs a minimum volume. More is not riskier per se |
| Bertelsen et al. 2017, *Scand J Med Sci Sports* 27(11):1170–1180 | Conceptual framework | Injury = structure-specific load exceeding structure-specific capacity, per session | Theory behind "progress from what you are used to" |

**Conclusions for the generator**

1. **The "10 % rule" is convention, not evidence.** A graded 10 % build did not reduce injuries (Buist 2008), and the
   weekly ratio showed no relation in the largest cohort (Frandsen 2025). Moderate and large jumps (> 20–30 %) carry a
   weak-to-moderate risk signal (Nielsen 2014, Damsted 2019, Toresdahl 2023). The existing `SAFETY.rampMax = 0.15` is a
   reasonable outer guardrail. It does not need to be stricter.
2. **What you are used to is the reference.** All of the studies measure risk relative to recent load (chronic load, or
   the longest run of the last 30 days). So the peak and the climb should be anchored to recent volume and to volume
   already held, not to the race alone.
3. **Single sessions matter most.** This is a rule for 07-03 (long run, days), not for the weekly skeleton. A proposed
   safety limit is given in 1.5.
4. **More volume goes with faster marathons, but only as an association.** In Doherty et al. 2020 (*J Sci Med Sport*
   23(2):182–188; 85 studies, 137 cohorts), weekly distance, run frequency and longest run were each associated with
   faster finish times. Tanda 2011 (*J Hum Sport Exerc* 6(3):511–520) predicts marathon pace from mean weekly km and
   training pace over the last 8 weeks. Neither study allows a deterministic "goal time → km" rule. Goal time is
   therefore only used for a plausibility warning.

### 1.2 What established plans do

| Source | Distance | Peak tiers | Start vs. peak | Build length |
|---|---|---|---|---|
| Pfitzinger & Douglas, *Advanced Marathoning*, 3rd ed., Human Kinetics 2019 | Marathon | < 55, 55–70, 70–85, 85+ mi/week (≈ 88, 88–113, 113–137, 137+ km) | Start at the low end of the tier. Peak/start ≈ 1.2–1.3 | 18 or 12 weeks |
| Pfitzinger & Latter, *Faster Road Racing*, Human Kinetics 2015 | Half | 31–47, 46–63, 61–84, 81–100 mi/week (secondary source, runningwithrock.com) | 31→47 = 1.52, 46→63 = 1.37, 61→84 = 1.38, 81→100 = 1.23 | about 12 weeks |
| Daniels, *Daniels' Running Formula*, 3rd ed., Human Kinetics 2014 | Marathon (2Q plan) | Plans by peak: 40, 55, 70, 85, 100, 120, > 120 mi | Each week is a share of peak (0.8 / 0.9 / 1.0). Start ≈ 0.8 of peak, so peak ≈ 1.25 × start | 18 weeks |
| Daniels (same book) | Mileage increase | Hold a load for 3–4 weeks, then add at most 1 mile per weekly run (≤ 10 mi) (secondary sources) | n/a | n/a |
| Humphrey, Hanson & Hanson, *Hansons Marathon Method*, VeloPress | Marathon | Beginner ≈ 50–55 mi, Advanced ≈ low 60s mi (secondary sources disagree) | Beginner starts very low (≈ 12–20 mi) | 18 weeks |
| Higdon | Marathon | Long run max 20 mi. Step-back weeks exist | Cadence not verified | 18 weeks |
| Canova | Marathon (elite) | Not checked. His method is about the specific-intensity progression, not volume tables. Not used for numbers | n/a | n/a |

The book numbers come from the books' plan structures as reported by reputable secondary summaries. I could not check
week-by-week tables in the books themselves.

**The common pattern.** Every book plan assumes you already run near the plan's lower end. Peak is then about
**1.2–1.5 × starting volume**, reached over 10–18 weeks, which is a net growth of roughly **2–5 % per week** including
down weeks. The Porto plan went from 64 to 126 km (× 1.97) in 10 weeks: about 7 % per week net, above all of these. The
07-02 draft rule "peak = current ÷ `volume.start` (0.51)" bakes that × 1.96 into every plan.

**Minimum build length (convention).** Marathon 12 weeks (Pfitzinger's short plans), comfortable 16–18. Half marathon
8 weeks minimum, comfortable 10–12. The hard minimum in 07-02 (taper + 3 weeks) stays. Shorter builds than the numbers
above only get a warning.

### 1.3 Proposed peak formula (deterministic)

```text
Inputs
  B   current weekly km   = mean of the last 4 completed weeks (Garmin);
                            if the last 1–3 weeks were a planned recovery block (plan weeks with recovery: true),
                            B = km of the block's last week (that is the planned level, not a detraining signal)
  P   proven weekly km    = highest 4-week rolling mean in the last 52 weeks (fallback: P = B)
  Wg  weeks to peak       = base + build weeks (non-taper weeks before the peak phase)
  distance, goal          only for warnings

Parameters (template, clamped by SAFETY)
  g   = volume.peak.over_base     new ground: peak ≤ B × g
  p   = volume.peak.over_proven   known ground: peak ≤ P × p
  n   = volume.growth             net weekly growth above P (includes down weeks)
  nR  = volume.growth_return      net weekly growth while still below P (returning to known volume)
  gR  = SAFETY.peakOverBaseMax    absolute cap: peak ≤ B × gR
  explicitPeak (optional input)

Algorithm
  K_hist = max(B × g, min(P × p, B × gR))                 // what you are used to
  K_time = climb(B, Wg): k = B; repeat Wg times: k ×= (1 + (k < P ? nR : n))   // what the time allows
  K      = min(K_hist, K_time, B × gR)
  K      = max(K, B)                                      // never plan below current volume
  if volume.peak.max_km: K = min(K, max_km)
  K      = round to 0.5 km
  binding = the cap that won (history | time | absolute | template max | current)

  if explicitPeak:
      K_used = min(explicitPeak, B × gR, climb(B, Wg) with SAFETY.netGrowthMax)
      warn when explicitPeak > K: "Spitze X km liegt über der Empfehlung K km (…)"

  novice (years running < 1 or 12-week mean < 20 km):
      g = min(g, 1.25); n = nR = min(n, 0.04)              // fixed rule, not a parameter

Warnings (never change K)
  K < volume.peak.floor[distance]  → "Für <Distanz> ist die Spitze niedrig – Ziel oder Termin prüfen"
  weeks < phases.min_weeks[distance] → "kurzer Aufbau"
```

**Start of the curve.** In 07-02 the first week is `volume.start × peak`. With this formula, K/B is usually below
1/`volume.start`, so the first week would drop below current volume. To avoid that, use
`s0 = clamp(B / K, volume.start, 0.9)` as the effective start share. Remap the template's base/build/peak shares
affinely, `s' = s0 + (s − volume.start) × (1 − s0) / (1 − volume.start)`, so that the top share stays the peak. Taper
shares are unchanged.

There is a related inconsistency in the Porto template. Its top share is 0.90 (end of build), so no week reaches
1.0 × peak. `buildSkeleton` should either treat the template's highest share as 1.0 or report the peak as
`max share × K`. Otherwise "peak 126 km" produces a top week of 113 km.

### 1.4 Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `volume.peak.over_base` (g) | 1.35 | 1.10–1.60 | template | Book plans: peak/start 1.2–1.5 (Pfitzinger, Daniels). Convention |
| `volume.peak.over_proven` (p) | 1.00 | 0.80–1.10 | template | Do not plan beyond what you have held without new evidence. Convention |
| `volume.growth` (n) | 0.05 | 0.02–0.08 | template | Book plans 2–5 %/week net. Convention |
| `volume.growth_return` (nR) | 0.08 | 0.04–0.10 | template | Returning to known volume goes faster (coaching practice; weak evidence). Bounded by recent-load studies |
| `volume.peak.max_km` | none | > 0 | template, optional | e.g. a "low mileage" template |
| `volume.peak.floor` | marathon 50, half 35, 10k 30 | n/a | template (warning only) | Rasmussen 2013 (< 30 km/week mean → 2 × injury risk in marathoners). Floors are convention |
| `phases.min_weeks` | marathon 12, half 8, 10k 6 | n/a | template (warning only) | Shortest book plans. Convention |
| `volume.start` | as now | 0.4–0.9 | template | Now a lower bound for s0, not the peak divisor |
| `SAFETY.peakOverBaseMax` (gR) | 2.0 | fixed | safety | Outer bound. The Porto plan (× 1.97) sits right at it |
| `SAFETY.netGrowthMax` | 0.10 | fixed | safety | n and nR can never exceed it. Convention, chosen above every book plan and above Porto (≈ 7 %) |
| `SAFETY.rampMax` | 0.15 | fixed (exists) | safety | Weak signal for > 20–30 % jumps |
| novice modifiers (g ≤ 1.25, n ≤ 0.04, recovery every 3) | fixed | n/a | safety rule | Videbæk 2015, Buist 2008 |
| P lookback 52 weeks, 4-week mean | fixed | n/a | code constant | Chronic-load idea (Gabbett 2016). Convention |

### 1.5 Related safety rules (proposed)

- **The ramp limit after a recovery week uses the last load week as reference.** The 07-02 draft exempts the week
  after a recovery week from the ramp check, so 60 → 88 km (+47 %) passes. Measured against the load week before the
  recovery week (80 → 88, +10 %), the same rise is still allowed, but an unlimited jump after a recovery week is not.
- **Long-run spike (for 07-03): the longest run ≤ 1.10 × the longest run of the last 30 days** (Frandsen 2025). Make
  this a `SAFETY.longRunSpikeMax = 0.10`. Note that Porto's 16 → 29 km after a recovery week (30-day longest 26 km) was
  +11.5 %, which is in Frandsen's "small spike" band.

### 1.6 German explanation text ("Warum diese Spitze")

The generator fills in the numbers and shows the sentence for the cap that won (`binding`):

```text
Spitze {K} km pro Woche.
Ausgangspunkt: Du läufst zurzeit {B} km pro Woche ({Quelle: „Schnitt der letzten 4 Wochen“ | „letzte Woche deines Erholungsblocks“}).
[history]  Neu dazukommen dürfen höchstens {g×100−100} % ({B×g} km). In den letzten 12 Monaten hast du schon {P} km
           über vier Wochen gehalten – bis dahin darfst du zurück. Mehr als das plant Runmate nicht, solange du es nicht
           einmal gehalten hast.
[time]     Bis zur Spitzenphase bleiben {Wg} Wochen. Mit höchstens {nR×100} % pro Woche, solange du unter deinem
           bisherigen Umfang bleibst, und {n×100} % darüber, sind in dieser Zeit {K} km erreichbar.
[absolute] Mehr als das Doppelte deines aktuellen Umfangs plant Runmate nie.
[current]  Die Spitze liegt nie unter dem, was du jetzt schon läufst.
Warum so? Verletzungen hängen weniger an einer festen 10-%-Regel als daran, wie weit du über das hinausgehst, was dein
Körper gewohnt ist. Deshalb richtet sich die Spitze nach deinem jetzigen und deinem schon gehaltenen Umfang, nicht nur
nach dem Rennen. {Warnung, falls K < Mindestumfang: „Für einen {Distanz} ist das wenig – Ziel oder Termin prüfen.“}
```

---

## 2. Recovery (down) weeks

### 2.1 Evidence

- **No controlled study in runners compares recovery-week cadences** (2:1 vs. 3:1 vs. 4:1) or depths. A targeted search
  found only coaching sources and one resistance-training deload trial. **Cadence and depth are convention.**
- **Indirect support for planned unloading:**
  - The ECSS/ACSM consensus (Meeusen et al. 2013, *Med Sci Sports Exerc* 45(1):186–205) separates functional
    overreaching, which recovers into better performance, from non-functional overreaching, which happens when training
    and recovery are out of balance.
  - Foster 1998 (*Med Sci Sports Exerc* 30(7):1164–1168) linked illness to individual thresholds of training strain
    (load × monotony). Varying the load reduces monotony.
  - Block periodization (Mølmen, Øfsteng & Rønnestad 2019, *Open Access J Sports Med* 10:145–160) builds concentrated
    loading followed by recovery and shows small advantages for VO2max. This is indirect and comes from trained
    endurance athletes.
- **Critique.** Kiely 2018 (*Sports Med* 48:753–764) argues that rigid, pre-set periodization rests on outdated stress
  theory and that plans should adapt to the athlete. This supports pairing the fixed cadence with adaptive insertion
  (the existing `recovery_week_insertion` strategy on fatigue triggers).
- **Age.** Fell & Williams 2008 (*J Aging Phys Act* 16(1):97–115) review slower muscle recovery in older athletes and
  note that the evidence is limited. Weak support for a shorter cycle at 50+.
- **Experience.** Novices are injured about twice as often per hour (Videbæk 2015). This supports a shorter cycle.
- **Taper is different from a recovery week and is evidence-based.** Bosquet et al. 2007 (*Med Sci Sports Exerc*
  39(8):1358–1365; 27 studies): the best results came from about 2 weeks with volume cut by 41–60 % and intensity and
  frequency kept. Mujika & Padilla 2003 say the same. The taper already gives recovery, so no extra down week is needed
  right before it.
- **Practice.**
  - Daniels' 2Q plan has 3 weeks with two quality sessions, then a 4th week without (secondary source).
  - Coaching sources commonly cut 20–30 % every 3rd–4th week.
  - The Porto plan used every 4th week at −25 to −28 %.
  - The runmate-webapp used every 4th week at 70 %.
- **Illness.**
  - Return is graded. For COVID-19, Elliott et al. 2020 (*Br J Sports Med* 54:1174–1175) start after ≥ 10 days rest
    and 7 days symptom-free, then go through capped stages. Some athletes need more than 3 weeks.
  - For ordinary short infections there is no running-specific trial. Use the same principle: step back, then rebuild,
    and never "make up" lost km.
  - Daniels' return-after-break table (Running Formula) is often cited. I could not verify its exact percentages, so it
    is not used here.

### 2.2 Proposed recovery rule (deterministic)

```text
Parameters (template): every (e), volume (rv), key_sessions.recovery, long_run_share.recovery
Fixed: SAFETY.recoveryVolumeMax 0.9 (exists), SAFETY.maxLoadWeeksInRow 5

N = number of non-taper weeks (index 0 … N−1)

1. Cadence: e_eff = e; if novice or age ≥ 50: e_eff = min(e, 3)
2. Placement (forward from the start): R = { i | i = e_eff−1, 2·e_eff−1, … < N }
3. Remove a recovery week i if fewer than 2 load weeks follow it before the taper (N−1−i < 2).
   The taper serves as recovery, so the last block may stretch to e_eff+1 load weeks.
4. Restarting the count (applied in order, then placement continues from the new anchor):
   - a week with a tune-up race ≥ ½ of the goal distance (or ≥ 15 km) is a recovery week (mini taper)
   - an illness or interruption week (≥ 4 days without running, or < 50 % of the planned km) is a recovery week
   - a recovery week inside 1 week of such an event is dropped (no two light weeks in a row)
5. Depth: recovery km = previous load week × rv. rv ≤ SAFETY.recoveryVolumeMax.
   At most key_sessions.recovery key sessions (default 1, short and race-specific).
   The long run is at most long_run_share.recovery × the previous long run.
6. Ramp after recovery: the next load week ≤ last load week × (1 + min(ramp_max, SAFETY.rampMax)).
7. Check: never more than SAFETY.maxLoadWeeksInRow load weeks in a row outside the taper.
   If violated (e.g. a long plan with e = 5 and stretched blocks), insert a recovery week in the middle of the block.

Interruption (illness) during the plan:
   week 1 back ≤ 70 % and week 2 ≤ 90 % of the last load week before the interruption, no key session until
   2 days symptom-free; then recompute the peak from the new state:
      K' = min(K, climb(B_now, remaining weeks to peak))      // the peak only goes down, never up
   The taper and race day stay fixed. Missed weeks are not compressed into the remaining weeks.
```

**How the two rules interact.**

- Recovery weeks are already inside the peak formula: `n` and `nR` are net rates that include down weeks, and
  `K_time` counts calendar weeks.
- A shorter cycle (e = 3) means more down weeks. For the same `n`, the load weeks must rise a bit more. Because the ramp
  check is now measured against the last load week, that extra rise is capped too.
- After an interruption the peak can only come down.

### 2.3 Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `volume.recovery_week.every` (e) | 4 | 3–5 | template (exists) | 3:1 convention. Porto, webapp and Daniels' 2Q rhythm |
| `volume.recovery_week.volume` (rv) | 0.75 | 0.60–0.85 | template (exists) | Coaching sources cut 20–30 %. Porto −25/−28 %. Convention |
| `week.key_sessions.recovery` | 1 | 0–1 | template (new) | Daniels 2Q drops quality in week 4. Many coaches keep one short touch. Convention |
| `week.long_run.recovery_share` | 0.70 | 0.5–0.85 | template (new) | Porto 29 → 21 km. Convention |
| `SAFETY.recoveryVolumeMax` | 0.90 | fixed (exists) | safety | A recovery week must be lighter |
| `SAFETY.maxLoadWeeksInRow` | 5 | fixed (new) | safety | Outer bound of the 3:1 / 4:1 convention plus one stretched block |
| novice / age ≥ 50 → e ≤ 3 | fixed | n/a | safety rule | Videbæk 2015; Fell & Williams 2008 (weak) |
| race week / illness week = recovery week, restart count | fixed | n/a | engine rule | Convention. Avoids two light weeks in a row |
| return after illness 70 % → 90 % → plan | fixed | n/a | engine rule | Graded-return principle (Elliott 2020). Percentages are convention |
| no recovery week with < 2 load weeks before the taper | fixed | n/a | engine rule | The taper gives recovery (Bosquet 2007) |

---

## 3. Worked examples

The tables below come from a small reference implementation of the rules above: phase split 0.29/0.47/0.24, linear
climb from B to K over the load weeks, the ramp limit (12 %) measured against the last load week, recovery weeks at
0.75, and the template's taper shares. Km are rounded to 0.5.

### 3.1 Porto 2026 (22.6.–8.11.2026, 20 weeks)

Inputs: B = 64 km, distance marathon, 17 non-taper weeks. Phases: 5 base, 8 build, 4 peak, so Wg = 13. Recovery weeks
(e = 4): weeks 4, 8 and 12. Week 16 is dropped because only one load week would follow it.

| Case | K_hist | K_time | **Peak K** | Binding cap |
|---|---|---|---|---|
| no history in the last 52 weeks (P = B = 64) | 64 × 1.35 = 86.4 | 64 × 1.05¹³ = 120.7 | **86.5 km** | history (new ground) |
| P = 126 (had 126 km been held in the last year) | min(126, 128) = 126 | 155.5 | **126 km** | history |
| explicit peak 126 (AC-1) | n/a | n/a | 126 km used | warning: "126 km über der Empfehlung 86,5 km" |

Curve for P = B (km per week):

64 · 66 · 68.5 · **51.5R** · 71 · 73 · 75 · **56R** · 77.5 · 80 · 82 · **61.5R** · 84 · 86.5 · 86.5 · 86.5 · 86.5 |
taper 60.5 · 48.5 · 21

**Comparison with the real Porto plan.**

- The real plan reached 126 km in week 11, with recovery weeks in weeks 4 and 8 (× 1.97 in 10 weeks, ≈ 7 % per week
  net). This is about 1.5 × the peak this rule gives without proven history.
- The real plan is inside the safety bounds (gR = 2.0, net growth ≤ 10 %) but well above the book conventions (1.2–1.5 ×).
- Its post-recovery weeks rose 80 → 60 → 88 and 105 → 76 → 112. That is +10 % and +7 % against the last load week, so
  the proposed ramp rule allows them.
- The infection in KW38 came two weeks after the 126-km week. One case shows nothing causal. Foster 1998 links illness
  to strain thresholds only at group level.
- Whether 126 km was "known ground" depends on an earlier marathon build that falls outside the 52-week window. If
  a runner wants such builds to count, the lookback could be 104 weeks with `p` ≈ 0.9. That would be a template decision,
  not evidence.

### 3.2 Half marathon ~21.2.2027 (sub 1:25), start 30.11.2026, 12 weeks

Inputs:

- **B = 50 km.** That is the last week of the planned recovery block (KW48 in `porto-2026.ts`), not the 4-week mean
  (≈ 33 km, distorted by the taper and the race).
- **Taper: 2 weeks** at [0.70, 0.40] (the 07-02 test fixture), so 10 non-taper weeks.
- **Phases: 3 base, 5 build, 2 peak**, so Wg = 8.
- **Recovery weeks (e = 4): week 4 (21.–27.12.2026, Christmas) and week 8 (18.–24.1.2027).** Week 8 has two load weeks
  after it (25.1. and 1.2.) before the taper starts on 8.2.
- **P:** I could not read Garmin from this session. The `porto-2026.ts` plan weeks KW40–43 (105, 100, 112, 88) give a
  4-week mean of ≈ 101 km, used here as an estimate. Replace it with the measured value.

| Case | K_hist | K_time | **Peak K** | Binding cap |
|---|---|---|---|---|
| P ≈ 101 (Porto build counts) | max(67.5, min(101, 100)) = 100 | 50 × 1.08⁸ = 92.5 (still below P, so nR) | **92.5 km** | time |
| P = B (no history) | 67.5 | 73.9 | **67.5 km** | history |

Curve for P ≈ 101:

| Week | Monday | KW | Phase | km |
|---|---|---|---|---|
| 1 | 30.11.2026 | 49 | base | 50 |
| 2 | 07.12. | 50 | base | 56 |
| 3 | 14.12. | 51 | base | 62.5 |
| 4 | 21.12. | 52 | build | **47 R** |
| 5 | 28.12. | 53 | build | 70 |
| 6 | 04.01.2027 | 1 | build | 78.5 |
| 7 | 11.01. | 2 | build | 85.5 |
| 8 | 18.01. | 3 | build | **64 R** |
| 9 | 25.01. | 4 | peak | 92.5 |
| 10 | 01.02. | 5 | peak | 92.5 |
| 11 | 08.02. | 6 | taper | 65 |
| 12 | 15.02. | 7 | taper (race 21.2.) | 37 |

Curve for P = B: 50 · 53 · 56 · **42R** · 59 · 61.5 · 64.5 · **48.5R** · 67.5 · 67.5 | taper 47 · 27.

**Reading the results.**

- 92.5 km sits in the upper part of Pfitzinger's 46–63-mi half-marathon tier (74–101 km). That is plausible for a
  3:05-level marathoner aiming at 1:25 (about one VDOT step faster).
- The climb is 8 % per week net. That is fast by book standards but is a return to volume held six weeks earlier.
  The recent-load studies (Frandsen's 30-day window) give no guarantee that volume held 6–12 weeks ago still protects.
  If that is a concern, the template can set `nR` = 0.06, which gives K = 50 × 1.06⁸ = 79.5 km.
- Both cases put recovery weeks over Christmas and in mid-January, and no recovery week in the 2 weeks before the taper.

---

## 4. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| Anchor peak and climb to recent / held volume | **Moderate** (consistent across load-injury cohorts; mostly associations) |
| No fixed 10 % rule. Outer weekly cap 15 % | **Moderate** that 10 % does not protect (RCT + cohorts). **Weak** for the cap value |
| Avoid single-session spikes (> 10 % over the 30-day longest run) | **Moderate** (one large cohort, Frandsen 2025; not yet replicated) |
| Peak ≤ 1.35 × current, net growth 5 %/week, return 8 %/week | **Convention** (book plans), no trial |
| Peak ≤ 2 × current, net growth ≤ 10 % (safety) | **Convention**, set as an outer bound |
| Marathon peak floor 50 km (warning) | **Weak** (Rasmussen 2013, retrospective, self-reported) |
| Recovery week every 4th (3rd for novices / 50+) | **Convention**. Age and novice adjustments weakly supported |
| Recovery depth 25 %, ≤ 1 key session | **Convention** |
| No extra down week before the taper. Taper cuts volume 40–60 %, keeps intensity | **Moderate–strong** for the taper (meta-analysis). The no-extra-week rule follows from it |
| Illness: graded return, lower the peak, never compress | **Weak** (expert guidance, COVID-specific). Percentages are convention |

## 5. Suggestions for 07-02

1. Replace the peak derivation with 1.3. AC-5's explanation becomes the 1.6 text.
2. Keep forward recovery placement and add rules 3–4 and 6 of 2.2. In AC-2, measure the ramp invariant against the
   last load week instead of exempting the week after a recovery week.
3. Add the new template fields with defaults so that the Porto template still validates. The Porto reproduction (AC-1)
   keeps the explicit peak of 126 and gets the warning.
4. Add `SAFETY.peakOverBaseMax`, `netGrowthMax`, `maxLoadWeeksInRow` now, and `longRunSpikeMax` with 07-03.

## Sources

Peer-reviewed:

- Bertelsen ML, Hulme A, Petersen J, et al. (2017). A framework for the etiology of running-related injuries. *Scand J Med Sci Sports* 27(11):1170–1180.
- Bosquet L, Montpetit J, Arvisais D, Mujika I (2007). Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8):1358–1365.
- Buist I, Bredeweg SW, van Mechelen W, et al. (2008). No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial. *Am J Sports Med* 36(1):33–39.
- Damsted C, Glad S, Nielsen RO, Sørensen H, Malisoux L (2018). Is there evidence for an association between changes in training load and running-related injuries? A systematic review. *Int J Sports Phys Ther* 13(6):931–942.
- Damsted C, Parner ET, Sørensen H, Malisoux L, Hulme A, Nielsen RO (2019). The association between changes in weekly running distance and running-related injury: preparing for a half marathon. *J Orthop Sports Phys Ther* 49(4):230–238.
- Damsted C, Parner ET, Sørensen H, Malisoux L, Nielsen RO (2019). ProjectRun21: Do running experience and running pace influence the risk of running injury — a 14-week prospective cohort study. *J Sci Med Sport* (published 2019; volume/pages not verified here).
- Doherty C, Keogh A, Davenport J, Lawlor A, Smyth B, Caulfield B (2020). An evaluation of the training determinants of marathon performance: a meta-analysis with meta-regression. *J Sci Med Sport* 23(2):182–188.
- Elliott N, Martin R, Heron N, et al. (2020). Infographic. Graduated return to play guidance following COVID-19 infection. *Br J Sports Med* 54(19):1174–1175.
- Fell J, Williams AD (2008). The effect of aging on skeletal-muscle recovery from exercise: possible implications for aging athletes. *J Aging Phys Act* 16(1):97–115.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. *Med Sci Sports Exerc* 30(7):1164–1168.
- Frandsen JSB, Hulme A, Parner ET, et al., Nielsen RO (2025). How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study. *Br J Sports Med* 59(17):1203–1210. doi:10.1136/bjsports-2024-109380.
- Gabbett TJ (2016). The training—injury prevention paradox: should athletes be training smarter and harder? *Br J Sports Med* 50(5):273–280.
- Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *Int J Sports Physiol Perform* 15(6):907–913.
- Impellizzeri FM, Woodcock S, Coutts AJ, et al. (2021). What role do chronic workloads play in the acute to chronic workload ratio? Time to dismiss ACWR and its underlying theory. *Sports Med* 51(3):581–592.
- Kiely J (2018). Periodization theory: confronting an inconvenient truth. *Sports Med* 48(4):753–764.
- Meeusen R, Duclos M, Foster C, et al. (2013). Prevention, diagnosis, and treatment of the overtraining syndrome: joint consensus statement of the ECSS and ACSM. *Med Sci Sports Exerc* 45(1):186–205.
- Mølmen KS, Øfsteng SJ, Rønnestad BR (2019). Block periodization of endurance training – a systematic review and meta-analysis. *Open Access J Sports Med* 10:145–160.
- Mujika I, Padilla S (2003). Scientific bases for precompetition tapering strategies. *Med Sci Sports Exerc* 35(7):1182–1187.
- Nielsen RO, Parner ET, Nohr EA, Sørensen H, Lind M, Rasmussen S (2014). Excessive progression in weekly running distance and risk of running-related injuries: an association which varies according to type of injury. *J Orthop Sports Phys Ther* 44(10):739–747.
- Rasmussen CH, Nielsen RO, Juul MS, Rasmussen S (2013). Weekly running volume and risk of running-related injuries among marathon runners. *Int J Sports Phys Ther* 8(2):111–120.
- Tanda G (2011). Prediction of marathon performance time on the basis of training indices. *J Hum Sport Exerc* 6(3):511–520.
- Toresdahl BG, Metzl JD, Kinderknecht J, et al., Fontana MA (2023). Training patterns associated with injury in New York City Marathon runners. *Br J Sports Med* 57(3):146–152.
- Videbæk S, Bueno AM, Nielsen RO, Rasmussen S (2015). Incidence of running-related injuries per 1000 h of running in different types of runners: a systematic review and meta-analysis. *Sports Med* 45(7):1017–1026.

Coaching books (plan structures as described in secondary summaries; tables not checked in the books themselves):

- Daniels J (2014). *Daniels' Running Formula*, 3rd ed. Human Kinetics.
- Humphrey L, Hanson K, Hanson K (2012). *Hansons Marathon Method*. VeloPress.
- Pfitzinger P, Douglas S (2019). *Advanced Marathoning*, 3rd ed. Human Kinetics.
- Pfitzinger P, Latter P (2015). *Faster Road Racing*. Human Kinetics.

Not verified, so not used for numbers: Daniels' return-after-break percentages, Higdon's step-back cadence, Canova
volume figures.
