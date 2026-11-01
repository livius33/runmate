---
id: polarized-80-20-half
name: 80/20 polarisiert – Halbmarathon
version: 2
distances: [half]
summary: >-
  80 % locker, 20 % intensiv: Der Großteil des Trainings liegt klar unter der ersten Schwelle, die Qualität ist
  wirklich schnell (Intervalle) oder gezielt im Renntempo – wenig „graue Zone“ dazwischen. Nach Seilers Forschung zur
  Intensitätsverteilung und Fitzgeralds 80/20 Running.
sources:
  - { author: "Seiler, S.", year: 2010, title: "What is best practice for training intensity and duration distribution in endurance athletes?", note: "ca. 80 % niedrige Intensität bei Spitzenathleten" }
  - { author: "Seiler, K. S. & Kjerland, G. Ø.", year: 2006, title: "Quantifying training intensity distribution in elite endurance athletes: is there evidence for an optimal distribution?", note: "polarisiertes Muster, wenig Schwellentraining" }
  - { author: "Esteve-Lanao, J., Foster, C., Seiler, S. & Lucia, A.", year: 2007, title: "Impact of training intensity distribution on performance in endurance athletes", note: "mehr lockerer Anteil → größere Verbesserung (Läufer, 5 Monate)" }
  - { author: "Stöggl, T. & Sperlich, B.", year: 2014, title: "Polarized training has greater impact on key endurance variables than threshold, high intensity, or high volume training", note: "9 Wochen, gut trainierte Ausdauersportler" }
  - { author: "Muñoz, I., Seiler, S., Bautista, J., España, J., Larumbe, E. & Esteve-Lanao, J.", year: 2014, title: "Does polarized training improve performance in recreational runners?", note: "Freizeitläufer, 10 km; Hauptvergleich nicht signifikant" }
  - { author: "Fitzgerald, M.", year: 2014, title: "80/20 Running: Run Stronger and Race Faster by Training Slower", note: "Übertragung auf Freizeitläufer, Zonen, Pläne 5 km bis Marathon" }

phases:
  split: { base: 0.35, build: 0.40, peak: 0.25 }
  taper:
    weeks: { half: 2 }
    volume: [0.75, 0.50]

volume:
  start: 0.65
  phases:
    base: [0.65, 0.85]
    build: [0.85, 1.00]
    peak: [0.92, 1.00]
  ramp_max: 0.10
  recovery_week: { every: 3, volume: 0.80 }

intensity:
  base:  { easy: 0.90, moderate: 0.04, hard: 0.06 }
  build: { easy: 0.82, moderate: 0.06, hard: 0.12 }
  peak:  { easy: 0.80, moderate: 0.12, hard: 0.08 }
  taper: { easy: 0.82, moderate: 0.10, hard: 0.08 }

week:
  runs: 6
  key_sessions: { base: 1, build: 2, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.30, max_km: 24, max_minutes: 120 }

workouts:
  base:
    - { kind: easy, unit: km, from: 6, to: 12, note: "Zone 1–2: klar unter der ersten Schwelle" }
    - { kind: strides, unit: reps, from: 6, to: 10, note: "kurze Sprints/Steigerungen, Laufökonomie" }
    - { kind: hills, unit: reps, from: 6, to: 10, note: "kurze Hügelsprints 10–20 s" }
    - { kind: long_easy, unit: km, from: 14, to: 20 }
  build:
    - { kind: intervals_vo2, unit: km, from: 4, to: 7, note: "z. B. 5 × 1000 m / 6 × 3 min, klar über der zweiten Schwelle" }
    - { kind: hills, unit: reps, from: 6, to: 10, note: "Hügelintervalle 60–90 s" }
    - { kind: progression, unit: km, from: 10, to: 14, note: "locker, letzte 2–3 km zügig" }
    - { kind: long_easy, unit: km, from: 18, to: 24 }
  peak:
    - { kind: half_marathon_pace, unit: km, from: 6, to: 12, note: "rennspezifisch: 3 × 3 km → 2 × 6 km im Renntempo" }
    - { kind: intervals_vo2, unit: km, from: 4, to: 5 }
    - { kind: long_with_pace, unit: km, from: 4, to: 8, note: "langer Lauf, Schluss im Renntempo" }
    - { kind: test, unit: km, from: 10, to: 10, note: "10-km-Testrennen" }
  taper:
    - { kind: half_marathon_pace, unit: km, from: 3, to: 5 }
    - { kind: strides, unit: reps, from: 6, to: 8 }

paces:
  source: goal_time
  offsets:
    easy: 75
    recovery: 95
    long: 70
    marathon_pace: 15
    half_marathon_pace: 0
    threshold: -5
    intervals_vo2: -22
    strides: -40

adaptation:
  thresholds: { tsb_fatigue: -20, acwr_caution: 1.3 }
  fatigue: { share: 0.7, days: 3 }
  missed_km: { strategy: redistribute, cap_pct: 0.25, cap_km: 4 }
  missed_key: { strategy: move, max_shift_days: 3 }
  volume_review: { weeks: 3, below: 0.85, above: 1.15 }
  return: { week2_quality: easy }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: recovery_week_insertion
    volume_below: volume_adjustment
    volume_above: volume_adjustment
---

## Idee

