---
id: lydiard-marathon
name: Lydiard – Marathon
version: 2
distances: [marathon]
summary: >-
  Arthur Lydiards Periodisierung: zuerst eine lange aerobe Grundlage mit viel Umfang („Marathon-Conditioning“),
  dann Hügeltraining für Kraft, eine kurze anaerobe Phase, Koordination/Schärfung mit Testläufen und zuletzt
  Frische für das Rennen. Jede Phase baut auf der vorigen auf.
sources:
  - { author: "Lydiard, A. & Gilmour, G.", year: 1978, title: "Running the Lydiard Way", note: "Phasen, Wochenpläne, aerobe Läufe in Anstrengungsstufen" }
  - { author: "Lydiard, A. & Gilmour, G.", year: 2000, title: "Running with Lydiard (überarb. Ausgabe)", note: "Conditioning, Hügel, anaerob, Koordination, Taper" }
  - { author: "Livingstone, K.", year: 2009, title: "Healthy Intelligent Training: The Proven Principles of Arthur Lydiard", note: "moderne Darstellung der Lydiard-Prinzipien" }
  - { author: "Tjelta, L. I., Enoksen, E. & Tønnessen, E.", year: 2014, title: "A case study of the training of nine times New York Marathon winner Grete Waitz", note: "Beispiel einer umfangsbasierten aeroben Grundlage" }
  - { author: "Bosquet, L., Montpetit, J., Arvisais, D. & Mujika, I.", year: 2007, title: "Effects of tapering on performance: a meta-analysis", note: "Taper" }

phases:
  split: { base: 0.50, build: 0.33, peak: 0.17 }
  taper:
    weeks: { marathon: 2 }
    volume: [0.75, 0.45]

volume:
  start: 0.55
  phases:
    base: [0.55, 1.00]
    build: [0.85, 0.90]
    peak: [0.80, 0.85]
  ramp_max: 0.10
  recovery_week: { every: 6, volume: 0.85 }

intensity:
  base:  { easy: 0.88, moderate: 0.12, hard: 0.00 }
  build: { easy: 0.82, moderate: 0.06, hard: 0.12 }
  peak:  { easy: 0.80, moderate: 0.12, hard: 0.08 }
  taper: { easy: 0.85, moderate: 0.10, hard: 0.05 }

week:
  runs: 7
  key_sessions: { base: 2, build: 3, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.30, max_km: 35, max_minutes: 180, race_pace: false }

workouts:
  base:
    - { kind: long_easy, unit: km, from: 25, to: 35, note: "Sonntag 2–3 h aerob" }
    - { kind: medium_long, unit: km, from: 18, to: 24, note: "zweiter längerer Lauf unter der Woche" }
    - { kind: progression, unit: km, from: 10, to: 16, note: "aerober Lauf mit „Dreiviertel-Anstrengung“: gleichmäßig zügig, nie außer Atem" }
    - { kind: strides, unit: reps, from: 6, to: 10, note: "lockere Fartlek-Steigerungen" }
  build:
    - { kind: hills, unit: minutes, from: 30, to: 60, note: "Hügelphase (ca. 4 Wochen): Hügelspringen, Bounding, steiles Laufen, Sprints oben" }
    - { kind: intervals_vo2, unit: km, from: 4, to: 6, note: "anaerobe Phase (ca. 4 Wochen): Wiederholungen bis zur angenehmen Müdigkeit, nicht bis zur Erschöpfung" }
    - { kind: long_easy, unit: km, from: 28, to: 35, note: "der lange Lauf bleibt" }
  peak:
    - { kind: test, unit: km, from: 10, to: 21.1, note: "Koordination: Zeitläufe über Teilstrecken, Testrennen" }
    - { kind: strides, unit: reps, from: 8, to: 12, note: "Schärfung: kurze schnelle Abschnitte (50–100 m)" }
    - { kind: marathon_pace, unit: km, from: 10, to: 16, note: "Renntempo-Läufe" }
    - { kind: long_easy, unit: km, from: 25, to: 32 }
  taper:
    - { kind: strides, unit: reps, from: 6, to: 8 }
    - { kind: marathon_pace, unit: km, from: 5, to: 8 }

paces:
  source: goal_time
  offsets:
    easy: 55
    recovery: 80
    long: 45
    marathon_pace: 0
    half_marathon_pace: -15
    threshold: -10
    intervals_vo2: -35
    strides: -55

adaptation:
  thresholds: { tsb_fatigue: -25, acwr_caution: 1.4 }
  fatigue: { share: 0.6, days: 4 }
  missed_km: { strategy: redistribute, cap_pct: 0.30, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 5 }
  volume_review: { weeks: 4, below: 0.85, above: 1.15 }
  events: { test_window_days: 42, build_from_km: 21.1 }
  return: { week2_quality: easy }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: recovery_week_insertion
    volume_below: phase_restructuring
    volume_above: volume_adjustment
---

## Idee

