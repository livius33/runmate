# Research: intensity distribution, workout menus and progressions

Status: research note for plan 07-03 (engine step 4: workouts per phase, quality km) and 07-04 follow-ups (template
workout lists). Not a methodology template. Written 2026-10-24.

**Questions**

1. How should the week's km be distributed over easy / moderate / hard (pyramidal, polarized, threshold), per phase
   and distance?
2. Which workouts belong to which phase and distance, and how do they progress?
3. When does race-pace work start?
4. How much quality km may one session carry?

**Short answer**

- **Distribution.** The literature agrees on one thing: ≥ 75–80 % of training (by time or sessions) at low intensity.
  Whether the remaining 20 % should sit at threshold (pyramidal) or above (polarized) is contested: polarized beat
  threshold in RCTs (Rosenblat 2019, Stöggl & Sperlich 2014), but pyramidal is what most elite distance runners do most
  of the year (Haugen 2022, Casado 2021), and shifting from pyramidal to polarized toward a 5-km race worked best in
  the one 16-week study that tested a sequence (Filipas 2022). Rule: base and build pyramidal-leaning (easy ≥ 80 %,
  moderate 10–15 %, hard ≤ 5–8 %), peak race-specific: more hard for 10 km, more HM/threshold for the half, more
  marathon pace (moderate) for the marathon. The template's `intensity.<phase>` fields exist; the basis (km vs time) is
  gap G-3.
- **Menus.** Threshold (continuous 20–40 min or cruise intervals), VO2max intervals (3–5 min reps, 4–8 km total), race
  pace (MP 8 → 16 km; HM pace 6 → 12 km), medium-long, long runs, strides and hills in base. Progressions are linear
  in volume within a phase (`from → to`, exists); rep structures are gap G-5.
- **Race-pace timing.** Marathon pace from the start of build (≈ 10–12 weeks out, Hansons from week ~6, Pfitzinger MP
  long runs mid-plan); HM pace in the last 6–8 weeks with threshold all along; 10-km pace (VO2 intervals) from build.
  Gap G-18: a template field for the start of race-specific work.
- **Session caps** (Daniels): T ≤ 10 % of weekly km, I ≤ 8 % or 10 km, R ≤ 5 % or 8 km, M ≤ 20 % or 29 km. Hansons
  fixes SOS amounts (speed ~5 km of reps, strength ~10 km, tempo up to 16 km). Gap G-4.

---

## 1. Intensity distribution

### 1.1 Evidence

