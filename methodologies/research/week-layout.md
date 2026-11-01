# Research: week layout — runs, key-session spacing, long-run day, rest days, doubles, strength

Status: research note for plan 07-03 (engine step 3, `buildDays`) and 08-02 (kettlebell days in the plan). Not a
methodology template. Written 2026-10-24.

**Questions**

1. How many runs per week by level and volume, and how does the athlete profile (available days, max km per day)
   constrain that?
2. How far apart do key sessions go (hard/easy rhythm), and how many hard days may a week hold?
3. Where do the long run and the rest day go? When are doubles allowed?
4. Where do kettlebell/strength sessions go relative to key sessions and the long run?

**Short answer**

- **Runs per week** is a template value (`week.runs`, exists) capped by the profile's available days. Books use 6 (Pfitz,
  Hansons, Daniels, Porto) to 7 (Lydiard); world-class runners do 11–14 sessions with doubles (Haugen 2022). Run
  frequency is associated with faster marathons (Doherty 2020), but that is association. Rule: `runs = min(template,
  availableDays)`; if a run's km would exceed the profile's day cap, add a run (if a day is free) or lower the week.
- **Spacing.** One easy or rest day between hard days is the near-universal convention ("hard/easy", 48 h). Pfitzinger
  allows two key days back to back (LT Tuesday, medium-long Wednesday) followed by a recovery day. No trial tests
  spacing in runners; the 48 h figure comes from recovery kinetics after hard sessions and from practice. Max hard days
  per week = `key_sessions[phase]` + long run when the long run is hard (> 25 km or with race pace).
- **Long-run day** is the profile's `longRunDay` (the reference runner: Saturday; Porto rule: Friday or Saturday, never Sunday).
  **Rest day** is the profile's `restDay` (the reference runner: Friday), Sunday is a recovery run. A key session is never the day
  before the long run unless the template allows `key_gap_days: 1`.
- **Doubles** only when `runs > availableDays` or weekly km / runs would exceed the day cap, and only easy second runs
  (≤ 8 km) in build/peak. No controlled evidence; elite practice only (gap G-2).
- **Strength (kettlebell)** 2 × per week on key-session days after the run or ≥ 3 h apart, never the day before the long
  run or a key session with heavy legs, reduced to one light session in the taper and none in race week. Strength
  training improves running economy 2–8 % (Blagrove 2018); interference with endurance is small and matters mostly for
  strength gains in trained lifters when sessions are < 20 min–2 h apart (Petré 2021, Schumann 2022).

---

## 1. Runs per week

### 1.1 Evidence and practice

| Source | Finding | Use |
|---|---|---|
| Doherty et al. 2020, *J Sci Med Sport* 23(2):182–188 (meta-analysis, 85 studies) | Weekly distance, run frequency and longest run each associated with faster marathon times | Frequency matters, but as an association with volume |
| Haugen et al. 2022, *Sports Med Open* 8:18 | World-class marathoners and track runners: 11–14 sessions/week, 160–220 km (M) | Doubles are how elites fit the volume, not a goal in itself |
| Videbæk et al. 2015, *Sports Med* 45(7):1017–1026; Kluitenberg et al. 2015, *Sports Med* 45(8):1143–1161 | Novices are injured ~2 × more per hour than recreational runners | Novices: fewer runs (3–4), more rest days |
| Pfitzinger & Douglas 2019 | 6 runs (≤ 55 mi tier) to 7 with doubles (85+ mi) | tier-dependent |
| Daniels 2014 | 2Q: two quality days plus E days to reach the week's mileage; 5–7 runs | — |
| Hansons 2012 | 6 running days, 1 rest day, 3 SOS | — |
| Lydiard | Daily running, 7 days | — |
| Porto 2026 | 6 runs, Friday rest, Sunday recovery | our plan |

No study assigns runners to 4 vs. 6 runs per week at equal volume; the choice is convention plus the day cap.

### 1.2 Proposed rule

