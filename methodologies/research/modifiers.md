# Research: modifiers — novice, masters (50+), high volume, readiness (sleep/HRV), B-races and tune-ups

Status: research note for plans 07-02/07-03 (profile-driven modifiers), 07-07 (readiness flags), 07-08 (minor races).
Not a methodology template. Written 2026-10-24.

**Questions**

1. How do experience (novice … elite), age (50+) and volume tier change the generator's defaults?
2. Should sleep and HRV readiness flags change the plan, and how?
3. How are B-races and tune-up races placed inside a block (mini-taper, recovery, what they replace)?

**Short answer**

- **Novice** (profile `experience: novice`, or < 1 year, or 12-week mean < 20 km): about twice the injury rate per hour of
  recreational runners (Videbæk 2015, Kluitenberg 2015). Fixed rules: peak ≤ 1.25 × current, net growth ≤ 4 %/week,
  recovery every 3rd week, ≤ 4 runs, long run ≤ 30 % and ≤ 90 min, at most 1 key session/week, no doubles. The 10 % rule
  did not protect novices (Buist 2008), so the protection is in the lower peak and the spike rule.
- **Masters 50+** (profile `age`): performance declines ~0.5–1 %/year from the 30s and faster after 70 (Tanaka & Seals
  2008), but evidence that *recovery* is slower in trained masters is limited and partly confounded by sedentary
  comparison groups (Borges 2016, Fell & Williams 2008). Rules: recovery every 3rd week, `key_gap_days ≥ 2`, ramp
  ≤ 8 %, keep strength training (2 × /week) through the block, otherwise unchanged. The reference runner is not in this group.
- **High volume** (≥ 100 km/week, or `experience: elite`): allow 7 runs and doubles (G-2), long-run share toward 25 %
  (Haugen 2022: ≥ 80 % low intensity, 11–14 sessions), threshold volume as in the Norwegian model only with lactate or
  HR control (G-2).
- **Readiness (sleep, HRV).** HRV-guided training in recreational runners produced similar or slightly better fitness
  with fewer hard sessions (Vesterinen 2016; Düking 2021 meta-analysis: medium effect on submaximal measures, small and
  non-significant on performance, fewer non-responders). Sleep: short sleep is associated with injury in adolescent
  athletes (Milewski 2014) and the 2021 expert consensus recommends individualised sleep targets, not a universal
  number (Walsh 2021). Rule: a readiness flag (HRV below the individual 7-day baseline band, or sleep < 6 h) **shifts the
  next key session by one day at most twice a week**; two flags in a row plus TSB in the caution band → the fatigue
  guard. Flags never add training. Garmin sleep/HRV data arrive with 09-02; until then this is dormant.
- **B-races and tune-ups** (07-07 roles: Renntempo-Test / Aufbaurennen / einfach mitlaufen): a tune-up replaces that
  week's key sessions (Daniels, Pfitzinger: 2–3 tune-ups of 8–15 km in race preparation), with 2–3 easy days before
  and 1 easy day per 3–4 km raced after (convention), never inside the last `TAPER_DAYS` and never closer than 2 weeks to
  the goal race for ≥ 10 km. The race week counts as a recovery week for the cadence (peak-and-recovery.md).

---

## 1. Novice

| Source | Finding |
|---|---|
| Videbæk et al. 2015, *Sports Med* 45(7):1017–1026 | 17.8 injuries/1000 h in novices vs. 7.7 in recreational runners |
| Kluitenberg et al. 2015, *Sports Med* 45(8):1143–1161 | Injury proportions highest in novices across populations |
| Buist et al. 2008, *Am J Sports Med* 36(1):33–39 | A graded 10 % programme did not reduce novice injuries (20.8 % vs 20.3 %) |
| Nielsen et al. 2014, *J Orthop Sports Phys Ther* 44(10):739–747 | > 30 % progression over two weeks: more distance-related injuries (weak) |
| Nielsen et al. 2012, *Int J Sports Phys Ther* 7(1):58–75 | Systematic review of training errors: evidence on specific errors is sparse |

