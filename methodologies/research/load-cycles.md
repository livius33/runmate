# Research: how many load weeks in a row

Status: research note for plans 07-02 (`buildSkeleton`, recovery-week placement) and 07-07 (`recovery_week_insertion`).
Extends section 2 of `peak-and-recovery.md`; that note keeps the depth and placement rules, this one answers the
cadence question. Not a methodology template (the loader ignores this folder). Written 2026-10-24.

**Questions**

1. The reference runner asked: "never more than 3 load weeks in a row?" Is that a rule the evidence supports, a sensible default, or
   just one convention among others?
2. What do the books behind our templates actually do (2:1, 3:1, 4:1, longer, none)?
3. How should the last block of load weeks before the taper be treated?
4. Which value is a `SAFETY` outer bound, which is a template default, and what does that mean for each existing template?

**Short answer**

- **"Never more than 3" is a good personal default, not an evidence-based limit.** No study compares 2:1, 3:1 and 4:1
  cycles in runners. The 3:1 rhythm is the most common coaching convention, and it is what the reference runner ran for Porto (recovery
  weeks 4 and 8). The indirect evidence (overreaching studies, monotony) says: concentrated *rising* load for about
  3 weeks produces functional overreaching in roughly half of trained athletes, and those athletes then gain less from
  the taper and fall ill more often. That supports a limit on **consecutive rising weeks**, and only weakly a limit on
  consecutive steady weeks.
- **Books:** Pfitzinger ends each mesocycle (4–6 weeks) with a lighter week or a tune-up race week; Daniels' 2Q varies
  weekly volume between fractions of peak with "little planned recovery"; Hansons and Lydiard plan **no** down weeks and
  rely on hard/easy days. Our templates encode this as every 5 (Pfitzinger), 4 (Daniels), 8 (Hansons, the schema
  minimum) and 6 (Lydiard).
- **Recommendation:** default `recovery_week.every = 4` (3 load + 1 down); `SAFETY.maxLoadWeeksInRow = 5` as the outer
  bound (one stretched block, as `peak-and-recovery.md` proposes); and a second, stricter outer bound on rising weeks:
  **`SAFETY.maxRampWeeksInRow = 3`** (after three consecutive weeks with ≥ +3 % km, the next week must hold or drop).
  The 2–3 weeks right before the taper are load weeks: no down week directly before the taper, because the taper is the
  recovery and the taper works better after load (as long as the athlete is not overreached).
- **Consequences:** `every: e` means e − 1 load weeks in a row. Hansons (`every: 8`, 7 load weeks) breaks the 5-week
  bound and needs either `every ≤ 6` or gap G-9 (`recovery_week: null` with adaptive insertion). Lydiard (`every: 6`,
  5 load weeks) sits exactly on the bound, Pfitzinger (`every: 5`) just inside. The other six templates are well inside.
  If a runner wants "never more than 3" for themselves, that is `every: 4` in "Mein Ansatz"; the safety bound stays at 5 so
  that Pfitzinger and Lydiard remain valid templates.

---

## 1. Evidence

### 1.1 Direct evidence on cadence

None. A targeted search (PubMed, Google Scholar, coaching literature) found no trial or cohort in runners that compares
recovery-week cadences or tests "3 weeks on, 1 off" against an alternative. The deload literature that exists is from
strength training (coach surveys report deloads about every 5–6 weeks lasting about 6 days) and does not transfer.
`peak-and-recovery.md` section 2.1 reached the same conclusion.

### 1.2 Indirect evidence: what happens when load is not unloaded

