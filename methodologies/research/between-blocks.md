# Research: between blocks — post-race recovery, rolling base, hand-over into a new block

Status: research note for plan 07-08 (rolling base block) and the 06-01 recovery block it hands over from; also the
`from` input of phases-and-taper.md 1.3. Not a methodology template. Written 2026-10-24.

**Questions**

1. How long and how light is the recovery after a goal race (marathon / half), and when may quality return?
2. What does a rolling base block look like between a recovery block and the next goal block?
3. How does a goal block start from a base block (what is B, how long is base)?

**Short answer**

- **Post-race recovery** is convention: Pfitzinger gives a 5-week return-to-running schedule after a marathon; the
  Porto plan uses a 2–3-week reverse taper from 9.11. (06-01). The one piece of evidence is indirect: detraining
  within < 4 weeks of insufficient training is modest (Mujika & Padilla 2000), and two sessions a week at maintained
  intensity preserve VO2max for weeks (Hickson & Rosenkoetter 1981), so a 2–3-week recovery costs little fitness.
  Rule: marathon 3 weeks (0 → 40 % → 60 % → 75 % of the last load week, easy only in weeks 1–2, strides/short
  threshold in week 3); half marathon 1–2 weeks (50 % → 80 %); 10 km 1 week.
- **Rolling base block** (07-08 AC-1/2 kept): weekly km start at the mean of the last 3 run weeks (≥ 30 km), may grow
  ≤ 5 %/week towards the proven level P, never above P, with 1 key session/week (threshold or strides) and a long run
  ≤ 25 % of the week; every 4th week lighter. It is a holding pattern, not a build: pyramidal, easy ≥ 85 % by time.
- **Hand-over**: a goal block starting from a base block takes B = the base block's last week and `from = 'base_block'`
  (phases-and-taper.md: base.min − 1); starting from a recovery block takes B = the recovery block's last week (not
  the 4-week mean, peak-and-recovery.md 1.3).

---

## 1. Post-race recovery

| Source | Finding | Rule |
|---|---|---|
| Pfitzinger & Douglas 2019 [B] | 5-week post-marathon recovery schedule in every plan tier | 3-week minimum here, 5 comfortable |
| Mujika & Padilla 2000, *Sports Med* 30(2):79–87 | Short-term detraining (< 4 weeks): VO2max and blood volume decline in highly trained athletes, modest in less trained | ≤ 3 weeks light costs little; > 4 weeks needs a lower restart |
| Hickson & Rosenkoetter 1981, *Med Sci Sports Exerc* 13(1):13–16 | 2 sessions/week at maintained intensity preserved VO2max for 15 weeks after 10 weeks of training | one short quality touch per week keeps the engine |
| Aubry et al. 2014 | 70 % infection rate in overreached athletes | post-race illness risk is real; keep week 1 very easy |
| Porto 2026 (06-01) | Recovery block 9.11.–~29.11.: reverse taper, no key sessions, engine knows it is recovery (no carry-over, no rebalance, no missed-key moves) | keep |
| "One easy day per mile raced" | Coaching saying (often attributed to Jack Foster) | **Convention**, not evidence; 26 days ≈ the 3–4-week rule above |

```text
post_race_recovery[distance] (code constants; optional template G-27)
  marathon : weeks 3 → km shares of the last load week [0.40, 0.60, 0.75]; week 1 easy ≤ 40 min runs, no long run;
             week 2 long ≤ 60 % of the pre-taper long run; week 3 strides + one 15–20 min threshold; no race-pace work
  half     : weeks 2 → [0.50, 0.80]; quality from week 2
  10k      : week 1 → [0.60]
  rules    : engine in recovery mode (exists); the recovery block ends into a base block (07-08) or a goal block;
             km in the recovery block never rise above the last share × last load week
```

## 2. Rolling base block (07-08)

