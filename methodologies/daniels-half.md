---
id: daniels-half
name: Daniels (VDOT) – Halbmarathon
version: 2
distances: [half]
summary: >-
  Daniels' Laufformel für den Halbmarathon: Tempi aus einem aktuellen Wettkampf (VDOT), vier Phasen
  (Grundlage → Wiederholungen → Intervalle → Schwelle) und zwei Qualitätstage pro Woche. Schwerpunkt am Ende:
  Schwellentempo, das fast dem Halbmarathon-Renntempo entspricht.
sources:
  - { author: "Daniels, J.", year: 2014, title: "Daniels' Running Formula (3. Aufl.)", note: "VDOT-Tempi, Phasen I–IV, Grenzen je Einheit, Kapitel Halbmarathon" }
  - { author: "Daniels, J.", year: 2022, title: "Daniels' Running Formula (4. Aufl.)", note: "überarbeitete Ausgabe, gleiche Grundsätze" }
  - { author: "Bosquet, L., Montpetit, J., Arvisais, D. & Mujika, I.", year: 2007, title: "Effects of tapering on performance: a meta-analysis", note: "2 Wochen Taper, Umfang 41–60 % senken" }

phases:
  split: { base: 0.25, build: 0.50, peak: 0.25 }
  taper:
    weeks: { half: 2 }
    volume: [0.80, 0.55]

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
  build: { easy: 0.84, moderate: 0.07, hard: 0.09 }
  peak:  { easy: 0.80, moderate: 0.15, hard: 0.05 }
  taper: { easy: 0.82, moderate: 0.14, hard: 0.04 }

week:
  runs: 6
  key_sessions: { base: 0, build: 2, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.25, max_km: 26, max_minutes: 120 }

workouts:
  base:
    - { kind: easy, unit: km, from: 8, to: 12, note: "E-Tempo, Phase I" }
    - { kind: strides, unit: reps, from: 6, to: 8 }
    - { kind: long_easy, unit: km, from: 14, to: 22, note: "L-Lauf ≤ 25 % der Woche" }
  build:
    - { kind: strides, unit: reps, from: 8, to: 12, note: "Phase II: R-Wiederholungen 200–400 m, ≤ 5 % der Woche bzw. 8 km" }
    - { kind: intervals_vo2, unit: km, from: 4, to: 7, note: "Phase III: I-Einheiten, ≤ 8 % der Woche bzw. 10 km" }
    - { kind: threshold, unit: km, from: 5, to: 8, note: "Cruise-Intervalle, ≤ 10 % der Woche" }
    - { kind: long_easy, unit: km, from: 18, to: 24 }
  peak:
    - { kind: threshold, unit: km, from: 6, to: 10, note: "Phase IV: T-Blöcke bis 2 × 5 km bzw. 20–25 min am Stück" }
    - { kind: half_marathon_pace, unit: km, from: 6, to: 12, note: "Renntempo-Abschnitte, oft im Anschluss an T" }
    - { kind: intervals_vo2, unit: km, from: 4, to: 5, note: "kleine I-Erinnerung alle 2 Wochen" }
    - { kind: test, unit: km, from: 10, to: 15, note: "Vorbereitungswettkampf 10–15 km" }
  taper:
    - { kind: threshold, unit: km, from: 4, to: 6 }
    - { kind: strides, unit: reps, from: 6, to: 8 }

paces:
  source: vdot
  offsets:
    easy: 70
    recovery: 90
    long: 70
    marathon_pace: 14
    half_marathon_pace: 0
    threshold: -4
    intervals_vo2: -18
    strides: -33

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

Wie beim Daniels-Marathon: jeder Reiz mit genau dem Tempo, das ihn auslöst, alle Tempi aus einem aktuellen
Wettkampf (VDOT), vier Phasen, zwei Qualitätstage pro Woche. Beim Halbmarathon liegt das Renntempo nur wenige
Sekunden langsamer als das Schwellentempo (T ≈ Tempo, das man knapp eine Stunde halten kann). Deshalb ist T in der
letzten Phase die wichtigste Einheit, ergänzt durch Abschnitte im Renntempo.

