# Research: feedback — session RPE, Gefühl and Schmerzen as adaptation inputs

Status: research note for plan 07-25 (Feedback-Loop: subjective feedback after each run → Plan-anpassen suggestions and
hints). Builds on adaptation.md §2 (fatigue triggers) and modifiers.md §4 (readiness flags). Not a methodology template.
Written 2026-11-01.

**Questions**

1. Which subjective measures are worth asking after every run, and on which scale?
2. When is an easy run "too hard", and what should follow from several such runs?
3. Pain: which level stops training, which is watched, and what is the evidence?
4. Low RPE at goal pace: may feedback make the plan faster?
5. How does the weekly feedback (rating, fatigue) combine with the per-run feedback?

**Short answer**

- **Ask three things, once, right after the run:** session RPE on the CR-10 scale (Borg 1982; Foster 1998, 2001), a
  one-item wellbeing rating (Gefühl 1–5) and pain (none / light / stop). Subjective measures track training response
  better than HR-derived or performance measures (Saw 2016, systematic review); a single item per construct is enough
  for daily use (Kellmann 2018). Session RPE is valid against HR-based loads across sports (Haddad 2017; McLaren 2018).
- **Easy run too hard:** on the CR-10 scale easy running sits at 2–4 ("easy"/"somewhat hard" boundary is 4); polarized
  practice puts ≥ 80 % of sessions there (Seiler & Kjerland 2006; Seiler 2010). An easy day rated **≥ 6** (or Gefühl
  ≤ 2) is a session that did not do what it was for. Long runs score higher by duration alone (Fusco 2020), so their
  threshold is **≥ 7**. Two such runs within 7 days — or one plus a weekly feedback with fatigue ≥ 4 — is the same
  situation the fatigue guard handles (adaptation.md §2.3): **suggest** softening the next hard session; never automatic,
  because subjective flags are advisory (modifiers.md §4.2 rule 4, HRV analogue: remove hard sessions, lose nothing).
- **Pain:** the consensus definition of a running-related injury is pain that restricts or stops running (Yamato 2015).
  Pain-monitoring models in tendinopathy allow continued training with pain ≤ 5/10 that settles by the next morning
  (Silbernagel 2007; Thomeé 1997). Runmate uses two levels only: **light** (continue, watch; three in 14 days = hint)
  and **stop** (pain that made the runner stop or change their stride → hint to enter a Pause, which the existing Krank/Pause
  layer turns into a graded return, adaptation.md §4). No automatic rest day from a tap.
- **Low RPE at goal pace:** a note only. The goal changes from tests and races (paces.md §3.3, asymmetric), never from
  how a session felt. Feeling fresh at race pace two or three times is encouraging, not evidence of a faster VDOT.
- **Weekly feedback** (07-26: rating 1–5, fatigue 1–5) is one more signal of the same kind: fatigue ≥ 4 counts as one
  "too hard" signal in the 7-day window. It never acts alone.

---

## 1. Evidence

| Source | Design | Finding | Rule |
|---|---|---|---|
| Borg 1982, *Med Sci Sports Exerc* 14(5):377–381 | Psychophysics | Category-ratio (CR-10) scale of perceived exertion | the 1–10 scale |
| Foster 1998, *Med Sci Sports Exerc* 30(7):1164–1168 | 25 athletes, 6 months | Session RPE × duration as load; monotony and strain relate to illness/overtraining | RPE after every session |
| Foster et al. 2001, *J Strength Cond Res* 15(1):109–115 | Validation vs. HR zones | Session RPE taken ~30 min after exercise agrees with HR-based summated-zone loads | one rating per run, not per km |
| Haddad et al. 2017, *Front Neurosci* 11:612 | Review | Session RPE valid and practical; influenced by duration, intensity distribution, psychological state | thresholds per session type |
| McLaren et al. 2018, *Sports Med* 48(3):641–658 | Meta-analysis, team sports | sRPE correlates strongly with internal (HR) and external load measures | RPE as a load proxy is sound |
| Fusco et al. 2020, *Int J Sports Physiol Perform* 15(2):292–294 | Prolonged exercise | Session RPE rises with duration at the same intensity | long-run threshold one point higher |
| Saw, Main & Gastin 2016, *Br J Sports Med* 50(5):281–291 | Systematic review, 56 studies | Subjective wellbeing (fatigue, mood, stress) responded to acute and chronic load more consistently than objective measures | Gefühl as a second item |
| Kellmann et al. 2018, *Int J Sports Physiol Perform* 13(2):240–245 | Consensus statement | Monitor recovery with short, regular self-reports; interpret individually | short daily items, individual |
| Hooper & Mackinnon 1995, *Sports Med* 20(5):321–327 | Recommendations | Daily 1–7 ratings of fatigue, stress, soreness, sleep flag overreaching | weekly fatigue item (07-26) |
| Seiler & Kjerland 2006, *Scand J Med Sci Sports* 16(1):49–56 | 12 elite XC skiers | ~75 % of sessions easy by session-goal/RPE; "easy days easy" | easy = RPE ≤ 4 |
| Seiler 2010, *Int J Sports Physiol Perform* 5(3):276–291 | Review | Polarized distribution; too-hard easy days erode the quality days | the "easy too hard" rule |
| Yamato, Saragiotto & Lopes 2015, *J Orthop Sports Phys Ther* 45(5):375–380 | Delphi consensus | RRI = running-related pain that restricts or stops running (distance, speed, duration, training) or needs consultation | 'stop' = restricts running |
| Silbernagel et al. 2007, *Am J Sports Med* 35(6):897–906 | RCT, Achilles tendinopathy | Pain-monitoring model: pain ≤ 5/10 during activity allowed if it settles by next morning | 'light' = continue, watch |
| Thomeé 1997, *Phys Ther* 77(12):1690–1703 | Patellofemoral pain | Same pain-monitoring principle | 'light' |
| modifiers.md §4 (Vesterinen 2016; Düking 2021) | HRV-guided training | Removing hard sessions on low-readiness days loses nothing | soften, never add |