| Study | Design | Finding | What it means for the cadence |
|---|---|---|---|
| Aubry, Hausswirth, Louis, Coutts, Le Meur 2014, *Med Sci Sports Exerc* 46(9):1769–1777 | 33 trained triathletes; 23 did 3 weeks of intensified training, then a 4-week taper; 10 trained normally | After the 3-week overload 11 of 23 were functionally overreached (F-OR), 12 only acutely fatigued (AF). AF athletes gained the most in the taper; F-OR athletes gained less and had far more infections (70 % vs 20 % AF, 10 % control). Most peaks fell in the first 2 taper weeks | Three weeks of *rising* load is enough to overreach about half of trained athletes. Load before the taper helps only if it stops short of F-OR |
| Le Meur et al. 2013, *Med Sci Sports Exerc* 45(11):2061–2071 | Same group, 3-week overload | Signs of F-OR (performance decline with high fatigue) after 3 weeks of overload | Same message; the window is about 3 weeks |
| Meeusen et al. 2013, *Med Sci Sports Exerc* 45(1):186–205 (ECSS/ACSM consensus) | Consensus statement | Functional overreaching recovers within days to weeks and can improve performance; non-functional overreaching takes weeks to months. Planned recovery is the way to keep overreaching functional | Periodic unloading is the accepted preventive measure, cadence unspecified |
| Foster 1998, *Med Sci Sports Exerc* 30(7):1164–1168 | Speed skaters and runners, load, monotony and strain vs. illness | Illness followed individual thresholds of strain (weekly load × monotony). Monotony falls when hard and easy days and weeks alternate | Variation protects; a down week lowers monotony at the week scale |
| Mølmen, Øfsteng, Rønnestad 2019, *Open Access J Sports Med* 10:145–160 | Meta-analysis of block periodization | Short concentrated blocks followed by lower-load periods gave small advantages for VO2max in trained endurance athletes | Supports alternating concentrated and lighter periods, not a particular ratio |
| Issurin 2010, *Sports Med* 40(3):189–206 | Narrative review of block periodization | Blocks of concentrated load for a few targeted abilities, sequenced with realisation/recovery | Conceptual support. The exact block lengths in the paper were not verified here |
| Kiely 2018, *Sports Med* 48(4):753–764 | Critique of periodization theory | Fixed, pre-set cycles rest on outdated stress theory; plans should respond to the athlete | Pair the fixed cadence with adaptive insertion (`recovery_week_insertion`) |
| Wang, Wang, Gao, Zhong 2023, *PLoS One* 18(5):e0282838 | Meta-analysis, 14 taper studies | Taper after a pre-taper overload improved time-trial performance more than a conventional taper | The weeks before the taper should be load weeks, not a down week |
| Schwellnus et al. 2016, *Br J Sports Med* 50:1043–1052 (IOC consensus on load and illness) | Consensus | Rapid load changes and poor load management raise illness risk | Recovery weeks after rising blocks are part of load management |

**Reading of the evidence**

1. The one quantity with evidence is the length of a *rising* (overload) block: about 3 weeks already overreaches half
   of trained athletes (Aubry 2014). That is moderate evidence for "no more than 3 rising weeks in a row", from one
   research group and a different sport.
2. For *steady* load weeks (holding peak volume without a further rise) there is no comparable evidence. Pfitzinger's
   plans hold 8–9 weeks near peak, broken only by tune-up race weeks and mesocycle-end recovery weeks.
3. A down week directly before the taper wastes load that the taper would turn into performance (Wang 2023, Aubry 2014).

### 1.3 What the books in our templates do

| Method (template) | Planned down weeks | Longest run of load weeks | Our file | Source quality |
|---|---|---|---|---|
| Pfitzinger & Douglas, *Advanced Marathoning* (`pfitzinger-marathon`) | Mileage builds 5–6 weeks, holds 8–9 weeks, tapers 3. Mesocycles end with a lighter/recovery week; two tune-up races in race preparation act as mini tapers | 4–6 weeks (mesocycle length) | `every: 5 @ 0.82` | Book structure as described by secondary summaries; week tables not checked |
| Pfitzinger & Latter, *Faster Road Racing* (`pfitzinger-half`) | Similar; shorter mesocycles | ~4 | `every: 4 @ 0.82` [D] | Not verified line by line |
| Daniels, *Running Formula* 2Q (`daniels-*`) | Weeks are fractions of peak (0.8 / 0.9 / 1.0); "little planned recovery", optional workouts can be skipped | Fractions vary week to week; no explicit down week | `every: 4 @ 0.85` [D] | Secondary blogs; book tables not checked |
| Humphrey, Hanson & Hanson, *Hansons Marathon Method* (`hansons-marathon`) | None. Cumulative fatigue is the method; recovery is the easy days between three SOS sessions | whole plan (≈ 15 weeks) | `every: 8 @ 0.90` (schema minimum, flagged as gap G-9) | Secondary |
| Lydiard (`lydiard-marathon`) | None in the conditioning phase; hard/easy days, then phase changes (hills, anaerobic ≤ 4 weeks) alter the load type | 10–12 weeks of conditioning | `every: 6 @ 0.85` [D/S] | Secondary; Lydiard's own books not checked |
| Fitzgerald, *80/20 Running* (`polarized-80-20-half`) | Regular recovery weeks in the plans | ~2–3 | `every: 3 @ 0.80` [D] | Cadence not verified |
| Norwegian threshold model (`norwegian-threshold-half`) | Elite practice: steady weeks, easy weeks around races; no fixed cadence described (Casado et al. 2023) | n/a | `every: 4 @ 0.85` [D] | Model description, no plan tables |
| Runmate / Porto 2026 (`runmate-porto-2026`) | Weeks 4 and 8 lighter (−25 to −28 %), then 126 km in week 11, illness in KW38 | 3 (weeks 9–11, rising 88 → 105 → 126) | `every: 4 @ 0.72` | Our own plan |
| runmate-webapp (reference repo) | Every 4th week at 70 % | 3 | n/a | Code |

