---
id: pfitzinger-marathon
name: Pfitzinger – Marathon
version: 2
distances: [marathon]
summary: >-
  Pfitzinger & Douglas, „Advanced Marathoning“: hoher Umfang mit mittellangen Läufen unter der Woche, Schwellenläufen
  (Laktatschwelle) und langen Läufen mit Marathontempo-Block. Vier Abschnitte: Ausdauer → Schwelle + Ausdauer →
  Wettkampfvorbereitung → Taper. Voreinstellung: Stufe 18 Wochen / 113 km (70 Meilen).
sources:
  - { author: "Pfitzinger, P. & Douglas, S.", year: 2019, title: "Advanced Marathoning (3. Aufl.)", note: "Mesozyklen, mittellange Läufe, LT- und MP-Läufe, Umfangsstufen, Taper" }
  - { author: "Pfitzinger, P. & Douglas, S.", year: 2009, title: "Advanced Marathoning (2. Aufl.)", note: "Taper: ca. −20–25 %, −40 %, −60 % in den letzten drei Wochen" }
  - { author: "Mujika, I. & Padilla, S.", year: 2003, title: "Scientific bases for precompetition tapering strategies", note: "Umfang senken, Intensität halten" }
  - { author: "Gabbett, T. J.", year: 2016, title: "The training—injury prevention paradox: should athletes be training smarter and harder?", note: "ACWR" }

phases:
  split: { base: 0.40, build: 0.33, peak: 0.27 }
  taper:
    weeks: { marathon: 3 }
    volume: [0.78, 0.60, 0.40]

volume:
  start: 0.75
  phases:
    base: [0.75, 0.92]
    build: [0.92, 1.00]
    peak: [0.93, 1.00]
  ramp_max: 0.10
  recovery_week: { every: 5, volume: 0.82 }

intensity:
  base:  { easy: 0.92, moderate: 0.06, hard: 0.02 }
  build: { easy: 0.84, moderate: 0.13, hard: 0.03 }
  peak:  { easy: 0.80, moderate: 0.13, hard: 0.07 }
  taper: { easy: 0.82, moderate: 0.11, hard: 0.07 }

week:
  runs: 6
  key_sessions: { base: 2, build: 3, peak: 3, taper: 2 }
  key_gap_days: 1
  long_run: { share: 0.32, max_km: 35, max_minutes: 210 }

workouts:
  base:
    - { kind: long_easy, unit: km, from: 26, to: 32, note: "10–20 % langsamer als Marathontempo" }
    - { kind: medium_long, unit: km, from: 18, to: 24, note: "mittellanger Lauf unter der Woche (11–15 Meilen)" }
    - { kind: strides, unit: reps, from: 8, to: 10, note: "10 × 100 m im allgemeinen Ausdauerlauf" }
    - { kind: threshold, unit: km, from: 6, to: 8, note: "erste LT-Läufe gegen Ende des Abschnitts" }
  build:
    - { kind: threshold, unit: km, from: 7, to: 11, note: "LT-Lauf: 4–7 Meilen im 15-km- bis HM-Tempo" }
    - { kind: medium_long, unit: km, from: 22, to: 26, note: "bis 16 Meilen" }
    - { kind: long_easy, unit: km, from: 30, to: 35, note: "bis 20–22 Meilen" }
    - { kind: long_with_pace, unit: km, from: 13, to: 19, note: "langer Lauf mit 8–12 Meilen im Marathontempo" }
  peak:
    - { kind: intervals_vo2, unit: km, from: 5, to: 6, note: "VO2max: 600–1600 m im 5-km-Tempo, z. B. 5 × 1200 m" }
    - { kind: long_with_pace, unit: km, from: 16, to: 22, note: "bis 14 Meilen im Marathontempo" }
    - { kind: medium_long, unit: km, from: 24, to: 26 }
    - { kind: test, unit: km, from: 8, to: 15, note: "Vorbereitungswettkämpfe 8–15 km (bzw. HM)" }
  taper:
    - { kind: intervals_vo2, unit: km, from: 4, to: 5, note: "kurz, Tempo halten" }
    - { kind: marathon_pace, unit: km, from: 5, to: 8 }
    - { kind: test, unit: km, from: 8, to: 10, note: "Vorbereitungsrennen ca. 3 Wochen vorher" }

paces:
  source: goal_time
  offsets:
    easy: 55
    recovery: 75
    long: 40
    marathon_pace: 0
    half_marathon_pace: -15
    threshold: -15
    intervals_vo2: -38
    strides: -55

adaptation:
  thresholds: { tsb_fatigue: -30, acwr_caution: 1.5 }
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

Ausdauer kommt aus Umfang, aber nicht nur aus dem einen langen Lauf: Pfitzinger setzt zusätzlich einen
**mittellangen Lauf** (18–26 km) mitten in die Woche. Dazu kommen Schwellenläufe (Laktatschwelle, 15-km- bis
Halbmarathontempo) und später lange Läufe mit einem großen Block im Marathontempo. Der Rest ist allgemeiner
Ausdauerlauf und bewusst langsame Regeneration. Ziel ist, die Laktatschwelle hochzuziehen und den Körper an lange
Belastung im Renntempo zu gewöhnen.

