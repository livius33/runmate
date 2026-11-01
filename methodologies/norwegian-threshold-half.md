---
id: norwegian-threshold-half
name: Norwegisches Schwellenmodell – Halbmarathon
version: 2
distances: [half]
summary: >-
  Viel lockerer Umfang plus drei kontrollierte Schwelleneinheiten pro Woche als Intervalle knapp unter der
  Laktatschwelle (bei Profis laktatgesteuert, oft als Doppelschwelle am selben Tag). Kaum harte VO2max-Arbeit,
  wenig Ermüdung pro Einheit, dafür viel Zeit an der Schwelle. Hier die Einzel-Einheiten-Variante für Freizeitläufer.
sources:
  - { author: "Casado, A., Foster, C., Bakken, M. & Tjelta, L. I.", year: 2023, title: "Does lactate-guided threshold interval training within a high-volume low-intensity approach represent the \"next step\" in the evolution of distance running training?", note: "Modell, Beispielwoche, Laktatziele 2–4,5 mmol/l, längster Lauf ~21 km" }
  - { author: "Tjelta, L. I.", year: 2019, title: "Three Norwegian brothers all European 1500 m champions: what is the secret?", note: "Trainingstagebücher der Ingebrigtsens" }
  - { author: "Tjelta, L. I.", year: 2016, title: "The training of international level distance runners", note: "Überblick, Schwellenintervalle" }
  - { author: "Haugen, T., Sandbakk, Ø., Seiler, S. & Tønnessen, E.", year: 2022, title: "The training characteristics of world-class distance runners: an integration of scientific literature and results-proven practice", note: "≥ 80 % locker, Taper 7–10 Tage" }
  - { author: "Casado, A., Hanley, B., Santos-Concejero, J. & Ruiz-Pérez, L. M.", year: 2021, title: "World-class long-distance running performances are best predicted by volume of easy runs and deliberate practice of short-interval and tempo runs", note: "lockerer Umfang + Tempo- und kurze Intervalle" }

phases:
  split: { base: 0.30, build: 0.45, peak: 0.25 }
  taper:
    weeks: { half: 2 }
    volume: [0.90, 0.60]

volume:
  start: 0.70
  phases:
    base: [0.70, 0.88]
    build: [0.88, 1.00]
    peak: [0.95, 1.00]
  ramp_max: 0.08
  recovery_week: { every: 4, volume: 0.85 }

intensity:
  base:  { easy: 0.84, moderate: 0.14, hard: 0.02 }
  build: { easy: 0.77, moderate: 0.21, hard: 0.02 }
  peak:  { easy: 0.76, moderate: 0.21, hard: 0.03 }
  taper: { easy: 0.80, moderate: 0.18, hard: 0.02 }

week:
  runs: 6
  key_sessions: { base: 2, build: 3, peak: 3, taper: 2 }
  key_gap_days: 2
  long_run: { share: 0.25, max_km: 24, max_minutes: 110 }

workouts:
  base:
    - { kind: threshold, unit: km, from: 6, to: 8, note: "Unterschwelle: z. B. 6 × 1 km / 4 × 2 km, 60 s Pause, ruhig (≈ 2–3 mmol/l)" }
    - { kind: easy, unit: km, from: 8, to: 12, note: "sehr locker, deutlich unter der ersten Schwelle" }
    - { kind: strides, unit: reps, from: 6, to: 8 }
    - { kind: long_easy, unit: km, from: 16, to: 20 }
  build:
    - { kind: threshold, unit: km, from: 8, to: 10, note: "lang: 5 × 2 km oder 5 × 6 min, 60 s Pause" }
    - { kind: threshold, unit: km, from: 8, to: 10, note: "mittel: 8–10 × 1 km, 60 s Pause" }
    - { kind: threshold, unit: km, from: 7, to: 9, note: "kurz: 20–25 × 400 m oder 10–12 × 3 min, 30–60 s Pause, etwas schneller (≈ 3–3,5 mmol/l)" }
    - { kind: hills, unit: reps, from: 8, to: 10, note: "optional: kurze Hügel 200 m statt eines lockeren Laufs" }
    - { kind: long_easy, unit: km, from: 18, to: 22 }
  peak:
    - { kind: threshold, unit: km, from: 10, to: 12 }
    - { kind: half_marathon_pace, unit: km, from: 8, to: 12, note: "eine Schwelleneinheit wird zu Renntempo-Blöcken" }
    - { kind: intervals_vo2, unit: km, from: 3, to: 4, note: "kleine schnelle Einheit alle 1–2 Wochen" }
    - { kind: test, unit: km, from: 10, to: 10, note: "10-km-Testrennen" }
  taper:
    - { kind: threshold, unit: km, from: 5, to: 6 }
    - { kind: half_marathon_pace, unit: km, from: 3, to: 5 }

paces:
  source: threshold
  offsets:
    easy: 80
    recovery: 100
    long: 75
    marathon_pace: 15
    half_marathon_pace: 0
    threshold: 3
    intervals_vo2: -20
    strides: -40

adaptation:
  thresholds: { tsb_fatigue: -20, acwr_caution: 1.3 }
  fatigue: { share: 0.75, days: 3 }
  missed_km: { strategy: redistribute, cap_pct: 0.25, cap_km: 4 }
  missed_key: { strategy: move, max_shift_days: 2 }
  volume_review: { weeks: 3, below: 0.85, above: 1.10 }
  events: { pre_easy_days: { short: 1, half: 2, long: 3 }, light_from_km: 21.1, light_share: 0.75 }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: intensity_reduction
    volume_below: volume_adjustment
    volume_above: volume_adjustment
---

## Idee