```text
novice := profile.experience == 'novice' OR years_running < 1 OR mean12wk_km < 20
fixed rules (engine, not template):
   g ≤ 1.25, n = nR ≤ 0.04 (peak-and-recovery.md)       recovery every ≤ 3       runs ≤ 4       doubles: none
   long_run.share ≤ 0.30 AND max_minutes ≤ 90           key_sessions ≤ 1/week (build/peak), 0 in base
   quality: threshold and strides only; no intervals_vo2 before build week 4
   paces: easy by HR (Z2 cap) rather than pace; goal plausibility warning at > 2 % (paces.md)
```

Evidence strength: **weak–moderate** that novices need more conservative settings; the specific numbers are convention.

## 2. Masters (50+)

| Source | Finding |
|---|---|
| Tanaka & Seals 2008, *J Physiol* 586(1):55–63 | Endurance performance declines modestly to ~60–70, then faster; VO2max decline is the main driver |
| Borges, Reaburn, Driller, Argus 2016, *J Aging Phys Act* 24(1):149–157 | Narrative review: evidence on age and recovery in *trained* masters is limited; earlier comparisons used sedentary controls |
| Fell & Williams 2008, *J Aging Phys Act* 16(1):97–115 | Slower muscle recovery with age, limited evidence |
| Blagrove et al. 2018, *Sports Med* 48(5):1117–1149 | Strength training improves running economy (all ages in the review) |

```text
masters := profile.age ≥ 50
fixed rules: recovery every ≤ 3; key_gap_days ≥ 2; ramp_max ≤ 0.08; strength 2×/week kept through peak (one light in
taper); long run max_minutes unchanged; everything else from the template.
```

Evidence strength: **weak** (plausible, under-studied). Not active for the reference runner; kept so the generator's rules are
complete.

## 3. High volume / elite tier

| Source | Finding |
|---|---|
| Haugen et al. 2022, *Sports Med Open* 8:18 | World-class: 11–14 sessions/week, ≥ 80 % low intensity, 160–220 km (M) |
| Casado et al. 2023, *Int J Environ Res Public Health* 20(5):3782 | Norwegian model: doubles on threshold days, lactate control, 150–180 km |
| Pfitzinger & Douglas 2019 [B] | 85+ mi tier: 7 runs with doubles |
| Rasmussen et al. 2013 | > 60 km/week not riskier than 30–60 for marathoners (retrospective) |

```text
high_volume := current B ≥ 100 km OR template tier ≥ 113 km (G-8)
rules: runs may be 7; doubles allowed (G-2) for easy second runs; long_run.share → min(share, 0.25) when K ≥ 120;
       threshold sessions ≥ 3/week only with lactate/HR guide (G-2); otherwise template unchanged.
```

Evidence strength: **convention** (elite practice).

## 4. Readiness: sleep and HRV

### 4.1 Evidence

| Source | Design | Finding |
|---|---|---|
| Vesterinen et al. 2016, *Med Sci Sports Exerc* 48(7):1347–1354 | 40 recreational runners, 8 weeks, HRV-guided vs. predefined | HRV-guided group did significantly fewer moderate/high-intensity sessions (13.2 vs 17.7); fitness outcomes were measured (3000 m, VO2max) — the between-group result was not retrieved here (abstract-level) |
| Düking et al. 2021, *J Sci Med Sport* 24(11):1180–1192 | Meta-analysis, 8 studies, 198 participants | HRV-guided training: medium positive effect on submaximal parameters; small, non-significant effect on performance and VO2peak; fewer non-responders |
| Granero-Gallegos et al. 2020, *Int J Environ Res Public Health* 17(21):7999 | Meta-analysis, VO2max | HRV-based training improved VO2max in endurance athletes (details not read here) |
| Milewski et al. 2014, *J Pediatr Orthop* 34(2):129–133 | 112 adolescent athletes, retrospective | ≥ 8 h sleep associated with fewer injuries (reported as ~68 % lower odds); grade level the other predictor. Adolescents, small, retrospective |
| Walsh et al. 2021, *Br J Sports Med* 55(7):356–368 | Expert consensus | Athletes are prone to short/poor sleep; recommends individualised sleep assessment and targets, screening and education |
| Schwellnus et al. 2016 (IOC) | Consensus | Monitor well-being alongside load |

