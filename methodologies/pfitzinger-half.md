---
id: pfitzinger-half
name: Pfitzinger – Halbmarathon
version: 2
distances: [half]
summary: >-
  Pfitzinger & Latter, „Faster Road Racing“: Schwellenläufe als Kern, dazu VO2max-Intervalle, ein mittellanger Lauf
  unter der Woche und ein langer Lauf am Wochenende. Aufbau über Ausdauer → Schwelle → wettkampfspezifisch → Taper,
  für erfahrene Läufer mit 55–100 km pro Woche.
sources:
  - { author: "Pfitzinger, P. & Latter, P.", year: 2015, title: "Faster Road Racing: 5K to Half Marathon", note: "Halbmarathon-Pläne, LT-Läufe, VO2max, mittellange Läufe, Taper" }
  - { author: "Pfitzinger, P. & Douglas, S.", year: 2019, title: "Advanced Marathoning (3. Aufl.)", note: "gleiche Einheitenlogik (LT, mittellang, allgemeiner Ausdauerlauf)" }
  - { author: "Bosquet, L., Montpetit, J., Arvisais, D. & Mujika, I.", year: 2007, title: "Effects of tapering on performance: a meta-analysis", note: "2 Wochen, Umfang 41–60 % senken" }

phases:
  split: { base: 0.35, build: 0.35, peak: 0.30 }
  taper:
    weeks: { half: 2 }
    volume: [0.80, 0.55]

volume:
  start: 0.70
  phases:
    base: [0.70, 0.90]
    build: [0.90, 1.00]
    peak: [0.92, 1.00]
  ramp_max: 0.10
  recovery_week: { every: 4, volume: 0.82 }

intensity:
  base:  { easy: 0.90, moderate: 0.07, hard: 0.03 }
  build: { easy: 0.82, moderate: 0.13, hard: 0.05 }
  peak:  { easy: 0.80, moderate: 0.12, hard: 0.08 }
  taper: { easy: 0.82, moderate: 0.11, hard: 0.07 }

week:
  runs: 6
  key_sessions: { base: 2, build: 3, peak: 3, taper: 2 }
  key_gap_days: 1
  long_run: { share: 0.28, max_km: 27, max_minutes: 140 }

workouts:
  base:
    - { kind: long_easy, unit: km, from: 18, to: 24 }
    - { kind: medium_long, unit: km, from: 14, to: 18 }
    - { kind: strides, unit: reps, from: 8, to: 10, note: "10 × 100 m" }
    - { kind: hills, unit: reps, from: 6, to: 10, note: "kurze Hügelsprints für Kraft und Ökonomie" }
  build:
    - { kind: threshold, unit: km, from: 6, to: 10, note: "LT-Lauf im 15-km- bis HM-Tempo, auch als 2–4 × 2–3 km" }
    - { kind: medium_long, unit: km, from: 16, to: 21 }
    - { kind: long_easy, unit: km, from: 21, to: 27 }
    - { kind: intervals_vo2, unit: km, from: 4, to: 5, note: "VO2max 600–1200 m im 5-km-Tempo" }
  peak:
    - { kind: intervals_vo2, unit: km, from: 5, to: 6, note: "z. B. 5 × 1000 m im 5-km-Tempo" }
    - { kind: half_marathon_pace, unit: km, from: 6, to: 12, note: "Renntempo-Blöcke, z. B. 3 × 3 km" }
    - { kind: threshold, unit: km, from: 8, to: 10 }
    - { kind: test, unit: km, from: 8, to: 15, note: "Vorbereitungsrennen 8–15 km" }
  taper:
    - { kind: intervals_vo2, unit: km, from: 3, to: 4, note: "kurz, Tempo halten" }
    - { kind: half_marathon_pace, unit: km, from: 4, to: 6 }

paces:
  source: goal_time
  offsets:
    easy: 65
    recovery: 85
    long: 55
    marathon_pace: 15
    half_marathon_pace: 0
    threshold: -5
    intervals_vo2: -22
    strides: -40

adaptation:
  thresholds: { tsb_fatigue: -25, acwr_caution: 1.5 }
  fatigue: { share: 0.7, days: 3 }
  missed_km: { strategy: drop, cap_pct: 0.30, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 4 }
  volume_review: { weeks: 3, below: 0.85, above: 1.10 }
  events: { build_from_km: 8 }
  triggers:
    missed_km: volume_adjustment
    missed_key: workout_reordering
    fatigue_tsb: intensity_reduction
    acwr_high: intensity_reduction
    volume_below: volume_adjustment
    volume_above: volume_adjustment