**Reading.** Session RPE is the best-supported single subjective item; wellbeing items add signal mainly for chronic
fatigue. Both are advisory in every study — they steer which hard session is dropped, they never prescribe more. Pain
levels have consensus definitions but no trial-tested thresholds for runners; the two-level choice is practice.

## 2. Proposed rules (07-25; pure, `lib/feedback/rules.ts`)

```text
Inputs per run: rpe 1–10 (activities.perceived_exertion), feel 1–5, pain none|light|stop (settings run_feedback)
Weekly (07-26, settings week_feedback): rating 1–5, fatigue 1–5 — this week's entry, else last week's
Session of a run: swap-aware pairing (pace-check.ts matchSessionRuns); easy day = easy | recovery | long without pace

easy_too_hard  (signal)
   flagged run := easy day AND (rpe ≥ EASY_RPE_HIGH (6)  |  long run: rpe ≥ LONG_RPE_HIGH (7)  |  feel ≤ EASY_FEEL_LOW (2))
   signals     := flagged runs in [today − 6, today] + (week.fatigue ≥ WEEK_FATIGUE_HIGH (4) ? 1 : 0)
   signals ≥ SIGNALS_NEEDED (2) → Plan anpassen suggestion "… locker laufen": next hard editable session within
   FATIGUE_DAYS → easy at the block's fatigueShare (same diff as the fatigue guard); skipped when the TSB/ACWR fatigue
   suggestion already names a session. finalize() applies: never past/run/protected/taper/pause days.
   NEVER automatic (engine does not read feedback).

pain_stop      (hint) latest run within PAIN_STOP_DAYS (3) has pain 'stop' AND no Krank/Pause covers today
                      → "Schmerzen beim letzten Lauf: besser Pause" next to the Krank/Pause control. No plan change.
pain_recurring (hint) ≥ PAIN_LIGHT_RUNS (3) runs with pain 'light' in PAIN_LIGHT_DAYS (14) → watch; next time 'Stopp'.
goal_pace_easy (hint) ≥ GOAL_PACE_RUNS (2) race-pace sessions in GOAL_PACE_DAYS (21) whose paired run hit the target
                      (checkPace 'im Ziel' | 'zu schnell') at rpe ≤ GOAL_PACE_RPE_LOW (4) → note: the test decides.
                      No suggestion; no pace in any suggestion is ever faster than before (property test).
```

## 3. Parameters

| Name | Default | Range | Where | Basis |
|---|---|---|---|---|
| RPE scale | CR-10 (1–10) | — | fixed | Borg 1982, Foster 2001. **Moderate** (validity), scale choice **convention** |
| `EASY_RPE_HIGH` | 6 | 5–7 | code constant | Seiler easy ≤ 4; one point of slack. **Convention** |
| `LONG_RPE_HIGH` | 7 | 6–8 | code constant | Fusco 2020 (duration raises RPE). **Weak** |
| `EASY_FEEL_LOW` | 2 (of 5) | — | code constant | Saw 2016 (wellbeing tracks load). **Convention** |
| `WINDOW_DAYS` | 7 | 5–10 | code constant | matches the fatigue guard window. **Convention** |
| `SIGNALS_NEEDED` | 2 | 2–3 | code constant | one bad day is noise (Kellmann 2018: interpret trends). **Convention** |
| `WEEK_FATIGUE_HIGH` | 4 (of 5) | — | code constant | Hooper & Mackinnon 1995 style item. **Convention** |
| `PAIN_STOP_DAYS` | 3 | 1–5 | code constant | **Convention** |
| `PAIN_LIGHT_RUNS` / `PAIN_LIGHT_DAYS` | 3 / 14 | — | code constant | Yamato 2015 (3 consecutive sessions in the RRI definition). **Weak** |
| `GOAL_PACE_RPE_LOW` / `_RUNS` / `_DAYS` | 4 / 2 / 21 | — | code constant | **Convention** |
| softening share | block `fatigueShare` | ≥ 0.5 | rules.ts (exists) | adaptation.md §2.3 |

**Can the schema express it?** No trigger for subjective feedback exists (`feedback_rpe`, `feedback_pain`,
`feedback_week`): **G-28**. Until then the thresholds are code constants shared by every block; a template could later
set `EASY_RPE_HIGH` and `SIGNALS_NEEDED`.