**Viel Zeit an der Schwelle, ohne sich zu zerstören.** Norwegische Mittel- und Langstreckler (Marius Bakken,
später die Ingebrigtsens) laufen mehrere Schwelleneinheiten pro Woche als Intervalle mit kurzen Pausen – so
kontrolliert, dass das Laktat im Bereich von etwa 2–4 mmol/l bleibt. Weil jede Einheit knapp unter der Schwelle
bleibt, erholt man sich schnell und kann sie häufig wiederholen. Der Rest ist sehr lockerer Umfang; harte
VO2max-Arbeit gibt es nur wenig.

## Für wen

Für erfahrene Läuferinnen und Läufer, die 6 Mal pro Woche laufen (etwa 60–100 km) und Disziplin beim Tempo haben:
Die Schwelleneinheiten dürfen sich nie wie ein Wettkampf anfühlen. Besonders passend für 10 km bis Halbmarathon –
das Halbmarathon-Renntempo liegt genau im Bereich der Schwellenarbeit. Die Profi-Variante (Doppelschwelle: zwei
Einheiten am selben Tag, 150–180 km/Woche, Laktatmessung) ist für Freizeitläufer nicht gedacht.

## Wochenaufbau

Einzel-Einheiten-Variante: Dienstag, Donnerstag und Samstag je eine Schwelleneinheit (lang – mittel – kurz),
Sonntag langer lockerer Lauf, Montag/Mittwoch/Freitag sehr locker oder Ruhe. Zwischen zwei Schwelleneinheiten liegt
mindestens ein lockerer Tag. Bei den Profis stehen zwei Schwelleneinheiten am Dienstag und Donnerstag (morgens ruhiger
≈ 2,5 mmol/l, abends etwas schneller ≈ 3,5 mmol/l), samstags kurze Hügel. Der längste Lauf ist im Modell kurz
(≈ 21 km); die Vorlage erlaubt bis 24 km bzw. 110 min.

## Phasen

Das Modell ist wenig periodisiert – die Wochenstruktur bleibt das ganze Jahr ähnlich, der Umfang an der Schwelle
wächst langsam.

- **Grundlage (30 %):** zwei Schwelleneinheiten, ruhiger Teil des Schwellenbereichs, Umfang aufbauen.
- **Aufbau (45 %):** drei Schwelleneinheiten; Gesamtumfang der Wiederholungen 8–10 km pro Einheit.
- **Spitze (25 %):** eine Schwelleneinheit wird zu Renntempo-Blöcken; gelegentlich eine kurze schnelle Einheit.
- **Taper (2 Wochen):** 90 → 60 % der Spitze. Weltklasse-Läufer beginnen den Taper 7–10 Tage vor dem Rennen
  (Haugen 2022); die erste Taper-Woche ist deshalb nur leicht reduziert.
- Steigerung höchstens 8 % pro Woche (das Modell baut die Schwellenarbeit bewusst langsam auf), jede vierte Woche
  15 % leichter.

## Anpassung

Das Herzstück ist Kontrolle: Fühlt sich eine Schwelleneinheit zu hart an (oder ist die Herzfrequenz für das Tempo
zu hoch), wird langsamer gelaufen – nicht durchgezogen. Daher greift die Ermüdungsregel früh (TSB unter −20, ACWR
über 1,3); die nächste Schwelleneinheit wird locker gelaufen, behält aber 75 % der km. Verpasste lockere km werden
maßvoll verteilt, eine verpasste Schwelleneinheit wandert höchstens zwei Tage, nie auf den Tag vor einer anderen.

## Typische Einheiten

- **Lang:** 5 × 2 km oder 5 × 6 min, 60 s Pause – etwas langsamer als Halbmarathontempo.
- **Mittel:** 8–10 × 1 km, 60 s Pause – etwa Halbmarathontempo.
- **Kurz:** 20–25 × 400 m, 30 s Pause, oder 10–12 × 3 min – etwas schneller, aber nie hart.
- **Sehr locker:** 45–70 min deutlich unter der ersten Schwelle.
- **Langer Lauf:** 90–110 min locker.

## Grenzen / Risiken

Das Modell ist bisher nur beobachtend beschrieben (Fallstudien, Trainingstagebücher, Übersichtsarbeiten); es gibt
keine kontrollierten Studien (Casado 2023). Die Einzel-Einheiten-Variante für Freizeitläufer ist eine
Übertragung, nicht das Original. Ohne Laktatmessung muss das Tempo über Herzfrequenz und Gefühl begrenzt werden –
das größte Risiko ist, die Schwelleneinheiten zu schnell zu laufen. Das Schwellentempo hier (+3 s/km zum
Halbmarathontempo) ist ein Mittelwert; die langen Wiederholungen etwas langsamer, die kurzen etwas schneller.

## Quellen

- Casado, A., Foster, C., Bakken, M. & Tjelta, L. I. (2023): Does lactate-guided threshold interval training within a
  high-volume low-intensity approach represent the "next step" …? *Int J Environ Res Public Health* 20(5):3782.
- Tjelta, L. I. (2019): Three Norwegian brothers all European 1500 m champions: what is the secret? *Int J Sports Sci
  Coach* 14.
- Tjelta, L. I. (2016): The training of international level distance runners. *Int J Sports Sci Coach* 11.
- Haugen, T., Sandbakk, Ø., Seiler, S. & Tønnessen, E. (2022): The training characteristics of world-class distance
  runners. *Sports Med Open* 8.
- Casado, A. u. a. (2021): World-class long-distance running performances are best predicted by volume of easy runs
  and deliberate practice of short-interval and tempo runs. *J Strength Cond Res* 35.
