---
id: runmate-own-10k
name: Eigene Methode – 10 km
version: 1
distances: [10k]
summary: >-
  Neutrale Grundlage ohne Buchmethode: jeder Wert ist die Konvention aus den Runmate-Recherchen
  (methodologies/research/). Startpunkt für „Ohne Vorlage – eigene Methode“: alle Werte lassen sich ändern.
sources:
  - { author: "Seiler, S.", year: 2010, title: "What is best practice for training intensity and duration distribution in endurance athletes?", note: "≥ 80 % locker (workouts-and-intensity.md §1)" }
  - { author: "Bosquet, L., Montpetit, J., Arvisais, D. & Mujika, I.", year: 2007, title: "Effects of tapering on performance: a meta-analysis", note: "Taper 2 Wochen, Umfang −41–60 % (phases-and-taper.md §2)" }
  - { author: "Daniels, J.", year: 2014, title: "Daniels' Running Formula (3. Aufl.)", note: "Einheiten-Obergrenzen und Tempo-Abstände (workouts-and-intensity.md §3, paces.md)" }

phases:
  split: { base: 0.30, build: 0.40, peak: 0.30 }        # phases-and-taper.md §1.1 (Konvention)
  taper:
    weeks: { 10k: 1 }                              # phases-and-taper.md §2.4
    volume: [0.60]                          # §2.4; Rennwoche höchstens 60 % (Sicherheitsgrenze)

volume:
  start: 0.70                                       # peak-and-recovery.md §1.4
  phases:
    base: [0.70, 0.90]
    build: [0.88, 1.00]
    peak: [0.92, 1.00]
  ramp_max: 0.10                                    # peak-and-recovery.md §1.5
  recovery_week: { every: 4, volume: 0.80 }         # load-cycles.md: 3 Belastungswochen + 1 Erholung

intensity:                                          # workouts-and-intensity.md §4
  base:  { easy: 0.90, moderate: 0.08, hard: 0.02 }
  build: { easy: 0.82, moderate: 0.12, hard: 0.06 }
  peak:  { easy: 0.80, moderate: 0.06, hard: 0.14 }
  taper: { easy: 0.85, moderate: 0.10, hard: 0.05 }

week:                                               # week-layout.md §5, long-run.md §4
  runs: 6
  key_sessions: { base: 1, build: 2, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.25, max_km: 18, max_minutes: 100 }

workouts:                                           # workouts-and-intensity.md §2.2
  base:
    - { kind: long_easy, unit: km, from: 12, to: 16 }
    - { kind: strides, unit: reps, from: 6, to: 10, note: "6–10 × 20 s im lockeren Lauf" }
    - { kind: hills, unit: reps, from: 8, to: 12, note: "8–12 × 30–60 s bergauf" }
    - { kind: threshold, unit: km, from: 4, to: 6, note: "15 → 25 min am Stück" }
  build:
    - { kind: intervals_vo2, unit: km, from: 5, to: 7, note: "5 → 8 × 1000 m oder 4 → 6 × 1200 m" }
    - { kind: threshold, unit: km, from: 5, to: 7, note: "20 → 30 min" }
    - { kind: long_easy, unit: km, from: 14, to: 18 }
  peak:
    - { kind: intervals_vo2, unit: km, from: 6, to: 8, note: "6 → 8 × 1000 m im 10-km-Tempo, auch 3 × 2 km" }
    - { kind: threshold, unit: km, from: 5, to: 6, note: "20 min" }
    - { kind: test, unit: km, from: 5, to: 5, note: "5-km-Rennen" }
  taper:
    - { kind: intervals_vo2, unit: km, from: 3, to: 4, note: "kurz, Tempo halten" }

paces:                                              # paces.md §1.2: Tempo aus der Zielzeit
  source: goal_time
  offsets:
    easy: 75
    recovery: 95
    long: 65
    marathon_pace: 25
    half_marathon_pace: 12
    threshold: 8
    intervals_vo2: -8
    strides: -25

adaptation:                                         # adaptation.md §1–3, §6
  thresholds: { tsb_fatigue: -25, acwr_caution: 1.5 }
  fatigue: { share: 0.7, days: 3 }
  missed_km: { strategy: drop, cap_pct: 0.30, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 3 }
  volume_review: { weeks: 3, below: 0.85, above: 1.10 }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: intensity_reduction
    volume_below: volume_adjustment
    volume_above: volume_adjustment
---

# Eigene Methode – 10 km

Keine Buchmethode, sondern ein neutraler Startpunkt: jeder Wert ist die Konvention aus den Runmate-Recherchen
(`methodologies/research/`, Abschnitt jeweils im YAML-Kopf vermerkt). Die Woche ist pyramidal (mindestens 80 % locker),
mit einer Schlüsseleinheit in der Grundlage und zwei im Aufbau und in der Spitze, alle vier Wochen eine Erholungswoche
und einem Taper nach Bosquet 2007.

Unter „Neuer Plan → Ohne Vorlage – eigene Methode“ lässt sich jeder Wert ändern; geprüft wird wie bei jeder Vorlage
(Schema und feste Sicherheitsgrenzen).