```text
Inputs: template week.runs (r_t), week.key_sessions[phase] (q), profile.availableDays (A), profile.maxKmWeekday /
        maxKmWeekend, week km K_w, long run L_w (long-run.md), experience

  runs = min(r_t, |A|)
  if experience == 'novice': runs = min(runs, 4)
  if runs < q + 1: q = runs − 1                          // at least one easy day per week
  // fit check: easy km per run after long run and quality
  easy_km = K_w − L_w − Σ quality session km
  easy_runs = runs − 1 − q
  if easy_runs > 0 and easy_km / easy_runs < MIN_RUN_KM (5): runs −= 1 (drop a recovery run) and repeat
  if any planned run > profile day cap for that weekday:
      if a free available day exists: runs += 1 (split the excess into an easy run there)
      else: lower the week's km to what the caps allow and warn "Tageslimit begrenzt die Woche"
  doubles: only if runs > |A| would be needed to respect caps AND template allows (G-2); second run easy ≤ 8 km,
           not on the long-run day, not on the rest day
```

---

## 2. Key-session spacing and hard days

### 2.1 Evidence

- **Recovery kinetics.** Muscle function and soreness after a hard running session take roughly 24–72 h to normalise; the
  hard/easy principle (one easy day between hard days) is the practical form of that. Reviews of recovery (e.g. Borges et
  al. 2016 on masters athletes, *J Aging Phys Act* 24(1):149–157) note the evidence on recovery time courses is limited.
  No trial compares key-session spacing in runners. **Convention with physiological plausibility.**
- **Monotony.** Foster 1998 (*Med Sci Sports Exerc* 30(7):1164–1168): illness followed high strain = load × monotony;
  alternating hard and easy days lowers monotony. Indirect support for the hard/easy rhythm.
- **Books.** Hansons: SOS days Tue/Thu/Sun with easy days between (48 h). Daniels 2Q: Q1 and Q2 separated by ≥ 2 E
  days. Pfitzinger: LT Tuesday + medium-long Wednesday (two demanding days), recovery Thursday; long Sunday after a
  general aerobic Saturday. Porto rule: "Zwei harte Tage maximal, nie hintereinander." Lydiard: hard/easy daily.
- **Engine today.** `KEY_GAP_DAYS = 2` (no other key within ±2 days of a moved session), "never two hard days in a
  row" in `findTarget`, `ruleWarnings` checks ≤ 2 hard days and a rest day (07-02 AC-1).

### 2.2 Proposed rule

```text
Template: week.key_gap_days (g, exists: 1–4), week.key_sessions[phase] (q)
Profile:  qualityDays (preferred), longRunDay, restDay, availableDays
Constants (code): HARD_LONG_KM 25 (a long run ≥ 25 km or with a race-pace block counts as hard)
                  MAX_HARD_DAYS = q + 1 (long run) per week, never > 4

  1. Place the long run on profile.longRunDay (fallback: Saturday, never Sunday for the reference runner's profile; template may
     override via G-11 layout).
  2. Place the rest day on profile.restDay (fallback: the day before the long run if g ≥ 2, else Monday).
  3. Place q key sessions on profile.qualityDays in order; each must satisfy:
       - distance to any other hard day (key or hard long run) ≥ g days; with g = 1 the day after must be
         rest/recovery (Pfitzinger pattern)
       - not the day before the long run when g ≥ 2
       - not the day after the long run (always; the long run is the week's biggest stimulus)
     If a preferred day fails, take the next available day that satisfies the rules; if none, drop the last key
     session and warn "nur {q−1} Schlüsseleinheiten passen in die Woche".
  4. Remaining available days: easy runs; the day after a key session and the day after the long run are
     recovery runs (shortest) when runs allow.
  5. Validation = ruleWarnings(): ≤ MAX_HARD_DAYS, no two hard days in a row unless g = 1, a rest day exists,
     long run not on Sunday (Porto rule; profile-driven in general).
```

For the reference runner's profile (Tue quality, Thu easy + strides, Fri rest, Sat long, Sun recovery) this reproduces the Porto
pattern; with `key_sessions.build = 2` the second key session goes to Thursday only if g ≤ 2 and the long run is not
hard; otherwise it becomes a Saturday long run with a pace block (`long_with_pace`), which is what Porto did.

---

## 3. Doubles

- Evidence: none controlled. Elite practice (Haugen 2022: 11–14 sessions; Casado et al. 2023 *IJERPH* 20:3782:
  Norwegian doubles on threshold days). For a 6-day, 60–100 km athlete, doubles are not needed.
- Rule: see 1.2. Second run easy, ≤ 8 km, ≥ 6 h after the first. Not in taper race week. Template permission and
  `session: am | pm` are gap G-2.

---

## 4. Strength / kettlebell placement

