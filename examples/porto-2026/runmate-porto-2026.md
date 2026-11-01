---
id: runmate-porto-2026
name: Runmate / Porto 2026
version: 1
distances: [marathon]
summary: >-
  Ein echter Plan für den Porto-Marathon 2026 (Ziel 3:05) in Zahlen: sechs Läufe pro Woche, dienstags Qualität, samstags
  der lange Lauf, jede vierte Woche leichter, drei Wochen Taper. Vorwiegend locker, Marathon- und Schwellentempo im
  Aufbau, wenige schnelle Einheiten.
sources:
  - { author: "Pfitzinger, P. & Douglas, S.", year: 2009, title: "Advanced Marathoning (2. Aufl.)", note: "lange Läufe mit Marathontempo-Block, Schwellenläufe" }
  - { author: "Seiler, S.", year: 2010, title: "What is best practice for training intensity and duration distribution in endurance athletes?", note: "überwiegend lockerer Umfang" }
  - { author: "Mujika, I. & Padilla, S.", year: 2003, title: "Scientific bases for precompetition tapering strategies", note: "Umfang im Taper senken, Intensität halten" }
  - { author: "Gabbett, T. J.", year: 2016, title: "The training—injury prevention paradox", note: "ACWR als Belastungsgrenze" }

phases:
  split: { base: 0.29, build: 0.47, peak: 0.24 }
  taper:
    weeks: { marathon: 3 }
    volume: [0.70, 0.56, 0.24]

volume:
  start: 0.51
  phases:
    base: [0.51, 0.70]
    build: [0.76, 0.90]
    peak: [0.83, 0.89]
  ramp_max: 0.12
  recovery_week: { every: 4, volume: 0.72 }

intensity:
  base:  { easy: 0.95, moderate: 0.05, hard: 0.00 }
  build: { easy: 0.81, moderate: 0.12, hard: 0.07 }
  peak:  { easy: 0.79, moderate: 0.19, hard: 0.02 }
  taper: { easy: 0.80, moderate: 0.20, hard: 0.00 }

week:
  runs: 6
  key_sessions: { base: 0, build: 2, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.33, max_km: 41, max_minutes: 240 }

workouts:
  base:
    - { kind: long_easy, unit: km, from: 21, to: 29 }
    - { kind: threshold, unit: km, from: 9, to: 10, note: "Schwelle 4:10–4:18" }
    - { kind: strides, unit: reps, from: 6, to: 8 }
  build:
    - { kind: threshold, unit: km, from: 11, to: 14 }
    - { kind: long_with_pace, unit: km, from: 6, to: 12, note: "letzte km im Marathontempo, Verpflegung üben" }
    - { kind: intervals_vo2, unit: km, from: 8, to: 8, note: "8 × 1 km" }
    - { kind: half_marathon_pace, unit: km, from: 7.5, to: 14 }
    - { kind: progression, unit: km, from: 9, to: 14 }
  peak:
    - { kind: marathon_pace, unit: km, from: 10, to: 15, note: "Renntempo-Blöcke, Longrun mit Renntempo" }
    - { kind: threshold, unit: km, from: 10, to: 10 }
    - { kind: test, unit: km, from: 20, to: 20, note: "Generalprobe: 20 km im Renntempo" }
  taper:
    - { kind: marathon_pace, unit: km, from: 4, to: 8, note: "kurze Renntempo-Erinnerungen" }
    - { kind: test, unit: km, from: 21.1, to: 21.1, note: "Halbmarathon im Renntempo als finaler Test" }

paces:
  source: goal_time
  offsets:
    easy: 82
    long: 82
    marathon_pace: 0
    threshold: -8
    half_marathon_pace: -22
    intervals_vo2: -28

adaptation:
  thresholds: { tsb_fatigue: -25, acwr_caution: 1.5 }
  fatigue: { share: 0.7, days: 3 }
  missed_km: { strategy: redistribute, cap_pct: 0.30, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 7 }
  volume_review: { weeks: 3, below: 0.85, above: 1.15 }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: intensity_reduction
    volume_below: volume_adjustment
    volume_above: volume_adjustment
---

## Idee

Ein Marathonplan mit viel lockerem Umfang und wenigen, gezielten Qualitätseinheiten. Der Großteil der Kilometer läuft in
Zone 2 (5:45/km). Qualität heißt hier vor allem Marathon- und Schwellentempo: Blöcke im Renntempo, lange Läufe, deren
letzte Kilometer im Marathontempo laufen, und Schwellenläufe knapp schneller als das Renntempo. Schnelle Intervalle
kommen nur im Aufbau vor. Das Ziel ist, das Renntempo lange ruhig halten zu können – nicht, möglichst schnell zu werden.

## Wochenaufbau

Sechs Läufe pro Woche: Montag locker · Dienstag Qualität · Mittwoch locker · Donnerstag locker, oft mit Steigerungen ·
Freitag locker oder Ruhe · Samstag der lange Lauf · Sonntag Ruhe bzw. Regeneration. Zwei Schlüsseleinheiten pro Woche im
Aufbau und in der Spitze (Dienstag + Samstag), mindestens zwei Tage dazwischen. Der lange Lauf macht bis zu einem Drittel der
Woche aus und erreicht im Original-Plan 41 km.

## Phasen

- **Grundlage** (gut ein Viertel der Wochen): Umfang von der Hälfte auf rund 70 % der Spitze, lange Läufe 21–29 km,
  eine Schwelleneinheit, Steigerungen.
- **Aufbau** (knapp die Hälfte): Umfang bis zur Spitze (126 km), Schwelle 11–14 km, lange Läufe mit Marathontempo-Block,
  Halbmarathontempo und einmal kurze Intervalle.
- **Spitze** (die letzten vier Wochen vor dem Taper): Renntempo-Blöcke, Longrun mit 15 km im Renntempo, Generalprobe.
- **Taper** (drei Wochen): 70 → 56 → 24 % der Spitze, die Intensität bleibt mit kurzen Renntempo-Erinnerungen erhalten;
  der Halbmarathon zwei Wochen vor dem Rennen ist der finale Test.
- Jede vierte Woche ist rund 28 % leichter; von Woche zu Woche steigt der Umfang höchstens um 12 %.

## Anpassung

Verpasste Kilometer einer Woche gehen auf ihre übrigen lockeren Tage (höchstens +30 % bzw. +5 km pro Tag). Verpasste
Schlüsseleinheiten werden innerhalb einer Woche nachgeholt, mit zwei Tagen Abstand zur nächsten. Bei TSB unter −25 oder
ACWR über 1,5 wird die nächste harte Einheit zum lockeren Lauf (70 % der km). Liegt der Umfang der letzten drei Wochen
15 % unter dem Plan, wird der weitere Umfang angepasst; 15 % darüber und frisch, darf es etwas mehr werden.

## Besonderheiten dieses Plans

Die Zahlen sind aus dem echten Plan gemessen: dem ursprünglichen Plan bis 27.9. und dem nach der Unterbrechung (KW38/39)
neu aufgebauten Plan ab 28.9. Daher gibt es zwei leichte Wochen hintereinander (KW38/39) und eine zweite Spitze von
112 km in KW42; die „Spitze“-Phase beginnt mit der zweiten leichten Woche. Der Taper zählt drei Wochen, weil die Woche des
Hella-Halbmarathons (KW43) schon deutlich leichter ist.

<!-- explained: -->
