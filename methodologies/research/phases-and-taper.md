# Research: phase split, minimum build length and taper

Status: research note for plan 07-02 (`buildSkeleton`: phases, taper weeks) and 07-06 (draft review warnings). Not a
methodology template. Written 2026-10-24.

**Questions**

1. How should the weeks between plan start and the taper be split into base, build and peak, and how short may a plan be
   per distance?
2. When a plan is shorter than the template's ideal, what is cut first?
3. How long, how deep and how intense should the taper be for 10 km, half marathon and marathon, and how is race week
   laid out?

**Short answer**

- **Phase split.** Every method sequences general → specific, but the lengths differ (Daniels 4 × 6 weeks; Pfitzinger
  ~6/5/4 + 3; Lydiard 10–12 base, 4 hills, ≤ 4 anaerobic, 2–4 sharpening; Hansons ~5/5/7 + taper). The split is a
  template field (`phases.split`, exists) and stays convention. What the generator needs on top: **minimum phase lengths
  per distance** and a **shortening order** (gap G-7).
- **Minimum build.** Marathon 12 weeks before the taper is the shortest serious book plan (Pfitzinger 12-week); half
  marathon 8; 10 km 6. Below that the generator still builds the plan but warns. A hard floor is "taper + 3 weeks".
- **Shortening.** Keep the taper, keep a race-specific peak of at least 3 (M) / 2 (HM) weeks, keep ≥ 2 base weeks when
  the athlete comes from a recovery block (≥ 1 when coming from a base block), cut build first. Lydiard-type templates
  may say "cut peak before base" (template field).
- **Taper.** Strong evidence (meta-analyses) for ≈ 2 weeks, volume −41 to −60 %, intensity and frequency kept.
  Marathon: 3 weeks with a gentle first week works best in the one large observational study (Smyth & Lawlor 2021,
  2.6 % faster with a strict 3-week taper). Elite marathoners taper a median of 14 days to ≈ 53 % of their continuous
  running volume (Spilsbury 2015). Defaults: marathon 3 weeks [0.80, 0.60, 0.40], half 2 weeks [0.80, 0.55],
  10 km 1–2 weeks [0.70]. Keep the number of runs (−0 to −1), keep ≥ 1 quality session per taper week but at 50–60 % of
  its usual quality km, last hard session 5–7 days (HM) / 7–10 days (M) before the race.
- **Race week** is built backwards from the race (07-02 AC-3 pattern): −1 shakeout, −2 rest, −3 short race-pace
  reminder. Convention, consistent with "keep intensity, cut volume".

---

## 1. Phase split

### 1.1 What the methods do

| Method | Sequence and lengths | Source quality |
|---|---|---|
| Daniels | 24-week ideal: I foundation (E runs, strides) · II early quality (R) · III transition (I, hardest) · IV final quality (T, M, race-specific), 6 weeks each. Shorter season: keep I and IV, shorten II/III | Book structure [B], secondary checks |
| Pfitzinger (marathon) | 18 weeks: endurance ~6 · LT + endurance ~5 · race preparation ~4 · taper 3. Mileage builds 5–6 weeks, holds 8–9, tapers. 12-week variant exists; which mesocycle it compresses was not verified | [B], secondary |
| Hansons | 18 weeks: easy intro ~5 · speed ~5 · strength ~6–7 (tempo at MP throughout from week ~6) · taper ~10 days | [B], secondary |
| Lydiard | Conditioning ≥ 10–12 weeks · hills 4 (sources: 4–6) · anaerobic ≤ 4 ("more was counter-productive") · coordination/sharpening 2–6 · freshening | [B], secondary summaries disagree on lengths |
| Norwegian threshold model | No formal phases; threshold volume all year, race-specific VO2/hill work near races; taper 7–10 days (Haugen 2022) | [P] model description |
| 80/20 (Fitzgerald) | Base → build → peak, polarized throughout, more race-specific towards the race | [B], not verified line by line |
| runmate-webapp (reference) | PHASE_DISTRIBUTION 25/40/35 | code |
| Porto 2026 | 5 base / 8 build / 4 peak / 3 taper (0.29 / 0.47 / 0.24) | our plan |