### 4.1 Evidence

| Study | Finding | Use |
|---|---|---|
| Blagrove, Howatson, Hayes 2018, *Sports Med* 48(5):1117–1149 (systematic review, 24 studies) | Strength training (2–3 × /week, 6–14 weeks) improved running economy by 2–8 % and time-trial performance; VO2max, lactate parameters and body composition unchanged | 2 strength sessions/week are worth keeping in the plan |
| Llanos-Lagos et al. 2024, *Sports Med* (meta-analysis) | Strength training methods improve middle/long-distance performance (not read in full here) | supports the above |
| Petré et al. 2021, *Sports Med* 51:991–1010 | Concurrent training reduced lower-body 1RM gains in *trained* lifters only, and only when sessions were < 20 min apart; no effect when > 2 h apart | Separate strength from the run by ≥ 2–3 h if strength gains matter; for runners the endurance side is unaffected |
| Schumann et al. 2022, *Sports Med* (meta-analysis, 43 RCTs) | No meaningful loss of maximal strength or hypertrophy with concurrent training; explosive strength slightly reduced, mainly when both were in the same session | Same-session is acceptable; separate when possible |

No study tests kettlebell training specifically in runners; kettlebell swings/goblet squats are treated as general
lower-body strength here.

### 4.2 Proposed rule (code constant, reads profile.kbDays; Phase 8 decision: kettlebell lives in the profile)

```text
Profile: kbDays (default Tue + Thu, Sat optional), RPE 5–8 per session (08-01)
Rules
  1. Strength goes on key-session days (hard day hard) or on easy days, never on the rest day.
  2. Same day as a run: after the run, or ≥ 3 h apart; never before a key session.
  3. Not on the day before the long run, and not on the day before a key session when the strength RPE ≥ 7.
  4. Not within 48 h before a test, tune-up race or the race.
  5. Taper: one light session (RPE ≤ 5) per taper week until the last 7 days; none in race week.
  6. Recovery weeks: at most one session.
  7. Load model (08-01): sRPE = minutes × RPE scaled into TRIMP for TSB; ACWR stays km-based.
If profile.kbDays conflict with rules 3–4, the generator moves the strength session to the nearest allowed day and
reports it.
```

---

## 5. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| `week.runs` | 6 | 2–14 | template (exists) | Books 6–7. **Convention** |
| `week.key_sessions[phase]` | per template | 0–4 | template (exists) | Books 2–3. **Convention** |
| `week.key_gap_days` | 2 | 1–4 | template (exists) | Hard/easy convention; Pfitzinger 1. **Convention** |
| `MIN_RUN_KM` | 5 | fixed | code constant (07-02) | — |
| `HARD_LONG_KM` | 25 | fixed | code constant | A long run ≥ 25 km is a hard day (Porto practice). **Convention** |
| `MAX_HARD_DAYS` | q + 1, ≤ 4 | fixed | safety rule | Porto rule "max zwei harte Tage" generalised. **Convention** |
| novice runs ≤ 4 | fixed | — | engine rule | Videbæk 2015, Kluitenberg 2015. **Weak** |
| doubles: second run ≤ 8 km, ≥ 6 h | fixed | — | code constant | Elite practice. **Convention** |
| strength 2 × /week, after run or ≥ 3 h | fixed | — | code constant (08-02) | Blagrove 2018 (**moderate**), Petré 2021 (**moderate**) |
| strength not day before long run / key | fixed | — | code constant | **Convention** |
| profile `availableDays`, `longRunDay`, `qualityDays`, `restDay`, `kbDays`, `maxKm*` | — | — | athlete profile (exists) | — |

**Can the schema express it?** Runs, key sessions, gap: yes. Preferred weekday layout per phase: **G-11** (exists).
Doubles: **G-2**. Runs per phase (taper, recovery): **G-14** (phases-and-taper.md). New: **G-15: `week.hard_long_km`
and `week.max_hard_days`** as optional template overrides of the code constants (Pfitzinger would set `max_hard_days: 3`,
Hansons 3). **G-16: strength placement preferences** (`week.strength: { days, min_gap_hours, taper_sessions }`) —
optional; the decision 2026-10-23 keeps kettlebell in the profile, so G-16 is low priority and the rule above is a code
constant.

---

## 6. German explanation text ("Warum diese Woche so aussieht")

