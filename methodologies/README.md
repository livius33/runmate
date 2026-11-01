# Trainingsmethoden (Vorlagen)

Jede Datei `<id>.md` in diesem Ordner ist eine **Trainingsmethode**: eine Vorlage, aus der Runmate Pläne erzeugt (ab 07-02)
und nach der Runmate Pläne anpasst (ab 07-07). Du wählst eine Vorlage und kannst jeden Wert für dich ändern („Mein Ansatz“,
ab 07-05) – die Datei selbst bleibt unverändert.

Eine Datei hat zwei Teile:

1. **YAML-Kopf** zwischen `---` und `---`: alle Werte, die der Generator und die Anpassung lesen. Er wird beim Laden geprüft
   (`lib/plan/methodology/schema.ts`); Tippfehler, fehlende Felder und Werte über den Sicherheitsgrenzen werden mit Feld und
   Grund gemeldet, die übrigen Vorlagen laden trotzdem.
2. **Text** darunter (Deutsch): die Idee, der Wochenaufbau, die Phasen, wie angepasst wird, Quellen – in eigenen Worten,
   **keine Zitate aus Büchern**. Er erscheint in der App als „Warum dieser Ansatz“.

Prüfen: `npx tsx scripts/check-methodologies.mts` (alle Vorlagen gültig? Bericht: Beispiel-Vorlage gegen den Beispielplan in `examples/porto-2026/`) und `npm test`.

## Felder

Anteile sind Zahlen von 0 bis 1 (0,25 = 25 %). „Spitze“ = die Woche mit den meisten Kilometern.

| Feld | Bedeutung |
|------|-----------|
| `id` | Dateiname ohne `.md`, nur Kleinbuchstaben, Ziffern, `-` |
| `name`, `summary` | Anzeigename und ein, zwei Sätze für die Auswahl |
| `version` | ganze Zahl; erhöhen, wenn sich Werte ändern |
| `distances` | für welche Rennen: `10k`, `half`, `marathon` |
| `sources` | Quellen: `author`, `year`, `title`, optional `note` |
| `phases.split` | Anteil der Wochen vor dem Taper für `base` (Grundlage), `build` (Aufbau), `peak` (Spitze); Summe 1 |
| `phases.taper.weeks` | Taper-Wochen je Distanz (inkl. Rennwoche) |
| `phases.taper.volume` | Umfang jeder Taper-Woche als Anteil der Spitze; der letzte Wert ist die Rennwoche (ohne Rennen) |
| `volume.start` | Umfang der ersten Woche als Anteil der Spitze |
| `volume.phases` | je Phase `[Start, Ende]` als Anteil der Spitze (leichte Wochen nicht mitgezählt) |
| `volume.ramp_max` | höchste Steigerung von einer Woche zur nächsten (nicht nach einer leichten Woche) |
| `volume.recovery_week` | jede `every`-te Woche leichter, Umfang `volume` im Verhältnis zur Woche davor |
| `intensity.<phase>` | Anteil der km `easy` (locker), `moderate` (Marathon- bis Schwellentempo: höchstens 15 s/km schneller als das Renntempo), `hard` (schneller); Summe 1 |
| `week.runs` | Läufe pro Woche |
| `week.key_sessions` | Schlüsseleinheiten pro Woche je Phase |
| `week.key_gap_days` | Mindestabstand zwischen zwei Schlüsseleinheiten in Tagen |
| `week.long_run` | langer Lauf: höchstens `share` der Woche, `max_km`, `max_minutes` |
| `workouts.<phase>` | erlaubte Einheiten je Phase: `kind`, `unit` (`km`, `reps`, `minutes`), Steigerung `from` → `to`, optional `note` |
| `paces.source` | woraus die Tempi kommen: `goal_time` (Zielzeit), `vdot` (Wettkampfergebnis), `threshold` (Schwellentempo) |
| `paces.offsets` | Tempi als Abstand zum Renntempo in s/km (+ = langsamer): `easy`, `recovery`, `long`, `marathon_pace`, `half_marathon_pace`, `threshold`, `intervals_vo2`, `strides` |
| `adaptation.thresholds` | Ermüdung ab TSB unter `tsb_fatigue` oder ACWR über `acwr_caution` |
| `adaptation.fatigue` | bei Ermüdung: nächste harte Einheit mit `share` der km locker, Blick auf `days` Tage |
| `adaptation.missed_km` | verpasste km: `redistribute` (auf lockere Tage verteilen, höchstens `cap_pct` bzw. `cap_km` pro Tag) oder `drop` |
| `adaptation.missed_key` | verpasste Schlüsseleinheit: `move` (höchstens `max_shift_days` später) oder `drop` |
| `adaptation.volume_review` | Umfang der letzten `weeks` Wochen: unter `below` → weniger, über `above` (und frisch) → mehr |
| `adaptation.triggers` | welche Strategie auf welchen Auslöser antwortet (siehe unten) |

**Einheiten (`kind`):** `easy`, `recovery`, `strides` (Steigerungen), `hills`, `tempo`, `threshold` (Schwelle),
`intervals_vo2`, `marathon_pace`, `half_marathon_pace`, `medium_long` (mittellanger Lauf), `long_easy`, `long_with_pace`
(langer Lauf mit Tempoblock), `progression`, `test` (Generalprobe, Testrennen).

**Auslöser → Strategien:** Auslöser `missed_km`, `missed_key`, `fatigue_tsb`, `acwr_high`, `volume_below`, `volume_above`;
Strategien `volume_adjustment`, `recovery_week_insertion`, `intensity_reduction`, `workout_reordering`, `goal_adjustment`,
`phase_restructuring`, `workout_swapping`, `complete_replan`.

## Sicherheitsgrenzen

Diese Grenzen stehen im Code (`lib/plan/methodology/safety.ts`), nicht in den Vorlagen; keine Vorlage und keine eigene Änderung
kann sie überschreiten:

- Steigerung pro Woche höchstens 15 %
- leichte Woche höchstens 90 % der Woche davor; Taper-Wochen nie über der Spitze
- langer Lauf höchstens 40 % der Woche, 42 km und 240 Minuten
- ACWR-Grenze höchstens 1,5; TSB-Grenze zwischen −40 und −10
- verpasste km verteilen: pro Tag höchstens +50 % und +8 km
- abgeschwächte Einheit behält mindestens die Hälfte ihrer km

Dazu Regeln, die nie abgeschaltet werden: Renntag und feste Termine bleiben, vergangene Tage ändern sich nicht, Taper- und
Erholungswochen bekommen keine zusätzlichen km, eigene Änderungen gehen immer vor; ein verpasster Test wird nur vor dem Taper
nachgeholt und nur, wenn kein weiterer Test davor kommt.

## Neue Vorlage anlegen

1. Datei `methodologies/<id>.md` anlegen (am einfachsten eine vorhandene Vorlage kopieren, z. B. `pfitzinger-marathon.md`), `id` = Dateiname.
2. Werte aus der Quelle übernehmen und im Text begründen, Quellen nennen.
3. `npx tsx scripts/check-methodologies.mts` und `npm test` laufen lassen.