---

## Idee

Für den Halbmarathon entscheidet vor allem die Laktatschwelle: Das Renntempo liegt nur knapp darunter. Pfitzinger &
Latter machen den **LT-Lauf** (15-km- bis Halbmarathontempo) zur zentralen Einheit und ergänzen ihn um
VO2max-Intervalle, einen mittellangen Lauf unter der Woche und einen langen Lauf. Umfang bleibt die Basis, aber die
Qualität ist dichter als in einem Marathonplan.

## Für wen

Für erfahrene Läuferinnen und Läufer, die regelmäßig 50 km oder mehr pro Woche laufen und eine Zeit verbessern
wollen. Das Buch hat mehrere Umfangsstufen; die Vorlage ist für 6 Läufe und etwa 70–100 km in der Spitze gedacht.

## Wochenaufbau

Typisch: Montag Ruhe/Regeneration · Dienstag LT-Lauf oder VO2max · Mittwoch mittellanger Lauf · Donnerstag
Regeneration · Freitag allgemeiner Ausdauerlauf mit Steigerungen · Samstag Regeneration oder Rennen · Sonntag langer
Lauf. Wie im Marathonbuch dürfen Schlüsseleinheiten an aufeinanderfolgenden Tagen liegen (`key_gap_days` 1).

## Phasen

- **Ausdauer** (ca. 35 % der Wochen vor dem Taper): Umfang aufbauen, lange und mittellange Läufe, Steigerungen,
  Hügelsprints.
- **Schwelle** (ca. 35 %): LT-Läufe wachsen von 6 auf 10 km, erste VO2max-Einheiten.
- **Wettkampfspezifisch** (ca. 30 %): VO2max, Renntempo-Blöcke, Vorbereitungsrennen 8–15 km.
- **Taper (2 Wochen):** 80 → 55 % der Spitze; kurze, schnelle Einheiten bleiben. Für den Halbmarathon empfiehlt
  Pfitzinger einen kürzeren Taper als für den Marathon; die Werte liegen im Bereich von Bosquet 2007.
- Erholungswoche jede vierte Woche (−18 %), `ramp_max` 10 %.

**Hinweis zur Genauigkeit:** Die Wochenwerte der Buchpläne (Stufen, Wochenumfänge, Taper-Prozente) konnte ich für
den Halbmarathon nicht Zeile für Zeile prüfen. Die Vorlage folgt den Prinzipien und Einheitentypen von Pfitzinger;
Phasenlängen, Taper und die Obergrenze des langen Laufs sind begründete Vorgaben.

## Anpassung

Verpasste km verfallen; eine verpasste Schlüsseleinheit darf bis zu vier Tage später kommen. Bei TSB unter −25 oder
ACWR über 1,5 wird die nächste harte Einheit locker gelaufen (70 % der km). Liegt der Umfang drei Wochen lang 15 %
unter dem Plan, sinkt der weitere Umfang.

## Typische Einheiten

- **LT-Lauf:** 2 km ein, 8 km im 15-km- bis HM-Tempo, 2 km aus – oder 3 × 3 km mit 2 min Trab.
- **VO2max:** 5 × 1000 m im 5-km-Tempo, 2–3 min Trab.
- **Mittellanger Lauf:** 16–21 km im allgemeinen Ausdauertempo.
- **Renntempo:** 3 × 3 km im Halbmarathontempo, 1 km locker dazwischen.
- **Langer Lauf:** 21–27 km locker.

## Grenzen / Risiken

Drei Schlüsseleinheiten pro Woche plus mittellanger Lauf sind fordernd; bei weniger als ~50 km Wochenumfang lieber
80/20 oder Daniels wählen. Vorbereitungsrennen ersetzen eine Schlüsseleinheit, nicht zusätzlich.

## Quellen

- Pfitzinger, P. & Latter, P. (2015): *Faster Road Racing: 5K to Half Marathon*. Human Kinetics.
- Pfitzinger, P. & Douglas, S. (2019): *Advanced Marathoning*, 3. Aufl.
- Bosquet, L. u. a. (2007): Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8).