**Reading.** HRV-guided programmes mainly *remove* hard sessions on low-HRV days and lose nothing by it. That is exactly
a "shift or soften the key session" rule. Sleep evidence in adult runners is thin; use sleep only as a secondary flag.

### 4.2 Proposed rule (dormant until 09-02 provides Garmin sleep/HRV; trigger `readiness_low`, gap G-22)

```text
Inputs (daily): hrv_rmssd (overnight), sleep_h; baseline = rolling 7-day mean and SD of the last 28 days (individual)
flag_hrv   := hrv < baseline_mean − 1 SD (smallest worthwhile change per Vesterinen: individual band)
flag_sleep := sleep_h < 6.0 OR sleep_h < baseline_mean − 1.5 h
readiness_low := flag_hrv OR flag_sleep

rules
  1. readiness_low on the day of a key session → suggest shifting it to the next day that satisfies week-layout.md 2.2
     (at most 2 shifts per week; the easy run swaps into its place; week km unchanged)
  2. readiness_low on 2 consecutive days AND TSB < tsb_caution → fatigue guard (adaptation.md 2.3), i.e. soften
  3. flags never add training; they never move anything into the taper's last 9 days; race and test days are anchors
  4. shown in Rennbereitschaft as a note, never as a hard verdict
```

Evidence strength: **moderate** that HRV-guided scheduling is at least as good with fewer hard sessions; **weak** for
sleep thresholds (adolescent data, consensus).

## 5. B-races and tune-ups inside a block

### 5.1 Practice

| Method | Tune-ups | Handling |
|---|---|---|
| Pfitzinger [B] | 2–3 tune-up races (8 km–15 km, or HM early) in race preparation, ~2–3 weeks apart, last one ~2–3 weeks before the marathon | The tune-up replaces the week's LT session and the long run is shortened the next day |
| Daniels [B] | Races may replace Q sessions; "a race is a Q day" | Reduce the week's quality accordingly |
| Hansons [B] | Few; the method relies on SOS sessions | — |
| Norwegian / Haugen 2022 | Frequent races as the hard session in competition phases | — |
| Porto 2026 | Tests (20 km @ MP, HM @ MP) as anchors; `TAPER_DAYS 9` protects the last days; 07-07 roles Test / Aufbau / Mitlaufen | our plan |

No trial tests tune-up frequency; the rules are convention plus the recovery-week logic.

### 5.2 Proposed rule (07-07 events layer)

```text
Inputs: minor race { date, distance d_km, role: test | build | fun }, goal race G
Code constants (optional template, G-26):
   PRE_EASY_DAYS       = d ≤ 10 km: 2, ≤ 21.1: 3, longer: 4          easy days before (last key ≥ that many days earlier)
   POST_EASY_DAYS      = ceil(d_km / 3.5)   (10 km → 3, HM → 6; "a day per 3–4 km", convention)
   MIN_GAP_TO_GOAL     = d ≥ 10 km: 14 days; d ≥ 21.1: 21 days (M goal), not allowed inside the taper at all for HM goal
   COUNTS_AS_RECOVERY  = d ≥ ½ goal distance OR d ≥ 15 km  → the week is a recovery week for the cadence
rules
  role test  : the race is a `test` at goal pace (or the entered pace); counts for Plan A/B (paces.md 3.3); the week's
               other key sessions are dropped; the long run moves to ≥ 2 days after (shortened to 0.7 × planned)
  role build : run hard; replaces the week's key session(s); recovery per POST_EASY_DAYS; result updates VDOT_race
  role fun   : run easy; replaces an easy run of that km; nothing else changes
  all roles  : no key session within PRE_EASY_DAYS before; no strength within 48 h before; not within TAPER_DAYS;
               a race the engine did not plan (synced run with race flag) is treated as 'build' after the fact
  warn if MIN_GAP_TO_GOAL is violated; refuse only inside TAPER_DAYS
```

Evidence strength: **convention**.

### 5.3 Per method (07-18)