| Study | Design | Finding | For the generator |
|---|---|---|---|
| Seiler & Kjerland 2006, *Scand J Med Sci Sports* 16(1):49–56 | Elite junior XC skiers, sessions by HR | ~75 % / 8 % / 17 % of sessions in zones 1/2/3 | Origin of "polarized" |
| Seiler 2010, *Int J Sports Physiol Perform* 5(3):276–291 | Review of elite practice | ~80 % of sessions low intensity across endurance sports; distribution shifts with the season | The 80 % floor |
| Esteve-Lanao et al. 2007, *J Strength Cond Res* 21(3):943–949 | 12 sub-elite runners, 5 months | 80/12/8 group improved more than 67/25/8 | Small RCT for more low intensity |
| Stöggl & Sperlich 2014, *Front Physiol* 5:33 | 48 trained athletes, 9 weeks, 4 models | Polarized > threshold, HIIT and high-volume for VO2peak and time to exhaustion | RCT for polarized |
| Muñoz et al. 2014, *Int J Sports Physiol Perform* 9(2):265–272 | 30 recreational runners, 10 weeks | 10 km −5.0 % (polarized) vs −3.6 % (threshold), **not significant**; adherence analysis favoured polarized | Weak |
| Kenneally, Casado, Santos-Concejero 2018, *Int J Sports Physiol Perform* 13(9):1114–1121 | Systematic review, middle/long distance | Pyramidal and polarized both effective; elites mostly pyramidal | — |
| Rosenblat, Perrotta, Vicenzino 2019, *J Strength Cond Res* 33(12):3491–3500 | Meta-analysis of RCTs | Polarized may improve endurance performance more than threshold | **Moderate** against threshold-heavy plans |
| Campos et al. (incl. Casado) 2022, *Int J Sports Med* 43(4):305–316 | Systematic review, runners | Pyramidal and polarized (≥ 70 % low intensity) beat threshold TID; zone definitions vary across studies | Keep ≥ 70–80 % low |
| Filipas et al. 2022, *Scand J Med Sci Sports* 32(3):498–511 | 60 well-trained runners, 16 weeks, 4 sequences | Pyramidal → polarized gave the largest 5-km gain (~1.5 %); all improved | Sequence: general (pyramidal) → specific (polarized) for 5 km |
| Burnley, Bearden, Jones 2022, *Med Sci Sports Exerc* 54(6):1032–1034; Foster et al. reply 1035–1037 | Debate | Burnley: evidence does not show polarized is best; favour zones 1–2 over 3 (pyramidal). Foster: both work, depends on the event | The field is not settled |
| Treff et al. 2019, *Front Physiol* 10:707 | Method | Polarization index: PI = log10(Z1/Z2 × Z3 × 100); PI > 2.0 = polarized | A computable classifier for templates |
| Haugen et al. 2022, *Sports Med Open* 8:18 | World-class practice | ≥ 80 % low intensity all year; race-pace volume increases toward the main competition; marathoners pyramidal | Marathon: pyramidal with rising MP volume |
| Casado et al. 2021, *J Strength Cond Res* 35(9):2525–2531 | 85 world-class runners' training | Easy volume plus tempo and short intervals best predict performance | Easy volume is the base of everything |
| Casado et al. 2023, *Int J Environ Res Public Health* 20(5):3782 | Norwegian threshold model description | 3–4 lactate-controlled threshold sessions per week plus one fast session; no controlled studies | A pyramidal extreme; works for elites, untested for amateurs |

**Reading of the evidence.** (1) The low-intensity share ≥ 75–80 % is the robust part (reviews, elite practice, RCTs).
(2) Threshold-dominated distributions lose to both alternatives in the RCT literature. (3) Pyramidal vs. polarized is
event- and phase-dependent: longer races and base phases lean pyramidal, shorter races and peak phases lean polarized.
(4) The literature counts time or sessions; our templates count km (G-3), which understates the easy share (easy km are
slower). describe.ts already converts for display.

### 1.2 Proposed rule

```text
Template (exists): intensity.<phase> = { easy, moderate, hard } by km
Template (new, G-3): intensity.basis: km | time | sessions (default km)

Code checks per generated week (not template values):
  easy_time_share ≥ 0.75  (convert km shares with pace offsets)              → else warn "zu wenig lockerer Umfang"
  moderate + hard ≤ 0.30 by time
  per distance in peak phase (plausibility, warn only):
     marathon: moderate ≥ hard (MP-heavy)       half: moderate ≈ hard (T and HM pace)       10k: hard ≥ moderate
  PI (Treff 2019) is reported for the template picker: "polarisiert" if PI > 2.0, else "pyramidal"

Assigning sessions from the shares (07-03):
  quality_km_week = (moderate + hard) × K_w
  split quality_km_week over key_sessions[phase] by the workouts list: long-run block first (long-run.md),
  then threshold/race pace (moderate), then VO2/hills/strides (hard); each capped per session (section 3);
  remaining km easy; recovery runs = the shortest easy runs after hard days.
```

---

## 2. Workout menus and progressions

### 2.1 Practice per method (from RESEARCH.md and the books, secondary-checked)