**Physiological reason for the order (general → specific):** aerobic capacity and running economy adapt over many
weeks; VO2max and anaerobic adaptations respond faster and also fade faster (Mujika & Padilla 2000 on detraining: VO2max
and blood volume drop within weeks of insufficient training). So the fast-adapting, race-specific work goes last. This
is physiology by analogy, not a trial of phase orders; no study compares phase splits in runners.

### 1.2 Minimum lengths (convention)

| Distance | Comfortable | Minimum before warning | Hard floor | Basis |
|---|---|---|---|---|
| Marathon | 16–18 weeks | 12 | taper + 3 | Pfitzinger 12/18, Daniels 18, Hansons 18 |
| Half marathon | 10–12 | 8 | taper + 3 | Pfitzinger half ~12, Daniels, 80/20 |
| 10 km | 8 | 6 | taper + 3 | Daniels, 80/20 (not verified) |

Rasmussen et al. 2013 (*Int J Sports Phys Ther* 8(2):111–120) supports a *volume* floor for marathons (< 30 km/week
doubles injury risk) but says nothing about weeks. The minimum weeks are convention.

### 1.3 Proposed rule: phases from the weeks available

```text
Inputs
  W      weeks from plan start (Monday) to race week inclusive
  T      taper weeks = phases.taper.weeks[distance]
  N      = W − T                             non-taper weeks
  split  = phases.split (base/build/peak shares)
  from   = 'recovery' | 'base_block' | 'cold'    what the athlete comes from (06-01 recovery block, 07-08 base block, nothing)

Template (new, gap G-7)
  phases.min_weeks[distance] = { base, build, peak }      defaults below
  phases.shorten_order        = ['build', 'base', 'peak']  default; Lydiard-type: ['peak', 'build', 'base']

Defaults for min_weeks
  marathon { base 2, build 3, peak 3 }   half { base 2, build 2, peak 2 }   10k { base 1, build 2, peak 2 }
  if from == 'base_block': base.min = max(1, base.min − 1)   (the base block was the base)

Algorithm
  1. raw_i = N × split_i, round to whole weeks so that Σ = N (largest remainder)
  2. for phase p in reverse(shorten_order):           // the most protected phase first
       if raw_p < min_p: take (min_p − raw_p) weeks from the first phase in shorten_order that is above its min
  3. if N < Σ min_weeks: the plan is "zu kurz": phases are set to their minimums in protection order until N is
     used up (peak first for default order), remaining phases get 0 weeks; the draft carries a warning
  4. hard floor: N ≥ 3, else refuse to generate ("Mindestens {T+3} Wochen bis zum Rennen")
  5. warnings (never change the plan):
       N + T < min_total[distance] (12 / 8 / 6)           → "kurzer Aufbau für {Distanz}"
       any phase at its minimum                            → "Phase {p} auf Minimum gekürzt"
```

### 1.4 Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `phases.split` | per template | shares, Σ 1 | template (exists) | Book structures. **Convention** |
| `phases.min_weeks[distance]` | M 2/3/3, HM 2/2/2, 10k 1/2/2 | ≥ 0 | template (new, G-7) | Daniels "keep I and IV", Pfitzinger race-prep ~4. **Convention** |
| `phases.shorten_order` | [build, base, peak] | permutation | template (new, G-7) | Daniels; Lydiard inverse. **Convention** |
| `min_total[distance]` (warning) | 12 / 8 / 6 | fixed | code constant | Shortest book plans. **Convention** |
| hard floor taper + 3 | fixed | — | safety | 07-02 draft; keeps a race-specific block possible |

---

## 2. Taper

### 2.1 Evidence