## 4. German texts

```text
Lockere Läufe zu anstrengend: {n} lockere Läufe in 7 Tagen mit RPE ≥ 6 (Longrun ≥ 7) oder Gefühl ≤ 2
  [· Wochenfeedback: Müdigkeit {f}/5]. Vorschlag: {Einheit} am {Tag} locker laufen ({km} km statt {km} km).
Schmerzen beim letzten Lauf ({Tag}): besser Pause als durchlaufen. Trag Krank/Pause ein – Runmate plant den Wiedereinstieg.
Leichte Schmerzen bei {n} Läufen in zwei Wochen: beobachten. Wenn sie den Schritt verändern, beim nächsten Mal „Stopp“.
Renntempo fühlt sich leicht an ({n} Einheiten mit RPE ≤ 4 im Ziel): gutes Zeichen. Das Tempo bleibt, der nächste Test entscheidet.
```

## 5. Strength of evidence per rule

| Rule | Evidence |
|---|---|
| Ask session RPE once per run | **Moderate** (validity studies; Foster, Haddad, McLaren) |
| Wellbeing item tracks load | **Moderate** (Saw 2016 review), scale **convention** |
| Easy run at RPE ≥ 6 is "too hard" | **Convention** (Seiler's distribution work, not a tested cut-off) |
| Two flags → soften next hard session | **Convention** (HRV-guided analogue is **moderate**) |
| Pain 'stop' → pause, 'light' → watch | **Expert guidance / consensus** (Yamato 2015; pain-monitoring models in tendinopathy) |
| Low RPE at goal pace changes nothing | **Convention**, consistent with paces.md §3.3 |

## 6. Suggestions for the plans

1. 07-25: the rules above as `lib/feedback/rules.ts`; suggestion through Plan anpassen only; hints in Heute and Plan anpassen.
2. 07-26 (Wochenfeedback): write `week_feedback` as in the contract; fatigue is read here.
3. 07-27 (progress charts): RPE and Gefühl per run next to pace/HR would show the "easy too hard" drift directly.
4. Schema G-28: `adaptation.triggers.feedback_rpe | feedback_pain | feedback_week` with the constants above.
5. Later: session RPE × minutes (sRPE, Foster) as an alternative load for TSB when HR is missing (08-01 does this for
   kettlebell already); Hooper-style monotony/strain from sRPE.

## Sources

Peer-reviewed:

- Borg GA (1982). Psychophysical bases of perceived exertion. *Med Sci Sports Exerc* 14(5):377–381.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. *Med Sci Sports Exerc* 30(7):1164–1168.
- Foster C, Florhaug JA, Franklin J, et al. (2001). A new approach to monitoring exercise training. *J Strength Cond Res* 15(1):109–115.
- Fusco A, Sustercich W, Edgerton K, et al. (2020). Effect of progressive fatigue on session RPE. *J Funct Morphol Kinesiol* 5(1):15 — and Fusco A, Knutson C, King C, et al. (2020). Session RPE during prolonged exercise training. *Int J Sports Physiol Perform* 15(2):292–294.
- Haddad M, Stylianides G, Djaoui L, Dellal A, Chamari K (2017). Session-RPE method for training load monitoring: validity, ecological usefulness, and influencing factors. *Front Neurosci* 11:612.
- Hooper SL, Mackinnon LT (1995). Monitoring overtraining in athletes. Recommendations. *Sports Med* 20(5):321–327.
- Kellmann M, Bertollo M, Bosquet L, et al. (2018). Recovery and performance in sport: consensus statement. *Int J Sports Physiol Perform* 13(2):240–245.
- McLaren SJ, Macpherson TW, Coutts AJ, Hurst C, Spears IR, Weston M (2018). The relationships between internal and external measures of training load and intensity in team sports: a meta-analysis. *Sports Med* 48(3):641–658.
- Saw AE, Main LC, Gastin PB (2016). Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures: a systematic review. *Br J Sports Med* 50(5):281–291.
- Seiler KS, Kjerland GØ (2006). Quantifying training intensity distribution in elite endurance athletes: is there evidence for an "optimal" distribution? *Scand J Med Sci Sports* 16(1):49–56.
- Seiler S (2010). What is best practice for training intensity and duration distribution in endurance athletes? *Int J Sports Physiol Perform* 5(3):276–291.
- Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J (2007). Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study. *Am J Sports Med* 35(6):897–906.
- Thomeé R (1997). A comprehensive treatment approach for patellofemoral pain syndrome in women. *Phys Ther* 77(12):1690–1703.
- Yamato TP, Saragiotto BT, Lopes AD (2015). A consensus definition of running-related injury in recreational runners: a modified Delphi approach. *J Orthop Sports Phys Ther* 45(5):375–380.

Not verified in this session: page numbers of the two Fusco 2020 papers (cited from memory; the duration finding is the
one used); the exact Seiler & Kjerland session shares (quoted as ~75 %). No study tests an RPE cut-off for "easy too
hard" in runners — every threshold above is convention and should be tuned from the reference runner's own distribution after a few
months of data.