| Kind | Daniels | Pfitzinger | Hansons | Lydiard | Norwegian | 80/20 |
|---|---|---|---|---|---|---|
| Threshold | T: 20 min continuous or cruise intervals (e.g. 5 × 1 mi, 1 min rest), ≤ 10 % of week | LT runs 4 → 7 mi at 15 k–HM pace | "Strength" 6 × 1 mi … 3 × 2 mi at MP − 10 s/mi | — | 3–4 sessions/week: 5 × 6 min, 10 × 1000 m, 25 × 400 m at 2–4 mmol/L | T intervals |
| VO2max | I: 3–5 min reps, ≤ 8 % or 10 km | 600–1600 m at 5 k pace, race-prep phase | "Speed" 12 × 400 → 3 × 1600 m at 5–10 k pace, early | anaerobic phase ≤ 4 weeks | one hill/fast session per week | Z5 intervals |
| Race pace | M-pace in L runs (phase IV) | MP long runs 8–14 mi; tune-ups | Tempo at MP 5 → 10 mi weekly | — | — | HM pace in peak |
| Reps/speed | R: 200–400 m, ≤ 5 % or 8 km | strides 10 × 100 m | — | sprints in hill phase | 200 m hills | strides |
| Hills | — | — | — | 4-week hill phase: bounding, springing, steep running | 20 × 200 m | — |
| Medium-long | Q2 often medium-long | 11–16 mi midweek | — | second long run | — | — |

### 2.2 Proposed menu per distance and phase (defaults when a template's `workouts` list is empty; the template list
wins)

```text
Base (all distances):  long_easy · strides 6–10 × 20 s (2×/week inside easy runs) · hills 8–12 × 30–60 s (optional)
                       · threshold 15 → 25 min continuous once per week from base week 3 (if key_sessions.base ≥ 1)
Build
  marathon:  threshold 25 → 40 min (or 2–3 × 10–15 min) · marathon_pace 8 → 14 km (continuous or inside medium_long)
             · long_with_pace blocks 6 → 12 km · medium_long 18 → 24 km · intervals_vo2 5 → 8 × 1000 m (every 2nd–3rd week)
  half:      threshold 25 → 40 min · half_marathon_pace 6 → 10 km · intervals_vo2 5 → 8 × 1000 m or 4–5 × 1200 m
             · medium_long 16 → 20 km
  10k:       intervals_vo2 5 → 8 × 1000 m / 4 → 6 × 1200 m · threshold 20 → 30 min · strides
Peak
  marathon:  marathon_pace 12 → 16 km · long_with_pace 14 → 22 km · threshold 30 min (hold) · test 20 km @ MP
             (3–4 weeks out) · intervals_vo2 short (5 × 1000 m) once
  half:      half_marathon_pace 8 → 12 km (continuous or 3 × 3–4 km) · threshold 2 × 15 min · intervals_vo2 6 × 1000 m
             · test 10 km race or 12 km @ HM pace (2–3 weeks out)
  10k:       intervals_vo2 6 → 8 × 1000 m at 10 k pace · 3 × 2 km @ 10 k pace · threshold 20 min · test 5 km
Taper (phases-and-taper.md rule 3): same kinds at quality_share ≈ 0.55 of the peak session, last hard session
  last_hard_days_before; race-pace reminders ≤ 3 km in race week.
Recovery weeks: one key session, short and race-specific (peak-and-recovery.md).

Progression within a phase: linear from `from` to `to` over the phase's load weeks (exists); recovery weeks repeat
the previous value × 0.7; after a missed key session the progression index does not advance (adaptation.md).
```

### 2.3 Race-pace timing (gap G-18)

| Distance | Race-specific pace | Starts | Basis |
|---|---|---|---|
| Marathon | MP blocks | start of build (≈ 10–12 weeks out); small MP touches (4–6 km) allowed in base | Hansons tempo from ~week 6, Pfitzinger MP long runs mid-plan, Daniels M in III/IV. **Convention** |
| Half | HM pace | peak phase (last 6–8 weeks before the taper); threshold throughout | Pfitzinger half, Daniels T as HM core. **Convention** |
| 10 km | 10-km pace intervals | build | Daniels I phase. **Convention** |

Proposed field: `workouts.race_specific.start_weeks_before[distance]` (M 12, HM 8, 10k 10) — **G-18**. Until then a
code constant.

---

## 3. Quality km caps per session