| Study | Design | Finding | For the generator |
|---|---|---|---|
| Bosquet, Montpetit, Arvisais, Mujika 2007, *Med Sci Sports Exerc* 39(8):1358–1365 | Meta-analysis, 27 studies, endurance athletes | Best performance effect with a ~2-week taper, volume reduced 41–60 %, intensity and frequency maintained; performance gain ≈ 3 % | The default shape for every distance |
| Wang, Wang, Gao, Zhong 2023, *PLoS One* 18(5):e0282838 | Meta-analysis, 14 studies | Time-trial and time-to-exhaustion improve; VO2max and economy do not change. Volume −41–60 %, intensity and frequency unchanged, ≤ 21 days, progressive or step. Pre-taper overload adds to the effect | Up to 3 weeks is fine when the volume reduction is progressive |
| Mujika & Padilla 2003, *Med Sci Sports Exerc* 35(7):1182–1187 | Review | Same principles: cut volume, keep intensity, keep frequency | — |
| Smyth & Lawlor 2021, *Front Sports Act Living* 3:735220 | 158,117 recreational marathoners (Strava, 2014–2017) | Strict (disciplined) 3-week tapers were associated with the largest finish-time benefit: median 5 min 32 s (2.6 %) vs. a minimal taper. 64 % of runners taper less strictly | For the marathon, 3 weeks with a disciplined week 1 beats 2 weeks. Observational |
| Spilsbury, Fudge, Ingham, Faulkner, Nevill 2015, *Eur J Sport Sci* 15(5):367–373 | Survey of elite British endurance runners | Taper length median 6 days (middle/long distance) and 14 days (marathon). Continuous running volume ≈ 70 % (MD/LD) and ≈ 53 % (marathon). Interval volume reduced, peak interval intensity above race speed for LD and marathon | Elite marathoners: 2 weeks, about half the volume; intervals shorter but fast |
| Haugen, Sandbakk, Seiler, Tønnessen 2022, *Sports Med Open* 8:18 | Review of world-class practice | Taper starts 7–10 days before the main competition; ≥ 80 % low intensity all year | Elite tapers are short; recreational data (Smyth) favour longer |
| Aubry et al. 2014, *Med Sci Sports Exerc* 46(9):1769–1777 | 3-week overload + 4-week taper in triathletes | Most peaks in the first 2 taper weeks; overreached athletes gained less | A taper longer than 2–3 weeks has no upside; do not enter it overreached |
| Spilsbury et al. 2019 and 2021, *Appl Physiol Nutr Metab* | Experimental taper studies in sub-elite runners | A race-pace final interval session in the taper was recommended; large volume reduction with a higher-intensity final session improved 1,500 m performance | Keep a short, fast session in the final week. Abstract-level, middle distance |

### 2.2 What the books do

| Method | Marathon taper | Half-marathon taper | In our files |
|---|---|---|---|
| Pfitzinger | 3 weeks, roughly −20–25 %, −40 %, −60 % (2nd ed.) | 2 weeks [D] | [0.78, 0.60, 0.40]; half [0.80, 0.55] |
| Daniels | 3 weeks, no single rule across plans; 2Q taper described as "short, not very aggressive" | 2 weeks [D] | [0.80, 0.70, 0.45]; half [0.80, 0.55] |
| Hansons | ≈ 10 days, last SOS ~10 days out, mileage only slightly reduced before | — | [0.85, 0.45] |
| Lydiard | "Freshening" 1–2 weeks | — | [0.75, 0.45] |
| Norwegian / Haugen | 7–10 days | same | [0.90, 0.60] |
| 80/20 | 2 weeks | 2 weeks | [0.75, 0.50] |
| Porto 2026 | 3 weeks [0.70, 0.56, 0.24] (race week without the race) | — | as run |

### 2.3 Proposed taper rules

