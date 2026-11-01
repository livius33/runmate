# Research: the long run — caps, progression, spike rule, race pace

Status: research note for plan 07-03 (engine step 4, long-run prescription) and 07-07 (long-run adaptation). Not a
methodology template. Written 2026-10-24.

**Questions**

1. How long may the long run be: share of the week, km, minutes, per distance and phase?
2. How does it progress week to week, and how does the single-session spike rule (Frandsen 2025) constrain it?
3. When and how much race pace goes into long runs?

**Short answer**

- **Caps.** The books agree more than they seem to: long run ≤ 25–33 % of the week, ≤ 2.5–3 h, ≤ 32–35 km for a
  marathon (Daniels 25 %/150 min, Pfitzinger 20–22 mi, Hansons 16 mi ≈ 3 h, Lydiard 2–3 h). The 3-hour ceiling has a
  physiological anchor: at ~70 % VO2max trained athletes exhaust muscle glycogen in about 3 h (Coyle 1986). For a half
  marathon 20–26 km / ≤ 2 h; 10 km 16–18 km. The template fields exist (`week.long_run.share/max_km/max_minutes`);
  the per-phase caps are gap G-12.
- **Spike rule.** The strongest injury evidence in running is about single sessions: a run more than 10 % longer than
  the longest run of the previous 30 days raised injury rates (hazard rate ratio 1.64 for +10–30 %, 2.28 for > +100 %;
  Frandsen et al. 2025, 5,205 runners). This becomes `SAFETY.longRunSpikeMax = 0.10`, measured against the longest
  *actual* run in the last 30 days, with the planned long runs of the draft used for future weeks.
- **Progression.** +1 to +3 km on load weeks (never more than the spike rule allows), long run × 0.7 in recovery weeks,
  hold at the cap for the last 2–3 peak weeks, longest run 3 weeks (M) / 2 weeks (HM) before the race.
- **Race pace in long runs.** Marathon: from ~10 weeks out, blocks of 6–12 km at MP inside the long run, growing to
  14–22 km (Pfitzinger "8–14 mi at MP", Daniels M-pace in L runs), at most 2 of 3 peak long runs with pace; Hansons
  does not (tempo is separate). Half marathon: 4–8 km at HM pace inside the long run in the peak phase, or a
  fast-finish. Race-pace km count as `moderate` intensity and against the per-session cap (M ≤ 20 % of weekly km,
  Daniels). Evidence: convention; the association of longest run and finish time (Doherty 2020) is about length, not
  pace.

---

## 1. Caps

### 1.1 Evidence and practice

| Source | Finding | Use |
|---|---|---|
| Coyle, Coggan, Hemmert, Ivy 1986, *J Appl Physiol* 61(1):165–172 | Trained cyclists at ~71 % VO2max: fatigue after 3.02 ± 0.19 h with placebo, 4.02 h with carbohydrate; glycogen use fastest early | A 2.5–3 h ceiling is where glycogen runs out even in trained athletes; fuelling extends it (Porto rule: 60–90 g CHO/h) |
| Frandsen et al. 2025, *Br J Sports Med* 59(17):1203–1210 | 5,205 Garmin runners, 588,071 sessions: injury hazard rose when a single run exceeded the 30-day longest by > 10 % (HRR 1.64 for 10–30 %, 1.52 for 30–100 %, 2.28 for > 100 %); no relation to the week-to-week ratio | The spike rule |
| Doherty et al. 2020, *J Sci Med Sport* 23(2):182–188 | Longest run (with weekly distance and frequency) associated with faster marathon times | Longer long runs go with faster marathons, as association |
| Rasmussen et al. 2013, *Int J Sports Phys Ther* 8(2):111–120 | < 30 km/week before a marathon: RR 2.0 for injury | Volume floor, not a long-run cap |
| Toresdahl et al. 2023, *Br J Sports Med* 57(3):146–152 | NYC marathoners: days at ACWR ≥ 1.5 associated with injury; the 10 % rule not protective | Sustained spikes matter |
| Daniels 2014 [B] | L ≤ 25 % of weekly mileage (30 % below ~40 mi/wk) and ≤ 150 min; "little point beyond 2 h, occasionally 2.5 h"; 20-mile runs only from 70 mi/wk | share + minutes cap |
| Pfitzinger & Douglas 2019 [B] | Long run up to 20–22 mi, 10–20 % slower than MP; medium-long 11–16 mi midweek | km cap 35, MLR ≤ ~70 % of long |
| Humphrey et al. 2012 [B] | Long run ≤ 16 mi; argued from time on feet (≈ 2.5–3 h for the target audience) and glycogen; the "25–30 % of weekly mileage" phrasing is from secondary sources, not verified | time cap 180 min |
| Lydiard [B] | 2–3 h long runs (Waiatarua ~22 mi); a second long run midweek | time cap 180 |
| Porto 2026 | Longest 41 km (5.9.2026, 33 % of the week), 240 min | our ceiling; `SAFETY.longRunKmMax 42` |