| Pace | Cap | Source |
|---|---|---|
| Threshold (T) | ≤ 10 % of weekly km per session; 20–60 min total | Daniels [B] |
| VO2max (I) | ≤ 8 % of weekly km or 10 km, whichever is less | Daniels [B] |
| Repetition (R) | ≤ 5 % or 8 km | Daniels [B] |
| Marathon pace (M) | ≤ 20 % or 29 km (18 mi) | Daniels [B] |
| Hansons SOS | speed ≈ 4.8 km of reps; strength ≈ 9.6 km; tempo ≤ 16 km | Hansons [B, secondary] |
| Norwegian threshold session | 5 × 6 min … 10 × 1000 m (≈ 8–10 km at threshold) | Casado 2023 [P] |

Proposed: template `max_share` and `max_km` per workout (**G-4**), with the Daniels values as code defaults; a
**SAFETY.qualityKmPerSessionMax = 0.25 × weekly km** as outer bound (no book exceeds 20 %; convention). Also a weekly
bound: quality km (moderate + hard) ≤ 0.30 × weekly km by time (section 1.2), outside race weeks.

---

## 4. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `intensity.<phase>` | base 90/8/2, build 82/12/6, peak per distance (M 78/18/4, HM 80/10/10, 10k 80/6/14), taper 85/10/5 (km) | Σ 1 | template (exists) | Seiler 2010, Haugen 2022, Filipas 2022. **Moderate** for ≥ 80 % easy, **convention** for the split |
| `intensity.basis` | km | km/time/sessions | template (new, G-3) | Literature counts time/sessions |
| easy-time floor 0.75 (warning) | fixed | — | code constant | Seiler 2010, Campos 2022. **Moderate** |
| PI > 2.0 = polarized (label) | fixed | — | code constant | Treff 2019 |
| `workouts.<phase>[]` | per template; defaults in 2.2 | — | template (exists) | Books. **Convention** |
| `workouts.race_specific.start_weeks_before` | M 12, HM 8, 10k 10 | 4–16 | template (new, G-18) | Books. **Convention** |
| per-session caps (T 10 %, I 8 %/10 km, R 5 %/8 km, M 20 %/29 km) | Daniels | — | template (new, G-4), code defaults | Daniels [B]. **Convention** |
| `SAFETY.qualityKmPerSessionMax` | 0.25 × week | fixed | safety (new) | Above every book cap. **Convention** |
| weekly quality ≤ 0.30 by time | fixed | — | code check (warn) | Campos 2022 (≤ 30 % at threshold + HIIT). **Moderate** |
| rep structures | — | — | template (new, G-5) | needed for "6 × 1 mi" style sessions |
| kinds `repetition`, `fartlek`, pace `tempo` | — | — | schema (G-10) | — |

---

## 5. German explanation text ("Warum diese Verteilung")

```text
Diese Woche: {easy} % locker, {moderate} % im Marathon- bis Schwellentempo, {hard} % schneller (nach Zeit).
Fast alle Studien und die Trainingsdaten von Weltklasse-Läufern zeigen dasselbe Bild: mindestens 80 % des Umfangs
locker. Ob der Rest eher an der Schwelle (pyramidal) oder deutlich schneller (polarisiert) liegt, ist offen; für den
Marathon zählt Marathontempo, für 10 km die schnellen Intervalle, der Halbmarathon liegt dazwischen. Deshalb wird die
Verteilung zum Rennen hin spezifischer. Pro Einheit sind höchstens {cap} km Qualität geplant.
```

## 6. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| ≥ 75–80 % low intensity by time | **Moderate–strong** (reviews, elite practice, RCTs) |
| Avoid threshold-dominated distributions | **Moderate** (RCT meta-analysis) |
| Pyramidal → more polarized/specific toward the race | **Moderate** for 5 km (one study); **convention** for HM/M |
| Specific workout menus and progressions | **Convention** (books) |
| Race-pace start times | **Convention** |
| Per-session caps | **Convention** (Daniels); weekly 30 % cap **moderate** |
| Hills in base improve 5-km performance | **Weak–moderate** (Barnes et al. 2013, *Int J Sports Physiol Perform* 8(6):639–647: any uphill interval programme ≈ +2 % 5-km TT in trained runners) |

## 7. Suggestions for the plans