```text
Template (exists)
  phases.taper.weeks[distance]      M 3 (range 2–4), HM 2 (1–3), 10k 1–2
  phases.taper.volume[]             share of peak per taper week; last = race week (without the race)
  week.key_sessions.taper           ≥ 1 recommended
Template (new)
  phases.taper.quality_share        quality km per session in the taper vs. the last peak week      default 0.55 (0.4–0.7)
  phases.taper.last_hard_days_before[distance]   M 8, HM 6, 10k 5                                   (range 4–10)
  phases.taper.runs_delta           change in runs/week during the taper                              default 0 (0 … −1)   (gap G-14)

Defaults when a template gives none
  marathon [0.80, 0.60, 0.40]   half [0.80, 0.55]   10k [0.70]   (Bosquet 2007: −41–60 % overall; Pfitzinger shape)

SAFETY (exists)   taperVolumeMax 1.0 (no taper week above peak); taper weeks never gain km (engine rule)
SAFETY (new)      taperRaceWeekMax 0.60   race week (without the race) ≤ 60 % of peak
                  taperMeanMax     0.85   mean of taper-week shares ≤ 0.85 (a "taper" that cuts < 15 % is not one)

Rules
  1. Volume per taper week = share × peak K (peak-and-recovery.md), rounded to 0.5 km.
  2. Frequency: runs_taper = week.runs + runs_delta, never below 3 and never below key_sessions.taper + 1.
  3. Intensity: key_sessions.taper sessions per week, each with quality km = quality_share × the corresponding
     peak-phase session; pace unchanged (race pace / threshold), never faster than planned race pace +0.
     The last hard session is ≥ last_hard_days_before days before the race; later only short race-pace reminders
     (≤ 3 km total at race pace) and strides.
  4. Long run: taper week 1 ≤ 0.75 × last peak long run, week 2 ≤ 0.55, race week none (HM: ≤ 12 km easy Mon–Tue).
  5. Race week (built backwards, 07-02 AC-3): race day · −1 shakeout 3 km · −2 rest · −3 race-pace reminder
     (HM: 3 km easy + 2 × 2 km @ RP + 2 km easy; M: 3 + 3 × 2 km @ MP + 2) · earlier days easy 5–8 km.
     Days after the race in that week: rest or ≤ 6 km recovery.
  6. No recovery week directly before the taper (load-cycles.md rule 2).
  7. Checks: each taper week ≤ previous; race week ≤ taperRaceWeekMax × K; mean share ≤ taperMeanMax.
```

**German text ("Warum so tapern")**

```text
Taper {T} Wochen: {shares as %} der Spitzenwoche.
Weniger Kilometer, gleiche Tempi, fast gleich viele Läufe: So fassen zwei Meta-Analysen die Studien zusammen
(Umfang −40 bis −60 %, Intensität und Häufigkeit halten, etwa zwei Wochen). Für den Marathon zeigen die Strava-Daten
von 158.000 Läufern, dass ein konsequenter 3-Wochen-Taper etwa 2,6 % Zeit bringt. Die letzte harte Einheit liegt
{d} Tage vor dem Rennen; danach nur kurze Renntempo-Erinnerungen.
```

### 2.4 Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `phases.taper.weeks` | M 3, HM 2, 10k 1 | M 2–4, HM 1–3, 10k 1–2 | template (exists) | Smyth & Lawlor 2021 (M 3 weeks), Bosquet 2007 (~2 weeks), Spilsbury 2015 (elite M 14 d). **Strong** for ~2 weeks, **moderate** for 3 (M, observational) |
| `phases.taper.volume` | M [0.80, 0.60, 0.40], HM [0.80, 0.55], 10k [0.70] | each ≤ 1, non-increasing | template (exists) | Bosquet 2007 −41–60 %; Pfitzinger shape. **Strong** (depth), **convention** (shape) |
| `phases.taper.quality_share` | 0.55 | 0.4–0.7 | template (new, G-14) | Spilsbury 2015: interval volume reduced, intensity kept. **Moderate** |
| `phases.taper.last_hard_days_before` | M 8, HM 6, 10k 5 | 4–10 | template (new, G-14) | Hansons last SOS ~10 d; Spilsbury 2019/2021 final fast session. **Convention** |
| `phases.taper.runs_delta` | 0 | 0 … −1 | template (new, G-14) | Bosquet/Mujika: keep frequency. **Strong** |
| `SAFETY.taperRaceWeekMax` | 0.60 | fixed | safety (new) | Outer bound below every book's race week. **Convention** |
| `SAFETY.taperMeanMax` | 0.85 | fixed | safety (new) | A taper must taper. **Convention** |
| race-week pattern | fixed | — | code constant | 07-02 AC-3; Porto practice. **Convention** |