## Für wen

Für erfahrene Läuferinnen und Läufer mit aktuellem Wettkampfergebnis, die 5–7 Mal pro Woche laufen (etwa 50–90 km in
der Spitze) und klare Tempovorgaben mögen. Gut geeignet für ein Zeitziel wie „unter 1:25“: Aus dem VDOT ergibt sich,
ob das Ziel realistisch ist, und alle Tempi passen dazu.

## Wochenaufbau

Sechs Läufe; zwei Q-Tage (z. B. Dienstag und Samstag), mindestens zwei lockere Tage dazwischen; Sonntag langer Lauf
im E-Tempo (in Phase IV gelegentlich Q). Daniels' Grenzen je Einheit gelten wie beim Marathon: L ≤ 25 % der Woche und
≤ 150 min (für den Halbmarathon reichen in der Regel 90–120 min, daher 120 min), T ≤ 10 %, I ≤ 8 % bzw. 10 km,
R ≤ 5 % bzw. 8 km.

## Phasen

Abbildung wie beim Marathon: **Grundlage = Phase I**, **Aufbau = Phase II + III**, **Spitze = Phase IV**
(25/50/25 %).

- **Phase I:** nur E, langer Lauf, Steigerungen.
- **Phase II:** R-Wiederholungen (Ökonomie, Tempogefühl).
- **Phase III:** I-Einheiten (VO2max) – die härteste Phase.
- **Phase IV:** T-Blöcke und Renntempo; ein Vorbereitungswettkampf über 10–15 km ist sinnvoll und liefert einen
  frischen VDOT.
- **Taper (2 Wochen):** 80 → 55 % der Spitze. Daniels' Halbmarathonpläne verkürzen in den letzten ein, zwei Wochen den
  Umfang bei gleicher Qualität; die Werte liegen im Bereich der Taper-Metaanalyse (Bosquet 2007).
- **Umfang:** stufenweise, Umfang 3–4 Wochen halten, dann höchstens ~10 % mehr (`ramp_max` 10 %). Jede vierte Woche
  15 % leichter als Annäherung an Daniels' schwankende Wochenumfänge.

## Anpassung

Verpasste km verfallen, eine verpasste Q-Einheit darf höchstens drei Tage später kommen. Bei TSB unter −25 oder ACWR
über 1,4 wird die nächste Q-Einheit locker gelaufen (70 % der km), bei hoher ACWR folgt eine Erholungswoche. Tempi
werden erst nach einem neuen Wettkampf (oder nach vier Wochen deutlich leichter Einheiten) um einen VDOT-Punkt
angehoben; deutlich weniger Umfang als geplant führt zuerst zur Prüfung des Ziels.

## Typische Einheiten

- **T:** 4–5 × 1,6 km T, 1 min Pause; später 2 × 4–5 km T oder 20–25 min am Stück.
- **T + Renntempo:** 3 km T, 3 min Trab, 5 km Halbmarathontempo.
- **I:** 5 × 1000 m I, 3 min Trab.
- **R:** 10 × 300 m R, 300 m Trab.
- **Langer Lauf:** 90–120 min E.

## Grenzen / Risiken

Das Schwellentempo verleitet dazu, zu schnell zu laufen – „comfortably hard“, nie Wettkampf. Ohne aktuelles
Wettkampfergebnis sind alle Tempi geraten. Phase III (I-Einheiten) ist der riskanteste Teil; bei Beschwerden lieber
auf T ausweichen.

## Quellen

- Daniels, J. (2014): *Daniels' Running Formula*, 3. Aufl. (Kapitel Halbmarathon, Phasen, Grenzen je Einheit).
- Daniels, J. (2022): *Daniels' Running Formula*, 4. Aufl.
- Bosquet, L. u. a. (2007): Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8).