**What this says.** The methods split into two camps. Volume-and-threshold methods (Pfitzinger, Daniels, Porto,
80/20) unload every 3–5 weeks. Fatigue-based methods (Hansons, Lydiard) do not unload by the calendar at all and rely
on the hard/easy day rhythm and on the athlete. Neither camp cites evidence for its choice. The schema currently forces
the second camp into a calendar it does not have (G-9).

---

## 2. Proposed deterministic rules

```text
Definitions (per skeleton week w, km_w planned)
  load week      : not recovery, not taper, not a holiday/illness week
  rising week    : load week with km_w ≥ 1.03 × km_{w−1}           (≥ +3 %)
  steady week    : load week with km_w < 1.03 × km_{w−1}
  down week      : recovery week (km ≤ SAFETY.recoveryVolumeMax × previous load week), tune-up race week,
                   holiday or illness week

Parameters
  template  volume.recovery_week.every (e)          default 4   range 3–5 (null = adaptive only, gap G-9)
  template  volume.recovery_week.volume (rv)        default 0.75 (see peak-and-recovery.md)
  SAFETY    maxLoadWeeksInRow      = 5              consecutive load weeks (rising or steady) outside the taper
  SAFETY    maxRampWeeksInRow      = 3              consecutive rising weeks
  SAFETY    preTaperLoadWeeksMin   = 2              the last 2 weeks before the taper are load weeks

Rules
  1. Place recovery weeks forward from the start at every e-th week (peak-and-recovery.md 2.2, rules 1–4).
  2. Pre-taper: if a placed recovery week falls in the last preTaperLoadWeeksMin weeks before the taper,
     move it one week earlier if that still leaves ≥ 2 load weeks after the previous recovery week,
     otherwise drop it. Never put a down week directly before the taper.
  3. Check A (steady bound): no run of > maxLoadWeeksInRow load weeks. If violated, insert a recovery week
     in the middle of the run (round towards the taper).
  4. Check B (ramp bound): no run of > maxRampWeeksInRow rising weeks. If violated, the week after the
     third rising week is held at km_{w−1} (a steady week), and the climb continues afterwards.
     The peak K is then re-checked against the time available (peak-and-recovery.md 1.3, K_time).
  5. Adaptive insertion (07-07, strategy recovery_week_insertion): a recovery week may be inserted early when
     the fatigue trigger fires for ≥ 5 of the last 7 days (adaptation.md). An inserted recovery week restarts
     the count (rule 4 of peak-and-recovery.md). It is never inserted into the taper or into the last
     preTaperLoadWeeksMin weeks; there the strategy is intensity_reduction instead.
  6. Reporting: the skeleton lists every run of load weeks with its length and whether it is rising or steady,
     so the draft review (07-06) can show "3 Belastungswochen, dann Erholung" per block.
```

**Worked check against Porto 2026.** Weeks 1–3 rising (64 → 80), week 4 down, weeks 5–7 rising (→ 105), week 8
down, weeks 9–11 rising (88 → 105 → 126), weeks 12–13 steady/peak, week 14 down, weeks 15–17 peak, taper. Longest run of
load weeks: 3 (rising). Both bounds hold. The infection in KW38 came in the first steady week after three rising weeks
with net growth above every book plan; one case proves nothing, but it is consistent with Aubry 2014.