```text
inputs: last 3 run weeks (Garmin), proven P (peak-and-recovery.md), profile days, template chosen for the next goal
   K_base(0) = max(30, mean(last 3 run weeks))                 (07-08 AC-1)
   K_base(w) = min(K_base(w−1) × 1.05, P)                      grow ≤ 5 %/week, never above the proven level
               missed weeks: next week = min(previous plan, actual × 1.05) (07-08 AC-2: lower, never raise > +5 %)
   every 4th week × 0.80 (recovery cadence applies; count restarts when a goal block starts)
   layout: profile days; 1 key session/week (threshold 20–30 min or 8–10 strides); long run ≤ 0.25 × K and ≤ 1.10 ×
           30-day longest (spike rule); intensity easy ≥ 85 % by time
   hand-over: ends the day before a goal or recovery block starts (07-08 AC-3)
```

Basis: Hickson (maintenance), Mujika & Padilla (detraining), Seiler 2010 (easy share). **Convention** for the numbers.

## 3. Hand-over into a goal block

```text
from = 'recovery'   : B = km of the recovery block's last week (planned level, not a detraining signal)
from = 'base_block' : B = mean of the base block's last 2 weeks; phases.min_weeks.base − 1 (phases-and-taper.md 1.3)
from = 'cold'       : B = mean of the last 4 run weeks; novice rules if applicable (modifiers.md)
P never changes at a hand-over; the 52-week lookback keeps the Porto build inside the window until autumn 2027.
```

## 4. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| post-race recovery weeks | M 3, HM 2, 10k 1 | M 2–5 | code constant (optional template, **G-27**) | Pfitzinger 5-week schedule; 06-01. **Convention** |
| post-race shares | M [0.40, 0.60, 0.75] | — | code constant | **Convention** |
| base block start | max(30, mean 3 weeks) | — | code constant (07-08) | **Convention** |
| base block growth | ≤ 5 %/week, ≤ P | — | code constant | peak-and-recovery.md net growth. **Convention** |
| base block quality | 1 session/week | 0–1 | code constant | Hickson 1981 (intensity maintains fitness). **Moderate** |
| base block long run | ≤ 25 %, spike rule | — | code constant | long-run.md |

**Can the schema express it?** No; post-race recovery and the base block are not template concepts today. Proposed
**G-27: `post_race_recovery[distance] = { weeks, shares }` and `base_block = { growth, key_sessions, long_run_share }`**
as optional template fields; code constants until then.

## 5. German explanation text

```text
Nach {Rennen}: {weeks} Wochen Erholung ({shares} der letzten Belastungswoche), zuerst nur locker. Zwei bis drei
ruhige Wochen kosten kaum Fitness – die Studien zu Trainingspausen zeigen deutliche Verluste erst nach etwa vier
Wochen, und eine kurze schnelle Einheit pro Woche hält die Form. Danach läuft der Grundlagenblock: Umfang auf dem
Niveau der letzten Wochen, höchstens 5 % mehr pro Woche, eine Schlüsseleinheit, jede vierte Woche leichter – bis der
nächste Zielblock beginnt.
```

## 6. Strength of evidence

| Rule | Evidence |
|---|---|
| 2–3 light weeks after a marathon cost little fitness | **Moderate** (detraining and maintenance studies, old and small) |
| 3–5 weeks recovery after a marathon | **Convention** (Pfitzinger, Porto) |
| Base block as a holding pattern with one quality touch | **Moderate** for "keep intensity", **convention** for the numbers |
| Hand-over B rules | **Convention**, consistent with peak-and-recovery.md |

## Sources

- Aubry A, et al. (2014). *Med Sci Sports Exerc* 46(9):1769–1777.
- Hickson RC, Rosenkoetter MA (1981). Reduced training frequencies and maintenance of increased aerobic power. *Med Sci Sports Exerc* 13(1):13–16.
- Mujika I, Padilla S (2000). Detraining: loss of training-induced physiological and performance adaptations. Part I. *Sports Med* 30(2):79–87.
- Seiler S (2010). *Int J Sports Physiol Perform* 5(3):276–291.
- Pfitzinger P, Douglas S (2019). *Advanced Marathoning*, 3rd ed. Human Kinetics (5-week recovery schedule, secondary-confirmed).

Not verified: the exact content of Pfitzinger's 5-week recovery schedule; the "one day per mile" saying has no primary
source.