What each method does with races inside a block, in our words, and the values the template carries
(`adaptation.events`, all optional; a missing value = the 5.2 constant). **c** = convention (the source says nothing
measurable; the 5.2 value is kept or adjusted by the method's logic), **b** = the book states it.

| Method | What the method does | Values that differ from 5.2 |
|---|---|---|
| Pfitzinger [B] | Tune-ups are part of the plan: 8–15 km (HM earlier) every 2–3 weeks in race preparation; the race takes the place of the week's LT session, the long run the day after is shortened | `build_from_km 8` (b: short tune-ups are run hard, not "mitlaufen") |
| Daniels [B] | A race counts as a Q session; before the next Q session one easy day per ~3 km raced; a day or two easy before | `post_easy.per_km 3` (b), `pre_easy_days {short 1, half 2, long 3}` (b, "a day or two") |
| Hansons [B] | Few races; the SOS sessions carry the build. A race early in the block may replace an SOS day; nothing late | `test_window_days 14` (c: tests late in the block are discouraged, so the default role near the race is not "test" from 3 weeks out) |
| Lydiard [B] | Time trials and short races belong to the late anaerobic/coordination phase (last ~6 weeks); early phases are aerobic only | `test_window_days 42` (b: time trials in the last six weeks), `build_from_km 21.1` (c: shorter races before that are run easy) |
| Norwegian [B/R] | Races are used as the week's hard session (threshold double replaced), with very little taper around them | `pre_easy_days {short 1, half 2, long 3}` (c), `light_from_km 21.1`, `light_share 0.75` (c: a 15 km race does not make the week light) |
| Polarized 80/20 [R] | A race is one of the week's high-intensity sessions; the 80/20 distribution of the week is kept | none (5.2 values) |
| Porto 2026 | own anchors; Porto block never takes minor races (07-16) | none |

Safety limits above every template (fixed): at least 1 easy day before a race, at least 2 easy/recovery days after a
build race, a race week never above its planned km, no race inside the taper guard (≥ 7 days, 07-18 TAPER).

Evidence strength: **book practice / convention**; no trial compares tune-up handling between methods.

## 6. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| novice definition | experience / < 1 yr / < 20 km | — | engine rule (profile) | Videbæk 2015 |
| novice caps (g 1.25, n 0.04, every 3, runs 4, key 1, long 30 %/90 min) | fixed | — | engine rule | **Convention**, direction **weak–moderate** |
| masters age threshold | 50 | 45–60 | code constant | Tanaka & Seals 2008 (decline accelerates later; 50 is cautious). **Convention** |
| masters caps (every 3, gap ≥ 2, ramp 0.08) | fixed | — | engine rule | **Weak** |
| high-volume threshold | 100 km | — | code constant | Haugen 2022 (elite practice). **Convention** |
| HRV band | mean − 1 SD, 7/28 days | — | code constant | Vesterinen 2016 (individual SWC). **Moderate** |
| sleep flag | < 6 h or −1.5 h vs baseline | — | code constant | Walsh 2021 (individual), Milewski 2014 (**weak**) |
| readiness shift ≤ 2/week, soften after 2 days + caution | fixed | — | engine rule | **Convention** |
| tune-up constants (PRE/POST easy days, gap to goal) | see 5.2 | — | code constant, optional template (G-26) | Pfitzinger/Daniels practice. **Convention** |

**Can the schema express it?** None of the modifiers is in the template schema; they are profile-driven engine rules,
which matches the 2026-10-23 decision (kettlebell and personal constraints live in the profile). Gaps: **G-25:
profile fields** `yearsRunning`, `injuryHistory` (optional), and the readiness inputs (`hrv`, `sleep` series via
09-02); **G-26: `adaptation.minor_race` constants** as optional template overrides; **G-22** for the `readiness_low`
and `race_result` triggers. A template-level `modifiers:` block is **not** proposed — the modifiers are safety-type rules
that should not be editable per template.

## 7. German explanation text

```text
{Einsteiger: „Als Einsteiger plant Runmate vorsichtiger: höchstens 25 % mehr Umfang als jetzt, jede dritte Woche
leicht, höchstens vier Läufe und eine Schlüsseleinheit pro Woche. Einsteiger verletzen sich pro Laufstunde etwa doppelt
so oft wie erfahrene Läufer.“}
{Readiness: „HRV heute unter deinem Normalbereich – die Schlüsseleinheit rückt auf morgen. Studien mit Hobbyläufern
zeigen: Wer harte Einheiten nach der HRV legt, läuft weniger harte Einheiten und wird mindestens genauso fit.“}
{Tune-up: „{Rennen} ({d} km) am {Datum} ersetzt die Schlüsseleinheiten dieser Woche; {pre} lockere Tage davor,
{post} danach. Die Woche zählt als leichte Woche.“}
```

## 8. Suggestions for the plans

1. 07-02/07-03: implement novice and masters rules as profile-driven clamps on the template values; report them in
   the draft review ("Einsteiger-Regel aktiv").
2. 07-07: `readiness_low` as a dormant trigger with the shift rule; activate when 09-02 lands.
3. 07-07/07-08: minor-race constants per 5.2 in the events layer; the race week restarts the recovery count.
4. Schema/profile: G-22, G-25, G-26.

## Sources

Peer-reviewed:

- Blagrove RC, Howatson G, Hayes PR (2018). *Sports Med* 48(5):1117–1149.
- Borges NR, Reaburn PR, Driller MW, Argus CK (2016). Age-related changes in performance and recovery kinetics in masters athletes: a narrative review. *J Aging Phys Act* 24(1):149–157.
- Buist I, et al. (2008). *Am J Sports Med* 36(1):33–39.
- Casado A, Foster C, Bakken M, Tjelta LI (2023). *Int J Environ Res Public Health* 20(5):3782.
- Düking P, Zinner C, Trabelsi K, et al. (2021). Monitoring and adapting endurance training on the basis of heart rate variability monitored by wearable technologies: a systematic review with meta-analysis. *J Sci Med Sport* 24(11):1180–1192.
- Fell J, Williams AD (2008). *J Aging Phys Act* 16(1):97–115.
- Granero-Gallegos A, González-Quílez A, Plews D, Carrasco-Poyatos M (2020). HRV-based training for improving VO2max in endurance athletes: a systematic review with meta-analysis. *Int J Environ Res Public Health* 17(21):7999.
- Haugen T, Sandbakk Ø, Seiler S, Tønnessen E (2022). *Sports Med Open* 8:18.
- Kluitenberg B, van Middelkoop M, Diercks R, van der Worp H (2015). *Sports Med* 45(8):1143–1161.
- Milewski MD, Skaggs DL, Bishop GA, et al. (2014). Chronic lack of sleep is associated with increased sports injuries in adolescent athletes. *J Pediatr Orthop* 34(2):129–133.
- Nielsen RO, Buist I, Sørensen H, Lind M, Rasmussen S (2012). Training errors and running related injuries: a systematic review. *Int J Sports Phys Ther* 7(1):58–75.
- Nielsen RO, et al. (2014). *J Orthop Sports Phys Ther* 44(10):739–747.
- Rasmussen CH, et al. (2013). *Int J Sports Phys Ther* 8(2):111–120.
- Tanaka H, Seals DR (2008). Endurance exercise performance in Masters athletes: age-associated changes and underlying physiological mechanisms. *J Physiol* 586(1):55–63.
- Vesterinen V, Nummela A, Heikura I, et al. (2016). Individual endurance training prescription with heart rate variability. *Med Sci Sports Exerc* 48(7):1347–1354.
- Videbæk S, et al. (2015). *Sports Med* 45(7):1017–1026.
- Walsh NP, Halson SL, Sargent C, et al. (2021). Sleep and the athlete: narrative review and 2021 expert consensus recommendations. *Br J Sports Med* 55(7):356–368.
- Schwellnus M, et al. (2016). *Br J Sports Med* 50(17):1043–1052.

Coaching books (secondary): Daniels 2014; Pfitzinger & Douglas 2019; Humphrey, Hanson & Hanson 2012.

Not verified: Vesterinen 2016 between-group performance result (abstract-level; the "fewer hard sessions" finding is
confirmed); Granero-Gallegos 2020 details and exact citation; Milewski's exact odds ratio (secondary reports say "68 %
less likely"); Pfitzinger's tune-up distances (8–15 km) are from secondary summaries; the post-race recovery rule "a
day per 3–4 km" is convention.