**Worked check against the HM 2027 sketch** (peak-and-recovery.md 3.2): weeks 1–3 rising, week 4 down (Christmas),
weeks 5–7 rising, week 8 down, weeks 9–10 peak (steady), taper. Both bounds hold; rule 2 is satisfied (two load weeks
before the taper).

---

## 3. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `volume.recovery_week.every` (e) | 4 | 3–5, or null (G-9) | template (exists) | 3:1 convention; Porto, webapp, Pfitzinger mesocycles. **Convention** |
| `volume.recovery_week.volume` (rv) | 0.75 | 0.60–0.85 | template (exists) | peak-and-recovery.md |
| `SAFETY.maxLoadWeeksInRow` | 5 | fixed | safety (new, proposed in peak-and-recovery.md) | Longest book convention (Pfitzinger mesocycle) + 1. **Convention** |
| `SAFETY.maxRampWeeksInRow` | 3 | fixed | safety (new) | Aubry 2014, Le Meur 2013: 3 weeks of intensified load overreach ~half of trained athletes. **Moderate**, indirect |
| `SAFETY.preTaperLoadWeeksMin` | 2 | fixed | safety (new) | Wang 2023 (pre-taper overload), Aubry 2014. **Moderate** |
| rising-week threshold +3 % | 0.03 | fixed | code constant | Separates a planned climb from rounding noise. Convention |
| adaptive insertion after ≥ 5 of 7 fatigue days | 5/7 | fixed | engine rule (07-07) | Kiely 2018 (adaptivity); threshold is convention |
| "Mein Ansatz" personal rule | e = 4 | — | settings | The reference runner's preference "never more than 3" |

**Can the schema express it?** `every` exists (2–8). The two new safety bounds and the pre-taper rule are code. Gaps:

- **G-9** (exists): `recovery_week: null` for Hansons and Lydiard. With the new bounds, "null" would mean *adaptive
  only*, and Check A would still insert a down week after 5 load weeks. That is a compromise Hansons' authors would not
  sign, but it is the price of a safety bound.
- **G-21 (new): `volume.recovery_week.max_load_weeks`** — a template may set its own bound ≤ `SAFETY.maxLoadWeeksInRow`
  (e.g. 80/20: 3). Without it, a template with `every: 5` cannot express "and never stretch". Optional; defaults to the
  safety value. Also `volume.recovery_week.pattern: fixed | adaptive | both` to say whether the cadence is a plan or only
  a fallback (fixed = Daniels/Porto, adaptive = Hansons/Lydiard, both = default).

---

## 4. Consequences for each template

| Template | Today | Under the proposed bounds | Change needed |
|---|---|---|---|
| `runmate-porto-2026` | every 4 @ 0.72 | 3 load + 1 down; bounds hold | none |
| `daniels-marathon`, `daniels-half` | every 4 @ 0.85 | same rhythm | none; optionally `pattern: both` |
| `pfitzinger-marathon` | every 5 @ 0.82 | 4 load + 1 down; on the steady bound; the ramp bound forces a hold week in a 5-week climb | none, but the generator may insert one steady week per mesocycle |
| `pfitzinger-half` | every 4 @ 0.82 | fine | none |
| `polarized-80-20-half` | every 3 @ 0.80 | fine (2 load + 1 down) | none; could set `max_load_weeks: 3` (G-21) |
| `norwegian-threshold-half` | every 4 @ 0.85 | fine | none |
| `hansons-marathon` | every 8 @ 0.90 | **violates** maxLoadWeeksInRow (7 load weeks in a row) | `every: 6` now (5 load weeks, the weakest value inside the bound); `recovery_week: null` + adaptive once G-9 lands. The body text already says the value is a schema compromise |
| `lydiard-marathon` | every 6 @ 0.85 | 5 load weeks in a row: **on the bound, allowed** | none; the 10–12-week conditioning phase gets a down week every 6th week, which is not Lydiard. G-9 later |

Only Hansons violates the steady bound. The ramp bound (3 rising weeks) touches every template whose climb is longer
than 3 weeks: the generator then inserts a hold week, which is the Daniels step pattern (G-6) by another route.

---

## 5. German explanation text ("Warum jetzt eine leichte Woche")

