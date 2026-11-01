---
id: daniels-marathon
name: Daniels (VDOT) – Marathon
version: 2
distances: [marathon]
summary: >-
  Jack Daniels' Laufformel: alle Tempi aus einem aktuellen Wettkampf (VDOT), vier Phasen à etwa sechs Wochen
  (Grundlage → Wiederholungen → Intervalle → Schwelle/Marathontempo) und zwei Qualitätstage pro Woche („2Q“).
  Jede Einheitenart hat eine feste Obergrenze im Verhältnis zum Wochenumfang.
sources:
  - { author: "Daniels, J.", year: 2014, title: "Daniels' Running Formula (3. Aufl.)", note: "VDOT-Tempi E/M/T/I/R, Phasen I–IV, Grenzen je Einheit, 2Q-Marathonpläne (Kap. Marathon)" }
  - { author: "Daniels, J.", year: 2022, title: "Daniels' Running Formula (4. Aufl.)", note: "überarbeitete Ausgabe, gleiche Grundsätze" }
  - { author: "Bosquet, L., Montpetit, J., Arvisais, D. & Mujika, I.", year: 2007, title: "Effects of tapering on performance: a meta-analysis", note: "Taper: Umfang deutlich senken, Intensität halten" }
  - { author: "Gabbett, T. J.", year: 2016, title: "The training—injury prevention paradox: should athletes be training smarter and harder?", note: "ACWR als Belastungsgrenze" }

phases:
  split: { base: 0.25, build: 0.50, peak: 0.25 }
  taper:
    weeks: { marathon: 3 }
    volume: [0.80, 0.70, 0.45]

volume:
  start: 0.60
  phases:
    base: [0.60, 0.80]
    build: [0.80, 1.00]
    peak: [0.90, 1.00]
  ramp_max: 0.10
  recovery_week: { every: 4, volume: 0.85 }

intensity:
  base:  { easy: 0.97, moderate: 0.00, hard: 0.03 }
  build: { easy: 0.84, moderate: 0.06, hard: 0.10 }
  peak:  { easy: 0.78, moderate: 0.18, hard: 0.04 }
  taper: { easy: 0.80, moderate: 0.17, hard: 0.03 }

week:
  runs: 6
  key_sessions: { base: 0, build: 2, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.25, max_km: 32, max_minutes: 150 }

workouts:
  base:
    - { kind: easy, unit: km, from: 8, to: 14, note: "E-Tempo, Phase I: Grundlage und Verletzungsvorbeugung" }
    - { kind: strides, unit: reps, from: 6, to: 8, note: "ca. 20 s locker-schnell, volle Erholung" }
    - { kind: long_easy, unit: km, from: 16, to: 26, note: "L-Lauf: höchstens 25 % der Woche bzw. 150 min" }
  build:
    - { kind: strides, unit: reps, from: 8, to: 12, note: "Phase II: R-Wiederholungen 200–400 m im R-Tempo, höchstens 5 % der Woche bzw. 8 km" }
    - { kind: intervals_vo2, unit: km, from: 4, to: 8, note: "Phase III: I-Einheiten, 3–5 min je Wiederholung, höchstens 8 % der Woche bzw. 10 km" }
    - { kind: threshold, unit: km, from: 5, to: 9, note: "T-Tempo als Cruise-Intervalle (z. B. 5 × 1,6 km, 1 min Pause), höchstens 10 % der Woche" }
    - { kind: long_with_pace, unit: km, from: 8, to: 16, note: "Q1: langer Lauf mit M-Abschnitten" }
  peak:
    - { kind: long_with_pace, unit: km, from: 16, to: 22, note: "Phase IV: M-Blöcke im langen Lauf, höchstens 20 % der Woche bzw. 29 km" }
    - { kind: threshold, unit: km, from: 6, to: 10, note: "T-Blöcke, auch kombiniert mit M (z. B. 2 × (3 km T + 5 km M))" }
    - { kind: marathon_pace, unit: km, from: 10, to: 18 }
    - { kind: test, unit: km, from: 15, to: 21.1, note: "optionaler Vorbereitungswettkampf in Phase IV" }
  taper:
    - { kind: threshold, unit: km, from: 4, to: 6, note: "kurze T-Erinnerung" }
    - { kind: marathon_pace, unit: km, from: 6, to: 10 }

paces:
  source: vdot
  offsets:
    easy: 60
    recovery: 75
    long: 60
    marathon_pace: 0
    half_marathon_pace: -12
    threshold: -14
    intervals_vo2: -33
    strides: -48

adaptation:
  thresholds: { tsb_fatigue: -25, acwr_caution: 1.4 }
  fatigue: { share: 0.7, days: 3 }
  missed_km: { strategy: drop, cap_pct: 0.30, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 3 }
  volume_review: { weeks: 4, below: 0.85, above: 1.10 }
  events: { pre_easy_days: { short: 1, half: 2, long: 3 }, post_easy: { per_km: 3, min: 2 } }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: recovery_week_insertion
    volume_below: goal_adjustment
    volume_above: volume_adjustment
---

## Idee

Trainiere jeden Reiz mit genau dem Tempo, das ihn auslöst – nicht schneller. Daniels leitet aus einem aktuellen
Wettkampfergebnis einen Leistungswert (VDOT) ab und daraus fünf Tempi: locker (E), Marathon (M), Schwelle (T),
Intervall (I) und Wiederholung (R). Die Saison folgt vier Phasen, und jede Einheitenart hat eine feste Obergrenze im
Verhältnis zum Wochenumfang. Zwei Qualitätstage pro Woche („2Q“), der Rest ist lockerer Umfang.

## Für wen