**80 % locker, 20 % intensiv.** Seiler fand in Analysen von Spitzenathleten aus Laufen, Rudern, Langlauf und
Radsport immer wieder dieselbe Verteilung: etwa 80 % der Einheiten klar unter der ersten (aeroben) Schwelle, der Rest
deutlich darüber – und überraschend wenig dazwischen. Locker heißt wirklich locker, hart heißt wirklich hart. Das
schützt vor dem häufigsten Fehler von Freizeitläufern: jeden Lauf „etwas zügig“ zu laufen.

## Für wen

Für alle Leistungsstufen; besonders für Läuferinnen und Läufer, die bisher zu viele Läufe im mittleren Bereich
gelaufen sind, und für Menschen mit begrenzter Zeit (5–6 Läufe, 40–80 km in der Spitze). Fitzgerald bietet Pläne
in mehreren Stufen; die Vorlage zielt auf die mittlere Stufe mit sechs Läufen.

## Wochenaufbau

Sechs Läufe, zwei Schlüsseleinheiten (z. B. Dienstag Intervalle, Freitag Renntempo bzw. Hügel), Sonntag langer Lauf
locker. Die 80/20-Regel gilt bei Seiler und Fitzgerald nach **Zeit** bzw. Einheiten; nach Kilometern ist der lockere
Anteil etwas kleiner, weil schnelle km kürzer dauern. Die Vorlage gibt Anteile nach km an (Runmate rechnet in km):
82/6/12 im Aufbau entspricht nach Zeit etwa 85/15.

## Phasen

- **Grundlage (35 %):** fast nur locker, dazu Steigerungen und kurze Hügelsprints (neuromuskulär, kaum Ermüdung).
- **Aufbau (40 %):** polarisiert – VO2max-Intervalle und Hügelintervalle als harte Einheiten, sonst locker. Kaum
  Schwellentraining.
- **Spitze (25 %):** rennspezifisch. Seiler beschreibt, dass die Verteilung vor Wettkämpfen „pyramidaler“ wird
  (mehr Renntempo); deshalb wächst der moderate Anteil auf 12 % (Renntempo-Blöcke), die Intervalle werden weniger.
- **Taper (2 Wochen):** 75 → 50 % der Spitze, kurze Renntempo-Erinnerungen und Steigerungen (Bosquet 2007:
  ~2 Wochen, Umfang 41–60 % senken).
- **Erholungswochen:** Fitzgeralds Pläne bauen regelmäßig leichtere Wochen ein; die Vorlage nimmt jede dritte Woche
  mit 20 % weniger. `ramp_max` 10 %.

## Anpassung

Die Methode lebt davon, dass harte Tage frisch gelaufen werden. Deshalb greift die Ermüdungsregel früh (TSB unter
−20, ACWR über 1,3): Die nächste harte Einheit wird locker gelaufen; bei hoher ACWR folgt eine Erholungswoche.
Verpasste lockere km dürfen moderat verteilt werden (+25 % bzw. +4 km pro Tag), weil sie kaum ermüden. Eine
verpasste harte Einheit wandert höchstens drei Tage, mit zwei Tagen Abstand zur nächsten.

## Typische Einheiten

- **Lockerer Lauf:** 40–70 min, Nasenatmung möglich, unter der ersten Schwelle (Herzfrequenz-Zonen aus Runmates
  HR-Modell).
- **Intervalle:** 5 × 1000 m oder 6 × 3 min deutlich über der zweiten Schwelle, Trabpause gleich lang.
- **Hügel:** 8 × 60–90 s bergauf, kräftig, Trab zurück.
- **Renntempo:** 3 × 3 km im Halbmarathontempo, später 2 × 6 km.
- **Langer Lauf:** 90–120 min locker, in der Spitze mit 4–8 km Renntempo am Schluss.

## Grenzen / Risiken

Die Studien sind meist kurz (9 Wochen bis 5 Monate) und klein; bei Freizeitläufern war der Unterschied im
Hauptvergleich nicht signifikant (Muñoz 2014). Das Prinzip „locker wirklich locker“ ist robust belegt, die genaue
80/20-Zahl nicht. Für den Halbmarathon ist das Renntempo selbst „moderat“ – die Spitze ist deshalb bewusst weniger
polarisiert. Wer nur 3–4 Mal läuft, kommt mit 80/20 auf sehr wenig harte km; dann lieber 1 harte Einheit pro Woche.

## Quellen

- Seiler, S. (2010): What is best practice for training intensity and duration distribution in endurance athletes?
  *Int J Sports Physiol Perform* 5(3).
- Seiler, K. S. & Kjerland, G. Ø. (2006): Quantifying training intensity distribution in elite endurance athletes.
  *Scand J Med Sci Sports* 16(1).
- Esteve-Lanao, J. u. a. (2007): Impact of training intensity distribution on performance in endurance athletes.
  *J Strength Cond Res* 21(3).
- Stöggl, T. & Sperlich, B. (2014): Polarized training has greater impact on key endurance variables …
  *Front Physiol* 5:33.
- Muñoz, I. u. a. (2014): Does polarized training improve performance in recreational runners? *Int J Sports Physiol
  Perform* 9(2).
- Fitzgerald, M. (2014): *80/20 Running*. New American Library.