### 1.2 Proposed caps

```text
Template (exists): week.long_run.share (s), max_km, max_minutes
Template (new, G-12): week.long_run.by_phase[phase] = { max_km, max_minutes }, unit: km | minutes
Code constants (defaults when the template has none):
  marathon  share 0.30  max_km 35  max_min 180   half 0.28 / 26 / 130   10k 0.25 / 18 / 100
  phase factors on max_km: base 0.75, build 0.90, peak 1.00, taper (phases-and-taper.md rule 4)
SAFETY (exists): longRunShareMax 0.40, longRunKmMax 42, longRunMinutesMax 240
SAFETY (new):    longRunSpikeMax 0.10        vs. the longest run of the last 30 days (actual, else planned)
                 longRunMinKmForHard 25      (week-layout.md HARD_LONG_KM)

  L_cap(w) = min(s × K_w, max_km × phase_factor, max_minutes × 60 / long_pace_s, profile.maxKmWeekend)
  L_cap(w) = min(L_cap(w), 1.10 × longest30(w))                     // spike rule
  medium_long (if the template has it) ≤ 0.70 × L(w) and ≤ 26 km
```

The minutes cap converts with the template's `long` pace offset (paces.md); for the reference runner's easy pace ~5:45/km, 180 min
≈ 31 km, 150 min ≈ 26 km — so for a 3:05 marathoner the minute cap, not the km cap, binds Daniels' and Lydiard's
templates. That is intended: the books cap by time.

---

## 2. Progression

### 2.1 Evidence

Only Frandsen 2025 speaks to the step size, and it says: relative to what you ran in the last 30 days, not relative to
last week. Books: Pfitzinger raises the long run in ~2-mile steps with a shorter long run after each longer one;
Daniels keeps L near the cap most weeks once reached; Hansons alternates 10/15/16 mi; Porto went 21 → 29 km in base
(16 km in the recovery week), 29 → 41 km in build/peak with recovery-week long runs of ~21 km.

### 2.2 Proposed rule

```text
Inputs: L_cap(w) per week, recovery weeks R, taper T, race distance D
Template (new, G-17): long_run.progression = { step_km (default 2, range 1–3), recovery_share (default 0.70,
                      peak-and-recovery.md), hold_weeks_at_cap (default 2, range 1–3), longest_weeks_before (M 3, HM 2, 10k 2) }

  L(0) = min(L_cap(0), longest30(start))                         // start from what the athlete has run
  for load weeks w in order:
     L(w) = min(L(w−1 load) + step_km, L_cap(w), 1.10 × longest30(w))
     if two increases in a row ≥ 1.5 km: next load week holds (step 0)  — mirrors the 3-rising-weeks idea at session level
  recovery week: L = recovery_share × previous load-week L, and never the week's longest hard day
  taper: phases-and-taper.md rule 4
  longest long run: at least longest_weeks_before weeks before the race; later long runs ≤ 0.85 × longest
  marathon-specific: at most 3 long runs ≥ 32 km in a block; none ≥ 35 km unless the athlete's 12-month longest ≥ 35 km
  warn if L(peak) < D for half/10k, or < 30 km for marathon:   "längster Lauf {L} km – für {D} knapp"
```