## Für wen

Für erfahrene Marathonläuferinnen und -läufer, die viel Zeit haben: Das Buch bietet Stufen bis 88 km, 88–113 km,
113–137 km und über 137 km pro Woche (je 18 oder 12 Wochen). Die Vorlage nimmt die Stufe 18 Wochen / bis 113 km
(sechs Läufe) als Voreinstellung; die Spitzen-km lassen sich ändern. Wer weniger als ~70 km sicher läuft, ist mit
Hansons oder 80/20 besser bedient.

## Wochenaufbau

Typisch: Montag Ruhe oder Regeneration · Dienstag LT-Lauf bzw. VO2max · Mittwoch mittellanger Lauf · Donnerstag
Regeneration · Freitag allgemeiner Ausdauerlauf mit Steigerungen · Samstag Regeneration · Sonntag langer Lauf.
Schlüsseleinheiten liegen bei Pfitzinger auch an aufeinanderfolgenden Tagen (LT Dienstag, mittellang Mittwoch),
daher `key_gap_days` 1. Danach kommt immer mindestens ein echter Regenerationslauf. Der lange Lauf erreicht 20–22
Meilen (32–35 km); bei 113 km sind das gut 30 % der Woche.

## Phasen

Der 18-Wochen-Plan hat vier Abschnitte: **Ausdauer** (ca. 6 Wochen) → **Laktatschwelle + Ausdauer** (ca. 5 Wochen)
→ **Wettkampfvorbereitung** (ca. 4 Wochen) → **Taper** (3 Wochen). Daraus der Split 40/33/27 % der Wochen vor dem
Taper.

- **Ausdauer:** Umfang in den ersten 5–6 Wochen auf nahezu Spitze, lange und mittellange Läufe wachsen, erste
  LT-Läufe.
- **Schwelle + Ausdauer:** LT-Läufe 4–7 Meilen, erste lange Läufe mit Marathontempo-Block, Umfang auf Spitze.
- **Wettkampfvorbereitung:** VO2max-Intervalle im 5-km-Tempo, längste Marathontempo-Blöcke, Vorbereitungsrennen
  (8 km bis Halbmarathon). Der Umfang bleibt 8–9 Wochen nahe der Spitze.
- **Taper (3 Wochen):** etwa 78 → 60 → 40 % der Spitze (also rund −20–25 %, −40 %, −60 %), Tempo bleibt mit kurzen
  Intervallen und Marathontempo erhalten.
- **Erholungswochen:** Am Ende der Abschnitte gibt es leichtere Wochen (oft mit Vorbereitungsrennen); jede fünfte
  Woche um 18 % leichter bildet das näherungsweise ab. `ramp_max` 10 %.

## Anpassung

Pfitzinger rät, verpasste Einheiten nicht nachzuholen und Ermüdung ernst zu nehmen: Verpasste km verfallen; eine
verpasste Schlüsseleinheit darf bis zu vier Tage später kommen. Bei TSB unter −30 (Pfitzinger-Pläne erzeugen
bewusst mehr Ermüdung als Runmates Standard) oder ACWR über 1,5 wird die nächste harte Einheit locker gelaufen
(70 % der km). Liegt der Umfang drei Wochen lang 15 % unter dem Plan, sinkt der weitere Umfang (bzw. die Stufe).

## Typische Einheiten

- **LT-Lauf:** 3 km einlaufen, 7–11 km im 15-km- bis HM-Tempo, 2 km auslaufen.
- **Mittellanger Lauf:** 18–26 km im allgemeinen Ausdauertempo, gegen Ende etwas zügiger.
- **Langer Lauf mit MP:** 26–29 km, davon 16–22 km im Marathontempo.
- **VO2max:** 5 × 1200 m oder 6 × 1000 m im 5-km-Tempo, 50–90 % der Belastungszeit Trabpause.
- **Regeneration:** 6–10 km deutlich langsamer als der allgemeine Ausdauerlauf.

## Grenzen / Risiken

Sehr umfangreich: Die Kombination aus mittellangen und langen Läufen ist der Hauptreiz und das Hauptrisiko. Die
Stufen setzen voraus, dass man den Einstiegsumfang schon sicher läuft. Das LT-Tempo liegt mit −15 s/km genau an der
Grenze zwischen „moderat“ und „hart“; schnellere LT-Läufe (15-km-Tempo) zählen als hart. Doppeleinheiten der
höheren Stufen kann Runmate noch nicht abbilden.

## Quellen

- Pfitzinger, P. & Douglas, S. (2019): *Advanced Marathoning*, 3. Aufl. (Mesozyklen, Einheiten, Stufen).
- Pfitzinger, P. & Douglas, S. (2009): *Advanced Marathoning*, 2. Aufl. (Taper-Werte).
- Mujika, I. & Padilla, S. (2003): Scientific bases for precompetition tapering strategies. *Med Sci Sports Exerc* 35(7).
- Gabbett, T. J. (2016): The training—injury prevention paradox. *Br J Sports Med* 50(5).