**Can the schema express it?** Weeks and volume: yes (`phases.taper`, G-13 for per-distance volume lists).
Quality share, last hard day, frequency change: **no** → **G-14 (new): `phases.taper.{quality_share,
last_hard_days_before, runs_delta}`**. Per-phase runs more generally (recovery weeks, taper) would be
`week.runs_by_phase`, also under G-14.

---

## 3. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| General → specific phase order | **Convention**, consistent with detraining physiology |
| Minimum build 12 / 8 / 6 weeks (warning) | **Convention** (shortest book plans) |
| Shortening order, protect peak and taper | **Convention** (Daniels, Lydiard disagree on base vs. peak → template field) |
| Taper ≈ 2 weeks, volume −41–60 %, keep intensity and frequency | **Strong** (two meta-analyses) |
| Marathon taper 3 weeks, disciplined week 1 | **Moderate** (one very large observational study) |
| Race week pattern | **Convention** |
| Last hard session 5–10 days out | **Weak–convention** (elite practice, middle-distance taper experiments) |

## 4. Suggestions for the plans

1. 07-02: implement 1.3 (min weeks, shortening order, warnings) and 2.3 rules 1, 6, 7; add the two safety bounds.
2. 07-03: rules 2–5 (taper sessions, race week) use `quality_share` and `last_hard_days_before` with the defaults
   above until G-14 lands.
3. 07-04 follow-up: check each template's `taper.volume` against `taperMeanMax` (all current files pass; Norwegian
   [0.90, 0.60] has mean 0.75).
4. 07-06: the draft review shows the taper shape and the warnings from 1.3 step 5.

## Sources

Peer-reviewed:

- Aubry A, Hausswirth C, Louis J, Coutts AJ, Le Meur Y (2014). Functional overreaching: the key to peak performance during the taper? *Med Sci Sports Exerc* 46(9):1769–1777.
- Bosquet L, Montpetit J, Arvisais D, Mujika I (2007). Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8):1358–1365.
- Haugen T, Sandbakk Ø, Seiler S, Tønnessen E (2022). The training characteristics of world-class distance runners: an integration of scientific literature and results-proven practice. *Sports Med Open* 8:18.
- Mujika I, Padilla S (2000). Detraining: loss of training-induced physiological and performance adaptations. Part I: short term insufficient training stimulus. *Sports Med* 30(2):79–87.
- Mujika I, Padilla S (2003). Scientific bases for precompetition tapering strategies. *Med Sci Sports Exerc* 35(7):1182–1187.
- Rasmussen CH, Nielsen RO, Juul MS, Rasmussen S (2013). Weekly running volume and risk of running-related injuries among marathon runners. *Int J Sports Phys Ther* 8(2):111–120.
- Smyth B, Lawlor A (2021). Longer disciplined tapers improve marathon performance for recreational runners. *Front Sports Act Living* 3:735220.
- Spilsbury KL, Fudge BW, Ingham SA, Faulkner SH, Nevill ME (2015). Tapering strategies in elite British endurance runners. *Eur J Sport Sci* 15(5):367–373.
- Spilsbury KL, et al. (2019, 2021). Taper studies in sub-elite runners, *Appl Physiol Nutr Metab* (abstract-level; exact titles and volumes not verified here).
- Wang Z, Wang YT, Gao W, Zhong Y (2023). Effects of tapering on performance in endurance athletes: a systematic review and meta-analysis. *PLoS One* 18(5):e0282838.

Coaching books (structures from secondary summaries): Daniels 2014; Humphrey, Hanson & Hanson 2012; Lydiard & Gilmour
2000; Pfitzinger & Douglas 2019 (3rd) and 2009 (2nd); Pfitzinger & Latter 2015; Fitzgerald 2014 *80/20 Running*.

Not verified: which mesocycle Pfitzinger's 12-week plans compress; Hansons' exact taper percentages; Fitzgerald's
taper and phase lengths; the Daniels 2Q taper percentages (our file's values are reasoned defaults, marked [D] in
RESEARCH.md).