```text
Leichte Woche ({km} km, {rv×100} % der Vorwoche).
Du hattest {n} Belastungswochen hintereinander{, davon {r} mit steigendem Umfang}. Runmate plant nach
höchstens {e−1} Belastungswochen eine leichte Woche ein{ und hält nach drei steigenden Wochen eine Woche den Umfang}.
Warum? Studien an trainierten Ausdauersportlern zeigen: Nach etwa drei Wochen mit steigender Belastung ist rund die
Hälfte „funktionell übertrainiert“ – sie gewinnt im Taper weniger und wird häufiger krank. Für die genaue Zahl
(3:1 oder 4:1) gibt es keine Studie; 3:1 ist die verbreitete Praxis und das, was du für Porto gelaufen bist.
Vor dem Taper kommt keine leichte Woche mehr: Der Taper ist die Erholung, und er wirkt am besten nach Belastung.
```

---

## 6. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| No more than 3 consecutive rising weeks | **Moderate**, indirect (overreaching studies in triathletes, one group) |
| No more than 5 consecutive load weeks | **Convention** (books), set as an outer bound |
| Default 3:1 | **Convention** |
| Load weeks, not a down week, right before the taper | **Moderate** (taper meta-analysis, overreaching study) |
| Adaptive insertion when fatigue persists | **Weak** (periodization critique; thresholds are convention) |
| Hansons/Lydiard "no down weeks" being safe | **No evidence either way**; the bound is a precaution |

## 7. Suggestions for the plans

1. 07-02: add `SAFETY.maxLoadWeeksInRow = 5`, `maxRampWeeksInRow = 3`, `preTaperLoadWeeksMin = 2`; implement rules 2–4
   and the run report (rule 6). Change `hansons-marathon` to `every: 5` in 07-04's follow-up or when G-9 lands.
2. 07-05: the parameter editor shows `every` with the hint "3 = jede dritte Woche leicht (2 Belastungswochen)".
3. 07-07: `recovery_week_insertion` follows rule 5 and respects `preTaperLoadWeeksMin`.
4. Schema: G-21 (`max_load_weeks`, `pattern`) and G-9 (`null`).

## Sources

Peer-reviewed:

- Aubry A, Hausswirth C, Louis J, Coutts AJ, Le Meur Y (2014). Functional overreaching: the key to peak performance during the taper? *Med Sci Sports Exerc* 46(9):1769–1777.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. *Med Sci Sports Exerc* 30(7):1164–1168.
- Issurin VB (2010). New horizons for the methodology and physiology of training periodization. *Sports Med* 40(3):189–206.
- Kiely J (2018). Periodization theory: confronting an inconvenient truth. *Sports Med* 48(4):753–764.
- Le Meur Y, Hausswirth C, Natta F, et al. (2013). A multidisciplinary approach to overreaching detection in endurance trained athletes. *J Appl Physiol* 114(3):411–420. (Cited from the Aubry 2014 group's work; volume/pages as indexed, abstract-level.)
- Meeusen R, Duclos M, Foster C, et al. (2013). Prevention, diagnosis, and treatment of the overtraining syndrome: joint consensus statement of the ECSS and ACSM. *Med Sci Sports Exerc* 45(1):186–205.
- Mølmen KS, Øfsteng SJ, Rønnestad BR (2019). Block periodization of endurance training – a systematic review and meta-analysis. *Open Access J Sports Med* 10:145–160.
- Schwellnus M, Soligard T, Alonso JM, et al. (2016). How much is too much? (Part 2) International Olympic Committee consensus statement on load in sport and risk of illness. *Br J Sports Med* 50(17):1043–1052.
- Wang Z, Wang YT, Gao W, Zhong Y (2023). Effects of tapering on performance in endurance athletes: a systematic review and meta-analysis. *PLoS One* 18(5):e0282838.

Coaching books (structures as described in secondary summaries; week tables not checked):

- Daniels J (2014). *Daniels' Running Formula*, 3rd ed. Human Kinetics.
- Humphrey L, Hanson K, Hanson K (2012). *Hansons Marathon Method*. VeloPress.
- Lydiard A, Gilmour G (2000). *Running with Lydiard*. Meyer & Meyer.
- Pfitzinger P, Douglas S (2019). *Advanced Marathoning*, 3rd ed. Human Kinetics.
- Pfitzinger P, Latter P (2015). *Faster Road Racing*. Human Kinetics.

Not verified: Issurin's block lengths in weeks; the exact overload percentage in Aubry 2014 (the abstract says
"overload training", the figure is not quoted here); Le Meur 2013 volume/pages were taken from the index, not the paper.