**Spike rule and the plan.** `longest30(w)` for future weeks uses the draft's own long runs, so the plan can never
schedule a +11 % jump against itself. Against reality the engine re-checks each week: if the athlete missed or
shortened long runs, the next planned long run is clamped to 1.10 × the real 30-day longest (adaptation.md, trigger
`missed_key` for the long run). Porto's 16 → 29 km after a recovery week was +11.5 % against the 30-day longest (26 km) —
inside Frandsen's smallest-risk band but above the proposed cap; the rule would have given 28.5 km.

---

## 3. Race pace inside long runs

### 3.1 Practice

| Method | Marathon | Half |
|---|---|---|
| Pfitzinger | Long runs with 8–14 mi at MP in LT+endurance and race-prep mesocycles; tune-up races instead in the last 6 weeks | Long runs easy; HM pace via LT runs and tune-ups |
| Daniels | M-pace segments inside L runs from phase III/IV (Q1 = long run with workout) | T-pace segments in L runs |
| Hansons | No; tempo at MP is a separate midweek SOS, long run easy | — |
| Lydiard | No; long runs aerobic at ¼–¾ effort | — |
| Norwegian | Long run easy ~21 km | — |
| Porto 2026 | `long_with_pace` 6 → 12 km at MP in build; 10–15 km MP blocks and a 20 km test in peak; HM at MP as final test | — |

No trial compares long runs with and without race-pace segments. The rationale is specificity (practising MP on tired
legs and fuelling) and it is shared by Pfitzinger, Daniels and Canova; Hansons achieves the same with cumulative fatigue.
**Convention.**

### 3.2 Proposed rule

```text
Template (new, G-17): long_run.race_pace = {
    start_weeks_before: M 10, HM 6, 10k 0 (none),
    block_km: { from, to }         M 6 → 14 (cap: Daniels M ≤ 20 % of weekly km, ≤ 29 km), HM 4 → 8,
    share_of_long_runs: 0.66       at most 2 of 3 long runs in peak carry pace
    position: 'end' | 'middle'     default end (fast finish) for M, middle for HM
}
Rules
  1. Race-pace blocks only in build/peak within start_weeks_before, never in a recovery week, never in the long run
     after a tune-up race week, and never two weeks in a row at the maximum block.
  2. The block counts as quality km: intensity.moderate (M pace) or hard/moderate per describe.ts band; it is
     checked against the per-session cap (G-4) and against week.key_sessions (a long run with pace is a key session).
  3. A long run with pace is a hard day (week-layout.md); the previous day is easy or rest.
  4. The last long run with a full-length block is the Generalprobe (test) at longest_weeks_before − 0/1 weeks
     (Porto: 20 km @ MP 4 weeks out, HM @ MP 2 weeks out).
  5. Taper long runs: pace block ≤ 50 % of the peak block, last one ≥ last_hard_days_before (phases-and-taper.md).
```

---

## 4. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `week.long_run.share` | M 0.30, HM 0.28, 10k 0.25 | ≤ 0.40 | template (exists) | Daniels 25 %, Pfitz 32 %, Hansons 30 %. **Convention** |
| `week.long_run.max_km` | M 35, HM 26, 10k 18 | ≤ 42 | template (exists) | Pfitzinger 20–22 mi; Porto 41 as ceiling. **Convention** |
| `week.long_run.max_minutes` | M 180, HM 130, 10k 100 | ≤ 240 | template (exists) | Coyle 1986 (glycogen ~3 h). **Moderate** for the ceiling, **convention** for the value |
| `week.long_run.by_phase` | base 0.75, build 0.90, peak 1.0 × max | — | template (new, G-12) | Book progressions. **Convention** |
| `SAFETY.longRunSpikeMax` | 0.10 | fixed | safety (new) | Frandsen 2025. **Moderate** (one large cohort, not replicated) |
| `long_run.progression.step_km` | 2 | 1–3 | template (new, G-17) | Pfitzinger 2-mile steps. **Convention** |
| `long_run.progression.hold_weeks_at_cap` | 2 | 1–3 | template (new, G-17) | **Convention** |
| `long_run.progression.longest_weeks_before` | M 3, HM 2 | 2–4 | template (new, G-17) | Books; taper length. **Convention** |
| `long_run.race_pace.*` | see 3.2 | — | template (new, G-17) | Pfitzinger, Daniels. **Convention** |
| medium_long ≤ 0.70 × L, ≤ 26 km | fixed | — | code constant | Pfitzinger MLR 11–16 mi vs 20–22. **Convention** |
| longest30 lookback 30 days | fixed | — | code constant | Frandsen 2025 definition |