**Erst die Grundlage, dann die Spitze.** Lydiard ließ seine Läufer zuerst über viele Wochen viel aerob laufen –
nicht nur langsam, sondern in verschiedenen Anstrengungsstufen bis „Dreiviertel“, immer ohne Sauerstoffschuld. Erst
auf dieser Grundlage folgen Hügeltraining (Kraft und Laufstil), eine kurze anaerobe Phase und eine Schärfungsphase
mit Testläufen. Das Prinzip „train, don't strain“: fordernd, aber nie verausgabend. Lydiard gilt als Vater der
Periodisierung im Laufen.

## Für wen

Für Läuferinnen und Läufer mit viel Vorlaufzeit (ideal 24+ Wochen) und Freude an Umfang; sieben Läufe pro Woche sind
die Norm. Lydiards Idealumfang (~160 km/Woche) ist für Freizeitläufer nicht nötig – entscheidend ist die Reihenfolge.
Weniger geeignet bei kurzer Vorbereitung: Die Grundlage braucht Zeit.

## Wochenaufbau

Grundlage: täglich laufen, Sonntag 2–3 Stunden lang, Mittwoch ein zweiter längerer Lauf, zwei bis drei Läufe mit
„halber“ bis „Dreiviertel“-Anstrengung, der Rest locker; Fartlek für Abwechslung. Hügelphase: an drei Tagen
Hügeltraining im Wechsel mit lockeren Läufen, der lange Lauf bleibt. Anaerobe Phase: zwei bis drei Bahn-Einheiten,
sonst locker. Koordination: Zeitläufe, kurze Sprints, Renntempo.

## Phasen

Lydiard: Conditioning mindestens ~10–12 Wochen, Hügel ~4 Wochen, anaerob ~4 Wochen, Koordination/Schärfung
~2–4 Wochen, dann Frische. Für eine 24-Wochen-Vorbereitung heißt das: **Grundlage 50 %**, **Aufbau 33 %** (Hügel +
anaerob), **Spitze 17 %** (Koordination).

- **Grundlage:** Umfang steigt bis zur Spitze (der höchste Umfang liegt bei Lydiard am Ende der Grundlage).
- **Aufbau:** Umfang leicht niedriger (85–90 %), dafür Hügel und anaerobe Wiederholungen.
- **Spitze:** Umfang weiter leicht sinkend (80–85 %), Zeitläufe und Testrennen, Renntempo.
- **Taper (2 Wochen):** 75 → 45 % der Spitze; kurze, frische Läufe, Steigerungen.
- **Erholungswochen:** Lydiard plante keine festen leichten Wochen, sondern harte und leichte Tage. Jede sechste
  Woche 15 % leichter ist ein Kompromiss für Runmate. `ramp_max` 10 %.

- **Lange Läufe aerob:** Lydiard läuft lange Läufe gleichmäßig im aeroben Bereich, ohne Renntempo-Blöcke
  (`long_run.race_pace: false`).

## Anpassung

Lydiards Grundsatz: Wenn ein Läufer müde ist, wird die Intensität gesenkt, nicht der aerobe Umfang. Deshalb werden
verpasste km auf lockere Tage verteilt (+30 % bzw. +5 km pro Tag), und Ermüdung (TSB unter −25, ACWR über 1,4)
entschärft die nächste harte Einheit stärker (60 % der km locker, Blick auf vier Tage). Fehlt über vier Wochen
deutlich Umfang, wird die Phasenaufteilung neu geplant – die Grundlage hat Vorrang vor Hügeln und Bahn.

## Typische Einheiten

- **Langer Lauf:** 2–3 Stunden aerob, hügeliges Gelände erwünscht.
- **Dreiviertel-Lauf:** 10–16 km gleichmäßig zügig, aber ohne Sauerstoffschuld.
- **Hügel:** 30–60 min Hügelspringen, Bounding und steiles Laufen auf einem 200–400 m langen Anstieg, dazwischen
  flache Sprints.
- **Anaerob:** z. B. 10–15 × 400 m oder 6–8 × 800 m, bis man spürt „genug“.
- **Koordination:** Zeitlauf über 10–21 km, 10 × 50–100 m Sprints.

## Grenzen / Risiken

Lydiards Pläne wurden für Spitzenläufer mit sehr viel Zeit geschrieben; die Übertragung auf Freizeitläufer verlangt
Augenmaß. Seine Anweisungen sind oft nach Anstrengung formuliert, nicht nach Tempo – die Tempo-Offsets sind eine
Übersetzung. Die Hügelübungen (Springen, Bounding) belasten Waden und Achillessehnen und sollten behutsam eingeführt
werden. Phasen mit unterschiedlichen Wochenplänen (Hügeltage vs. Bahntage im Aufbau) kann das Schema nicht trennen.

## Quellen

- Lydiard, A. & Gilmour, G. (1978): *Running the Lydiard Way*. World Publications.
- Lydiard, A. & Gilmour, G. (2000): *Running with Lydiard*, überarbeitete Ausgabe. Meyer & Meyer.
- Livingstone, K. (2009): *Healthy Intelligent Training: The Proven Principles of Arthur Lydiard*. Meyer & Meyer.
- Tjelta, L. I., Enoksen, E. & Tønnessen, E. (2014): A case study of the training of nine times New York Marathon
  winner Grete Waitz. *Int J Sports Sci Coach* 9.
- Bosquet, L. u. a. (2007): Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8).