```text
{runs} Läufe, {q} Schlüsseleinheiten, langer Lauf am {longRunDay}, Ruhetag {restDay}.
Harte Tage liegen mindestens {g} Tage auseinander und nie direkt vor oder nach dem langen Lauf – „hart/locker“ ist
die Regel fast aller Trainingsmethoden; eine Studie, die Abstände vergleicht, gibt es nicht. Krafttraining liegt auf
den harten Tagen nach dem Lauf (oder mit drei Stunden Abstand), nicht am Tag vor dem langen Lauf. Kraft verbessert die
Laufökonomie um 2–8 % (Übersichtsarbeit über 24 Studien), die Ausdauer leidet nicht darunter.
```

## 7. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| Runs per week from template, capped by available days | **Convention** (profile is the constraint) |
| Novices ≤ 4 runs | **Weak** |
| Hard/easy, ≥ 1 easy day between hard days | **Convention** with plausible physiology; no trial |
| Long run on the profile day, not Sunday (the reference runner), rest day Friday | **Preference/profile** |
| Doubles only when needed, easy, ≤ 8 km | **Convention** (elite practice) |
| Strength 2 × /week improves economy | **Moderate** (systematic review) |
| Strength after the run or ≥ 3 h, not before key/long | **Moderate** (interference meta-analyses) for the gap; **convention** for the day-before rule |

## 8. Suggestions for the plans

1. 07-03: implement 1.2 and 2.2 on top of 07-02's `buildDays`; read the profile for days and caps; keep `ruleWarnings`.
2. 08-02: implement 4.2 as code constants; show moved kettlebell days in the draft review.
3. Schema: G-11 (layout per phase), G-2 (doubles), G-15 (hard-day constants as optional fields), G-16 (low priority).

## Sources

Peer-reviewed:

- Blagrove RC, Howatson G, Hayes PR (2018). Effects of strength training on the physiological determinants of middle- and long-distance running performance: a systematic review. *Sports Med* 48(5):1117–1149.
- Borges NR, Reaburn PR, Driller MW, Argus CK (2016). Age-related changes in performance and recovery kinetics in masters athletes: a narrative review. *J Aging Phys Act* 24(1):149–157.
- Casado A, Foster C, Bakken M, Tjelta LI (2023). Does lactate-guided threshold interval training within a high-volume low-intensity approach represent the "next step" in the evolution of distance running training? *Int J Environ Res Public Health* 20(5):3782.
- Doherty C, Keogh A, Davenport J, Lawlor A, Smyth B, Caulfield B (2020). An evaluation of the training determinants of marathon performance: a meta-analysis with meta-regression. *J Sci Med Sport* 23(2):182–188.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. *Med Sci Sports Exerc* 30(7):1164–1168.
- Haugen T, Sandbakk Ø, Seiler S, Tønnessen E (2022). The training characteristics of world-class distance runners. *Sports Med Open* 8:18.
- Kluitenberg B, van Middelkoop M, Diercks R, van der Worp H (2015). What are the differences in injury proportions between different populations of runners? A systematic review and meta-analysis. *Sports Med* 45(8):1143–1161.
- Llanos-Lagos C, et al. (2024). The effect of strength training methods on middle-distance and long-distance runners' athletic performance: a systematic review with meta-analysis. *Sports Med* (volume/pages not verified here).
- Petré H, Hemmingsson E, Rosdahl H, Psilander N (2021). Development of maximal dynamic strength during concurrent resistance and endurance training in untrained, moderately trained, and trained individuals: a systematic review and meta-analysis. *Sports Med* 51(5):991–1010.
- Schumann M, Feuerbacher JF, Sünkeler M, et al. (2022). Compatibility of concurrent aerobic and strength training for skeletal muscle size and function: an updated systematic review and meta-analysis. *Sports Med* 52(3):601–612.
- Videbæk S, Bueno AM, Nielsen RO, Rasmussen S (2015). Incidence of running-related injuries per 1000 h of running in different types of runners. *Sports Med* 45(7):1017–1026.

Coaching books: Daniels 2014; Humphrey, Hanson & Hanson 2012; Pfitzinger & Douglas 2019; Lydiard & Gilmour 2000.

Not verified: Schumann 2022 volume/pages and the exact separation threshold it reports (secondary summaries give
"about 3 h"); Llanos-Lagos 2024 details; the 48 h figure is practice, not a measured recovery constant.