1. 07-03: implement 1.2 (time-based check, PI label), 2.2 defaults, 2.3 constant, 3 caps with Daniels defaults.
2. 07-05: the parameter editor shows the PI label and the easy-time share next to the km shares.
3. Schema: G-3, G-4, G-5, G-10, G-18.

## Sources

Peer-reviewed:

- Barnes KR, Hopkins WG, McGuigan MR, Kilding AE (2013). Effects of different uphill interval-training programs on running economy and performance. *Int J Sports Physiol Perform* 8(6):639–647.
- Burnley M, Bearden SE, Jones AM (2022). Polarized training is not optimal for endurance athletes. *Med Sci Sports Exerc* 54(6):1032–1034. Foster C, et al. (2022). Polarized training is optimal for endurance athletes: response. *Med Sci Sports Exerc* 54(6):1035–1037.
- Campos Y, Casado A, Vieira JG, et al. (2022). Training-intensity distribution on middle- and long-distance runners: a systematic review. *Int J Sports Med* 43(4):305–316.
- Casado A, Hanley B, Santos-Concejero J, Ruiz-Pérez LM (2021). World-class long-distance running performances are best predicted by volume of easy runs and deliberate practice of short-interval and tempo runs. *J Strength Cond Res* 35(9):2525–2531.
- Casado A, Foster C, Bakken M, Tjelta LI (2023). Does lactate-guided threshold interval training within a high-volume low-intensity approach represent the "next step" in the evolution of distance running training? *Int J Environ Res Public Health* 20(5):3782.
- Esteve-Lanao J, Foster C, Seiler S, Lucia A (2007). Impact of training intensity distribution on performance in endurance athletes. *J Strength Cond Res* 21(3):943–949.
- Filipas L, Bonato M, Gallo G, Codella R (2022). Effects of 16 weeks of pyramidal and polarized training intensity distributions in well-trained endurance runners. *Scand J Med Sci Sports* 32(3):498–511.
- Haugen T, Sandbakk Ø, Seiler S, Tønnessen E (2022). The training characteristics of world-class distance runners. *Sports Med Open* 8:18.
- Kenneally M, Casado A, Santos-Concejero J (2018). The effect of periodization and training intensity distribution on middle- and long-distance running performance: a systematic review. *Int J Sports Physiol Perform* 13(9):1114–1121.
- Muñoz I, Seiler S, Bautista J, España J, Larumbe E, Esteve-Lanao J (2014). Does polarized training improve performance in recreational runners? *Int J Sports Physiol Perform* 9(2):265–272.
- Rosenblat MA, Perrotta AS, Vicenzino B (2019). Polarized vs. threshold training intensity distribution on endurance sport performance: a systematic review and meta-analysis of randomized controlled trials. *J Strength Cond Res* 33(12):3491–3500.
- Seiler KS, Kjerland GØ (2006). Quantifying training intensity distribution in elite endurance athletes: is there evidence for an "optimal" distribution? *Scand J Med Sci Sports* 16(1):49–56.
- Seiler S (2010). What is best practice for training intensity and duration distribution in endurance athletes? *Int J Sports Physiol Perform* 5(3):276–291.
- Stöggl T, Sperlich B (2014). Polarized training has greater impact on key endurance variables than threshold, high intensity, or high volume training. *Front Physiol* 5:33.
- Treff G, Winkert K, Sareban M, Steinacker JM, Sperlich B (2019). The polarization-index: a simple calculation to distinguish polarized from non-polarized training intensity distributions. *Front Physiol* 10:707.

Coaching books (secondary summaries): Daniels 2014; Humphrey, Hanson & Hanson 2012; Lydiard & Gilmour 2000; Pfitzinger &
Douglas 2019; Pfitzinger & Latter 2015; Fitzgerald 2014.

Not verified: Muñoz 2014, Esteve-Lanao 2007 and Barnes 2013 volume/pages were taken from memory of the index, not
re-checked in this session (the papers' existence and findings were confirmed via PubMed abstracts); Hansons' exact SOS
distances; Daniels' caps are from the book as summarised in RESEARCH.md.