**Can the schema express it?** Global caps: yes. Per-phase caps: **G-12**. Progression and race-pace fields: **no** →
**G-17 (new): `week.long_run.progression` and `week.long_run.race_pace`**. The spike rule is safety code and needs the
athlete's actual runs (available via the engine's `runs` input).

---

## 5. German explanation text ("Warum dieser lange Lauf")

```text
Langer Lauf {L} km ({share} % der Woche, ca. {min} min){, davon {block} km im Renntempo}.
Die Grenze kommt aus {„dem Anteil an der Woche“ | „der Zeitgrenze von {max_min} min“ | „deinem längsten Lauf der
letzten 30 Tage ({longest30} km): mehr als 10 % darüber erhöht das Verletzungsrisiko deutlich (Studie mit 5.200
Läufern)“}. Über etwa drei Stunden gehen auch trainierten Läufern die Kohlenhydratspeicher aus; deshalb liegt die
Obergrenze bei {max_min} Minuten, und du übst die Verpflegung ab dem ersten langen Lauf.
```

## 6. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| Single-run spike ≤ +10 % vs 30-day longest | **Moderate** (one large cohort, consistent with Toresdahl 2023) |
| Time ceiling 2.5–3 h | **Moderate** for the physiology (glycogen), **convention** for the exact cap |
| Share ≤ 25–33 % | **Convention** (all books) |
| km caps per distance | **Convention** |
| +1–3 km steps, hold after two increases | **Convention**, bounded by the spike rule |
| Longest run 2–3 weeks out | **Convention** (taper evidence sets the window) |
| Race pace in long runs from ~10 weeks out (M) | **Convention** (Pfitzinger, Daniels); not in Hansons/Lydiard |
| Longer long runs go with faster marathons | **Weak** (association) |

## 7. Suggestions for the plans

1. 07-03: implement 1.2 and 2.2; add `SAFETY.longRunSpikeMax`; compute `longest30` from Garmin runs and the draft.
2. 07-03: race-pace blocks per 3.2 with code defaults until G-17 lands; mark long runs with pace as key sessions.
3. 07-07: the engine clamps the next long run to the spike rule after missed/shortened long runs (adaptation.md).
4. Template follow-up: Hansons and Lydiard set `long_run.race_pace: null`; Pfitzinger and Daniels set their blocks.

## Sources

Peer-reviewed:

- Coyle EF, Coggan AR, Hemmert MK, Ivy JL (1986). Muscle glycogen utilization during prolonged strenuous exercise when fed carbohydrate. *J Appl Physiol* 61(1):165–172.
- Doherty C, Keogh A, Davenport J, Lawlor A, Smyth B, Caulfield B (2020). An evaluation of the training determinants of marathon performance: a meta-analysis with meta-regression. *J Sci Med Sport* 23(2):182–188.
- Frandsen JSB, Hulme A, Parner ET, et al., Nielsen RO (2025). How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study. *Br J Sports Med* 59(17):1203–1210.
- Rasmussen CH, Nielsen RO, Juul MS, Rasmussen S (2013). Weekly running volume and risk of running-related injuries among marathon runners. *Int J Sports Phys Ther* 8(2):111–120.
- Toresdahl BG, Metzl JD, Kinderknecht J, et al. (2023). Training patterns associated with injury in New York City Marathon runners. *Br J Sports Med* 57(3):146–152.

Coaching books (secondary summaries): Daniels 2014; Humphrey, Hanson & Hanson 2012; Lydiard & Gilmour 2000; Pfitzinger &
Douglas 2019.

Not verified: Hansons' "25–30 % of weekly mileage" phrasing for the long run; Daniels' exact wording on 2 h / 2.5 h
(secondary blog); Pfitzinger's step pattern week by week.