Für Läuferinnen und Läufer mit mindestens einem Jahr regelmäßigem Training und einem aktuellen Wettkampfergebnis
(5 km bis Halbmarathon), die nach klaren Zahlen trainieren wollen. Daniels' 2Q-Pläne gibt es für viele Umfangsstufen;
diese Vorlage zielt auf 5–7 Läufe und etwa 70–110 km in der Spitze. Wer wenig Zeit hat, kommt mit 5 Läufen aus – die
Qualitätstage bleiben gleich, nur der lockere Umfang sinkt.

## Wochenaufbau

Sechs Läufe: Q1 ist meist der lange Lauf mit Marathontempo-Abschnitten (Wochenende), Q2 ein T- oder I-Tag mitten in der
Woche. Dazwischen mindestens zwei lockere Tage. Lockere Läufe dürfen Steigerungen enthalten. Daniels' Obergrenzen je
Einheit (auf die Woche bezogen): L-Lauf ≤ 25 % (bei unter ~65 km/Woche bis 30 %) und ≤ 150 min; M ≤ 20 % bzw. 29 km;
T ≤ 10 %; I ≤ 8 % bzw. 10 km; R ≤ 5 % bzw. 8 km. Die Vorlage kann nur die Grenze des langen Laufs abbilden (25 %,
150 min); die übrigen stehen als Hinweis an den Einheiten.

## Phasen

Daniels' Idealsaison hat 24 Wochen, vier Phasen à sechs Wochen. Die Vorlage bildet sie so ab: **Grundlage = Phase I**,
**Aufbau = Phase II + III**, **Spitze = Phase IV** (Anteile 25/50/25 % der Wochen vor dem Taper).

- **Phase I – Grundlage (Foundation):** nur E-Läufe, langer Lauf, Steigerungen. Keine Schlüsseleinheiten.
- **Phase II – frühe Qualität:** R-Wiederholungen für Laufökonomie und Tempogefühl, kleiner Umfang.
- **Phase III – Übergangsqualität:** die härteste Phase; I-Einheiten (3–5 min) für die VO2max, dazu T.
- **Phase IV – finale Qualität:** wettkampfspezifisch; T-Blöcke und lange M-Abschnitte im langen Lauf.
- **Taper (3 Wochen):** 80 → 70 → 45 % der Spitze, Qualität bleibt kurz erhalten. Daniels nennt keinen einheitlichen
  Prozentsatz für alle Pläne; die Werte sind eine Vorgabe im Rahmen der Taper-Metaanalyse (Bosquet 2007: Umfang um
  41–60 % senken, Intensität halten).
- **Umfang:** Daniels steigert stufenweise – einen Umfang mindestens drei bis vier Wochen halten, dann um höchstens
  ~1,5 km pro Lauf und Woche erhöhen (bei sechs Läufen ≈ 10 %). Deshalb `ramp_max` 10 %. Feste Erholungswochen
  schreibt Daniels nicht vor; die 2Q-Pläne schwanken aber zwischen 70 und 100 % der Spitze. Jede vierte Woche um 15 %
  leichter bildet das näherungsweise ab.
- Hat ein Plan weniger als 24 Wochen, kürzt Daniels zuerst die mittleren Phasen; Grundlage und Phase IV haben Vorrang
  (Runmate teilt die Wochen bisher anteilig auf; diese Priorität ist noch nicht einstellbar).

## Anpassung

Daniels' Grundsatz: Verpasstes wird nicht nachgeholt, schon gar nicht doppelt. Verpasste Kilometer verfallen daher
(`drop`). Eine verpasste Qualitätseinheit darf höchstens drei Tage später kommen, sonst entfällt sie. Bei Ermüdung
(TSB unter −25 oder ACWR über 1,4) wird die nächste Q-Einheit zum lockeren Lauf (70 % der km); bei hoher ACWR schiebt
Runmate eine Erholungswoche ein. Liegt der Umfang vier Wochen lang mehr als 15 % unter dem Plan, wird zuerst das
Ziel (VDOT) geprüft – Daniels passt Tempi nur nach einem neuen Wettkampf oder nach mehreren Wochen problemlosen
Trainings an, nie aus einem einzelnen Lauf.

## Typische Einheiten

- **E-Lauf** 45–80 min, Gespräch möglich, plus 6–8 Steigerungen.
- **R:** 8–12 × 200–400 m im R-Tempo, Trabpause so lang wie die Belastung.
- **I:** 5 × 1000 m oder 4 × 1200 m im I-Tempo, Trabpause etwas kürzer als die Belastung.
- **T (Cruise-Intervalle):** 5 × 1,6 km im T-Tempo, 1 min Pause – oder 20 min am Stück.
- **Q1 Marathon:** 2 × 8 km M mit 1,6 km E dazwischen, später bis 22 km M-Anteil im langen Lauf.

## Grenzen / Risiken

VDOT-Tempi sind Rechenwerte: Bei Hitze, Hügeln oder schlechtem Tag gilt die Anstrengung, nicht die Uhr. Die Tempi
passen nur, wenn das Wettkampfergebnis aktuell und echt ist. Phase III ist hart – wer Verletzungen neigt, sollte die
I-Einheiten kürzen statt verschieben. Die Grenzen pro Einheitenart werden von Runmate noch nicht geprüft (Lücke).

## Quellen

- Daniels, J. (2014): *Daniels' Running Formula*, 3. Aufl. – VDOT-Tabellen, Phasen I–IV, Grenzen je Einheit,
  2Q-Marathonpläne.
- Daniels, J. (2022): *Daniels' Running Formula*, 4. Aufl.
- Bosquet, L. u. a. (2007): Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8).
- Gabbett, T. J. (2016): The training—injury prevention paradox. *Br J Sports Med* 50(5).
