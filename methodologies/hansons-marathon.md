---
id: hansons-marathon
name: Hansons – Marathon
version: 2
distances: [marathon]
summary: >-
  Hansons Marathon Method: kumulative Ermüdung statt Riesen-Longrun. Sechs Läufe pro Woche, drei „SOS“-Einheiten
  (Speed bzw. Strength, Tempo im Marathontempo, langer Lauf), der lange Lauf endet bei 26 km (16 Meilen) und höchstens
  einem Viertel bis knapp einem Drittel der Woche.
sources:
  - { author: "Humphrey, L., Hanson, K. & Hanson, K.", year: 2012, title: "Hansons Marathon Method: A Renegade Path to Your Fastest Marathon", note: "kumulative Ermüdung, SOS-Einheiten, Longrun ≤ 16 Meilen, Speed- und Strength-Phase, 10-Tage-Taper" }
  - { author: "Mujika, I. & Padilla, S.", year: 2003, title: "Scientific bases for precompetition tapering strategies", note: "Umfang senken, Intensität halten" }
  - { author: "Gabbett, T. J.", year: 2016, title: "The training—injury prevention paradox: should athletes be training smarter and harder?", note: "ACWR" }

phases:
  split: { base: 0.31, build: 0.31, peak: 0.38 }
  taper:
    weeks: { marathon: 2 }
    volume: [0.85, 0.45]

volume:
  start: 0.55
  phases:
    base: [0.55, 0.80]
    build: [0.85, 0.97]
    peak: [0.97, 1.00]
  ramp_max: 0.12
  recovery_week: { every: 6, volume: 0.90 }

intensity:
  base:  { easy: 0.98, moderate: 0.00, hard: 0.02 }
  build: { easy: 0.76, moderate: 0.16, hard: 0.08 }
  peak:  { easy: 0.73, moderate: 0.27, hard: 0.00 }
  taper: { easy: 0.75, moderate: 0.25, hard: 0.00 }

week:
  runs: 6
  key_sessions: { base: 0, build: 3, peak: 3, taper: 2 }
  key_gap_days: 2
  long_run: { share: 0.30, max_km: 26, max_minutes: 180, race_pace: false }

workouts:
  base:
    - { kind: easy, unit: km, from: 6, to: 10, note: "Einstiegswochen nur locker, Umfang aufbauen" }
    - { kind: long_easy, unit: km, from: 10, to: 16 }
    - { kind: strides, unit: reps, from: 4, to: 6 }
  build:
    - { kind: intervals_vo2, unit: km, from: 4.8, to: 4.8, note: "Speed: 12 × 400 m → 8 × 600 m → 6 × 800 m → 4 × 1200 m → 3 × 1600 m im 5- bis 10-km-Tempo" }
    - { kind: marathon_pace, unit: km, from: 8, to: 13, note: "Tempo: 5 → 8 Meilen im Marathon-Zieltempo" }
    - { kind: long_easy, unit: km, from: 16, to: 24, note: "lockerer langer Lauf, nicht langsamer als nötig" }
  peak:
    - { kind: threshold, unit: km, from: 9.6, to: 9.6, note: "Strength: 6 × 1 Meile → 4 × 1,5 Meilen → 3 × 2 Meilen → 2 × 3 Meilen, Marathontempo − 10 s/Meile" }
    - { kind: marathon_pace, unit: km, from: 13, to: 16, note: "Tempo: 8 → 10 Meilen im Marathon-Zieltempo" }
    - { kind: long_easy, unit: km, from: 24, to: 26, note: "höchstens 16 Meilen, ≤ 25–30 % der Woche" }
  taper:
    - { kind: threshold, unit: km, from: 9.6, to: 9.6, note: "letzte Strength-Einheit ca. 10 Tage vor dem Rennen" }
    - { kind: marathon_pace, unit: km, from: 5, to: 16, note: "letztes langes Tempo ca. 10 Tage vorher, danach kurz" }

paces:
  source: goal_time
  offsets:
    easy: 55
    recovery: 75
    long: 40
    marathon_pace: 0
    threshold: -6
    intervals_vo2: -30
    strides: -45

adaptation:
  thresholds: { tsb_fatigue: -30, acwr_caution: 1.5 }
  fatigue: { share: 0.6, days: 3 }
  missed_km: { strategy: drop, cap_pct: 0.30, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 2 }
  volume_review: { weeks: 3, below: 0.85, above: 1.10 }
  events: { test_window_days: 14 }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_swapping
    fatigue_tsb: intensity_reduction
    acwr_high: intensity_reduction
    volume_below: volume_adjustment
    volume_above: volume_adjustment
---

## Idee

Der Marathon wird nicht im einen 35-km-Lauf gewonnen, sondern in der Summe der Woche: Sechs Läufe, drei davon
fordernd („Something of Substance“), und nie ganz erholt. Diese **kumulative Ermüdung** soll die letzten
26 km des Marathons simulieren – deshalb endet der lange Lauf bei 16 Meilen (26 km). Ein großer Teil der Qualität
läuft im Marathon-Zieltempo oder knapp darunter.

## Für wen

Für Läuferinnen und Läufer, die sechs Tage pro Woche laufen können, aber keine 3-Stunden-Läufe wollen oder
vertragen. Gut für Berufstätige: Kein Lauf ist länger als ~2,5 Stunden. Die Pläne zielen auf etwa 90–100 km in der
Spitze (Einsteigerplan ~57 Meilen, Fortgeschrittene ~63 Meilen). Wer bisher mit wenigen langen Läufen trainiert hat,
muss sich an die vielen mittleren Tage gewöhnen.

## Wochenaufbau

Montag locker · Dienstag SOS 1 (Speed bzw. Strength) · Mittwoch Ruhe · Donnerstag SOS 2 (Tempo im Marathontempo) ·
Freitag locker · Samstag locker · Sonntag SOS 3 (langer Lauf). Der Tag vor dem langen Lauf ist bewusst nicht frei.
Der lange Lauf ist höchstens 25–30 % der Woche und höchstens 2,5–3 Stunden; bei höherem Umfang wird er also nicht
länger, die Woche wird dichter.

## Phasen

Der 18-Wochen-Plan teilt sich in Einstieg, Speed-Phase und Strength-Phase; die Tempoeinheit läuft ab dem Ende des
Einstiegs durchgehend mit und wird länger.

- **Grundlage (Einstieg, ca. 5 Wochen):** nur lockere Läufe, Umfang aufbauen (im Fortgeschrittenenplan entfällt der
  Einstieg weitgehend).
- **Aufbau (Speed, ca. 5 Wochen):** Intervalle im 5- bis 10-km-Tempo, insgesamt immer ~4,8 km (3 Meilen) schnelle
  Strecke; Tempo 5–8 Meilen im Marathontempo.
- **Spitze (Strength, ca. 6–7 Wochen):** längere Wiederholungen 10 s/Meile schneller als Marathontempo (immer ~6
  Meilen), Tempo bis 10 Meilen, lange Läufe bis 16 Meilen. Der Umfang bleibt fast konstant auf der Spitze.
- **Taper (ca. 10 Tage, hier 2 Wochen):** letzte SOS-Einheiten etwa 10 Tage vor dem Rennen, danach nur locker und
  kurz. 85 → 45 % der Spitze.
- **Keine geplanten Erholungswochen:** Hansons baut bewusst keine leichten Wochen ein (kumulative Ermüdung). Runmate
  verlangt einen Wert und erlaubt höchstens 5 Belastungswochen am Stück; `every: 6` mit 10 % weniger ist die
  schwächste Einstellung innerhalb dieser Grenze (Recherche load-cycles.md). `ramp_max` 12 %.
- **Lange Läufe ohne Renntempo:** das Marathontempo kommt im Tempo-Lauf unter der Woche, der lange Lauf bleibt locker
  (`long_run.race_pace: false`).

## Anpassung

Hansons: Verpasste Kilometer werden nicht nachgeholt, eine verpasste SOS-Einheit wird höchstens um ein, zwei Tage
verschoben oder gegen die nächste getauscht – nie zwei SOS hintereinander. Ermüdung gehört zur Methode, daher
greift die Ermüdungsregel erst bei TSB unter −30; dann wird die nächste SOS-Einheit deutlich entschärft (60 % der km
locker). Liegt der Umfang drei Wochen lang 15 % unter Plan, wird der Umfang reduziert.

## Typische Einheiten

- **Speed:** 6 × 800 m im 5–10-km-Tempo, 400 m Trab.
- **Strength:** 3 × 2 Meilen (3,2 km) bei Marathontempo − 6 s/km, 800 m Trab.
- **Tempo:** 2–3 km ein, 13–16 km im Marathon-Zieltempo, 2 km aus.
- **Langer Lauf:** 24–26 km locker bis moderat.
- **Lockere Tage:** 1–2 min/Meile (≈ 40–75 s/km) langsamer als Marathontempo.

## Grenzen / Risiken

Sechs Tage pro Woche ohne Pause sind Pflicht; fällt ein Tag regelmäßig aus, bricht die Logik. Der kurze lange Lauf
ist mental ungewohnt, und es gibt keine Verpflegungsprobe über 30 km – die sollte man in einem langen Tempo-Lauf
gezielt üben. Für schnelle Läufer (unter ~3:00) ist der 26-km-Lauf zeitlich kurz; Hansons nimmt das bewusst in Kauf. Die feste km-Summe der Speed- und
Strength-Einheiten ist im Schema nur als Hinweis abbildbar.

## Quellen

- Humphrey, L. mit Hanson, K. & Hanson, K. (2012): *Hansons Marathon Method*. VeloPress (überarbeitete Auflage 2016).
- Mujika, I. & Padilla, S. (2003): Scientific bases for precompetition tapering strategies. *Med Sci Sports Exerc* 35(7).
- Gabbett, T. J. (2016): The training—injury prevention paradox. *Br J Sports Med* 50(5).
