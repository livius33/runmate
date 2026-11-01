export type QuestionType = 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'time'

export interface ProfileQuestion {
  id:       string
  category: string
  question: string
  type:     QuestionType
  options?: string[]
  unit?:    string
  hint?:    string
}

export const PROFILE_QUESTIONS: ProfileQuestion[] = [

  // ── 1. Rennen & Ziele ─────────────────────────────────────────────────────
  {
    id: 'primary_race', category: 'Rennen & Ziele',
    question: 'Was ist dein wichtigstes Rennen in dieser Saison?',
    type: 'text', hint: 'Name, Datum, Distanz'
  },
  {
    id: 'marathon_goal', category: 'Rennen & Ziele',
    question: 'Welches Zeitziel hast du für dein Hauptrennen?',
    type: 'time', hint: 'z.B. 2:58:00',
  },
  {
    id: 'hm_goal', category: 'Rennen & Ziele',
    question: 'Welches Zeitziel hast du für dein zweites Rennen (falls vorhanden)?',
    type: 'time', hint: 'z.B. 1:24:30',
  },
  {
    id: 'other_races_2026', category: 'Rennen & Ziele',
    question: 'Planst du weitere Rennen in dieser Saison?',
    type: 'text', hint: 'Datum + Distanz, oder "Nein"',
  },
  {
    id: 'marathon_pr', category: 'Rennen & Ziele',
    question: 'Deine bisherige Marathon-Bestzeit?',
    type: 'time', hint: 'z.B. 3:12:00 — oder "noch keinen"',
  },
  {
    id: 'hm_pr', category: 'Rennen & Ziele',
    question: 'Deine bisherige Halbmarathon-Bestzeit?',
    type: 'time', hint: 'z.B. 1:31:00',
  },
  {
    id: 'ten_k_pr', category: 'Rennen & Ziele',
    question: 'Deine bisherige 10km-Bestzeit?',
    type: 'time', hint: 'z.B. 40:30',
  },
  {
    id: 'last_race', category: 'Rennen & Ziele',
    question: 'Wann war dein letztes Rennen und welche Distanz/Zeit?',
    type: 'text',
  },
  {
    id: 'past_limiters', category: 'Rennen & Ziele',
    question: 'Was hat dich bei vergangenen Rennen oder in Training gebremst?',
    type: 'multiselect',
    options: ['Verletzung', 'Zu wenig km-Basis', 'Schlechter Renntag', 'Motivation', 'Übertraining', 'Ernährung im Rennen', 'Anderes'],
  },
  {
    id: 'longterm_goal', category: 'Rennen & Ziele',
    question: 'Hast du ein langfristiges Laufziel über 2026 hinaus?',
    type: 'text', hint: 'z.B. BQ, Sub-3h, Ultra, Ironman, oder "Nein"',
  },

  // ── 2. Aktuelles Training ─────────────────────────────────────────────────
  {
    id: 'current_weekly_km', category: 'Aktuelles Training',
    question: 'Wie viele km läufst du aktuell im Wochendurchschnitt?',
    type: 'number', unit: 'km',
  },
  {
    id: 'runs_per_week', category: 'Aktuelles Training',
    question: 'Wie viele Läufe pro Woche?',
    type: 'select', options: ['3', '4', '5', '6', '7'],
  },
  {
    id: 'running_years', category: 'Aktuelles Training',
    question: 'Wie viele Jahre läufst du bereits ernsthaft?',
    type: 'select', options: ['< 1 Jahr', '1–3 Jahre', '3–5 Jahre', '5–10 Jahre', '10+ Jahre'],
  },
  {
    id: 'yearly_km', category: 'Aktuelles Training',
    question: 'Schätze deine gesamten Lauf-km der letzten 12 Monate',
    type: 'number', unit: 'km',
  },
  {
    id: 'max_week_ever', category: 'Aktuelles Training',
    question: 'Was war deine höchste Trainingswoche (km) aller Zeiten?',
    type: 'number', unit: 'km',
  },
  {
    id: 'longest_run_ever', category: 'Aktuelles Training',
    question: 'Was war dein längster Lauf je?',
    type: 'number', unit: 'km',
  },
  {
    id: 'high_volume_experience', category: 'Aktuelles Training',
    question: 'Wie oft hast du Wochen mit >80km trainiert?',
    type: 'select', options: ['Noch nie', '1–5x', 'Gelegentlich (5–20x)', 'Regelmäßig (20x+)'],
  },
  {
    id: 'strength_training', category: 'Aktuelles Training',
    question: 'Machst du Krafttraining?',
    type: 'select', options: ['Nie', '1x pro Woche', '2x pro Woche', '3x+ pro Woche'],
  },
  {
    id: 'mobility_routine', category: 'Aktuelles Training',
    question: 'Machst du Mobility/Stretching/Yoga?',
    type: 'select', options: ['Täglich', 'Mehrmals pro Woche', 'Selten', 'Nie'],
  },
  {
    id: 'has_current_plan', category: 'Aktuelles Training',
    question: 'Trainierst du derzeit nach einem Trainingsplan?',
    type: 'select', options: ['Ja, strikter Plan', 'Grobe Struktur', 'Freestyle', 'Deins (dieses Dashboard)'],
  },

  // ── 3. Zeitplan & Alltag ──────────────────────────────────────────────────
  {
    id: 'available_days', category: 'Zeitplan & Alltag',
    question: 'Wie viele Tage pro Woche kannst du maximal trainieren?',
    type: 'select', options: ['4', '5', '6', '7'],
  },
  {
    id: 'best_days', category: 'Zeitplan & Alltag',
    question: 'Welche Wochentage sind am besten für längere/härtere Einheiten?',
    type: 'multiselect',
    options: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
  },
  {
    id: 'preferred_time', category: 'Zeitplan & Alltag',
    question: 'Wann läufst du hauptsächlich?',
    type: 'select', options: ['Früh morgens (vor 7h)', 'Morgens (7–9h)', 'Mittags', 'Abends', 'Flexibel'],
  },
  {
    id: 'max_weekday_time', category: 'Zeitplan & Alltag',
    question: 'Wie viel Zeit hast du werktags maximal für einen Lauf?',
    type: 'select', options: ['45 min', '60 min', '75 min', '90 min', '2h+', 'Flexibel'],
  },
  {
    id: 'blocked_days', category: 'Zeitplan & Alltag',
    question: 'Gibt es Wochentage die für Sport absolut ausfallen?',
    type: 'multiselect',
    options: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag', 'Keiner'],
  },
  {
    id: 'avg_sleep', category: 'Zeitplan & Alltag',
    question: 'Wie viele Stunden schläfst du im Durchschnitt?',
    type: 'select', options: ['< 6h', '6–7h', '7–8h', '8h+'],
  },
  {
    id: 'work_stress', category: 'Zeitplan & Alltag',
    question: 'Wie würdest du deinen beruflichen Alltagsstress beschreiben?',
    type: 'select', options: ['Gering', 'Mittel', 'Hoch', 'Sehr hoch / unregelmäßig'],
  },
  {
    id: 'planned_travel', category: 'Zeitplan & Alltag',
    question: 'Gibt es geplante Reisen oder Ereignisse, die Training unterbrechen?',
    type: 'text', hint: 'Datum + Dauer, oder "Nein"',
  },

  // ── 4. Körper & Gesundheit ────────────────────────────────────────────────
  {
    id: 'height_cm', category: 'Körper & Gesundheit',
    question: 'Wie groß bist du?',
    type: 'number', unit: 'cm',
  },
  {
    id: 'weight_kg', category: 'Körper & Gesundheit',
    question: 'Wie viel wiegst du aktuell?',
    type: 'number', unit: 'kg',
  },
  {
    id: 'race_weight_goal', category: 'Körper & Gesundheit',
    question: 'Hast du ein Wettkampfgewicht-Ziel?',
    type: 'text', hint: 'z.B. "70kg" oder "Egal"',
  },
  {
    id: 'resting_hr', category: 'Körper & Gesundheit',
    question: 'Deine Ruheherzfrequenz (morgens vor dem Aufstehen)?',
    type: 'number', unit: 'bpm',
  },
  {
    id: 'max_hr', category: 'Körper & Gesundheit',
    question: 'Deine maximale Herzfrequenz (gemessen oder geschätzt)?',
    type: 'number', unit: 'bpm',
  },
  {
    id: 'current_injuries', category: 'Körper & Gesundheit',
    question: 'Hast du aktuell Verletzungen oder Beschwerden?',
    type: 'text', hint: 'Beschreibe kurz, oder "Keine"',
  },
  {
    id: 'past_injuries', category: 'Körper & Gesundheit',
    question: 'Welche Verletzungen hattest du in den letzten 2 Jahren?',
    type: 'text', hint: 'z.B. "Shin splints links, Achillessehne"',
  },
  {
    id: 'physical_limits', category: 'Körper & Gesundheit',
    question: 'Gibt es körperliche Einschränkungen die ich beim Planen beachten soll?',
    type: 'text', hint: 'z.B. "Knie bei Abfahrten", oder "Keine"',
  },
  {
    id: 'has_physio', category: 'Körper & Gesundheit',
    question: 'Hast du Zugang zu einem Physiotherapeuten oder Sportarzt?',
    type: 'boolean',
  },
  {
    id: 'recovery_days', category: 'Körper & Gesundheit',
    question: 'Wie viele Tage brauchst du typischerweise nach einer harten Einheit bis zur vollständigen Erholung?',
    type: 'select', options: ['1 Tag', '2 Tage', '3 Tage', '3+ Tage'],
  },
  {
    id: 'supplements', category: 'Körper & Gesundheit',
    question: 'Nimmst du Nahrungsergänzungsmittel?',
    type: 'multiselect',
    options: ['Magnesium', 'Protein', 'Eisen', 'Vitamin D', 'Kreatin', 'Omega-3', 'Keine'],
  },

  // ── 5. Laufstil & Equipment ───────────────────────────────────────────────
  {
    id: 'main_surface', category: 'Laufstil & Equipment',
    question: 'Auf welchen Untergründen läufst du hauptsächlich?',
    type: 'multiselect',
    options: ['Asphalt/Straße', 'Waldwege/Trail', 'Tartanbahn', 'Laufband', 'Mix'],
  },
  {
    id: 'has_track', category: 'Laufstil & Equipment',
    question: 'Hast du Zugang zu einer Tartanbahn?',
    type: 'select', options: ['Ja, bequem erreichbar', 'Ja, aber umständlich', 'Nein'],
  },
  {
    id: 'terrain_hills', category: 'Laufstil & Equipment',
    question: 'Wie hügelig ist deine Trainingsumgebung?',
    type: 'select', options: ['Sehr eben (Hamburg-Niveau)', 'Leicht hügelig', 'Hügelig', 'Bergig'],
  },
  {
    id: 'shoes_daily', category: 'Laufstil & Equipment',
    question: 'Welchen Trainingsschuh trägst du täglich?',
    type: 'text', hint: 'z.B. "Nike Pegasus 41"',
  },
  {
    id: 'shoes_race', category: 'Laufstil & Equipment',
    question: 'Welchen Rennschuh planst du für den Marathon?',
    type: 'text', hint: 'z.B. "Alphafly 3" oder "noch unentschieden"',
  },
  {
    id: 'gps_watch', category: 'Laufstil & Equipment',
    question: 'Welche GPS-Uhr nutzt du?',
    type: 'text', hint: 'z.B. "Garmin Fenix 7" oder "Keine"',
  },
  {
    id: 'hr_measurement', category: 'Laufstil & Equipment',
    question: 'Wie misst du deine Herzfrequenz beim Laufen?',
    type: 'select', options: ['Brustgurt (Polar/Garmin)', 'Optisch am Handgelenk', 'Beides', 'Keine'],
  },
  {
    id: 'interval_method', category: 'Laufstil & Equipment',
    question: 'Wie absolvierst du Intervalltraining?',
    type: 'select', options: ['Auf der Bahn nach Zeit/Distanz', 'GPS-Pace', 'Nach Herzfrequenz', 'Nach Gefühl', 'Mache ich nicht'],
  },

  // ── 6. Motivation & Mentalität ────────────────────────────────────────────
  {
    id: 'motivation_drivers', category: 'Motivation & Mentalität',
    question: 'Was motiviert dich am meisten beim Laufen?',
    type: 'multiselect',
    options: ['Bestzeiten jagen', 'Gesundheit & Fitness', 'Meditation/Kopf frei', 'Natur erleben', 'Gemeinschaft/Events', 'Disziplin & Struktur'],
  },
  {
    id: 'bad_week_response', category: 'Motivation & Mentalität',
    question: 'Wie gehst du mit einer schlechten Trainingswoche um?',
    type: 'select', options: ['Einfach weitermachen', 'Bin frustriert, hole es auf', 'Analysiere die Ursache', 'Passt mir den Plan an'],
  },
  {
    id: 'plan_flexibility', category: 'Motivation & Mentalität',
    question: 'Bevorzugst du einen strikten Plan oder Flexibilität?',
    type: 'select', options: ['Strikt (ich folge dem Plan)', 'Grobe Struktur, flexibel in Details', 'Freestyle mit Zielvorgabe'],
  },
  {
    id: 'training_partner', category: 'Motivation & Mentalität',
    question: 'Läufst du lieber allein oder mit anderen?',
    type: 'select', options: ['Allein', 'Mit Laufpartner', 'Laufgruppe', 'Beides je nach Lauf'],
  },
  {
    id: 'music_while_running', category: 'Motivation & Mentalität',
    question: 'Hörst du Musik oder Podcasts beim Laufen?',
    type: 'select', options: ['Immer', 'Nur bei Easy-Läufen', 'Bei Intervallen nie', 'Nie'],
  },
  {
    id: 'overtraining_fear', category: 'Motivation & Mentalität',
    question: 'Wovor hast du mehr Angst?',
    type: 'select', options: ['Zu viel zu trainieren (Verletzung/Burnout)', 'Zu wenig zu trainieren (nicht vorbereitet)', 'Beides gleich'],
  },
  {
    id: 'race_importance', category: 'Motivation & Mentalität',
    question: 'Wie stark hängt dein allgemeines Wohlbefinden von Wettkampfergebnissen ab?',
    type: 'select', options: ['Sehr stark (PB = guter Monat)', 'Mittel', 'Kaum (Prozess ist Ziel)'],
  },

  // ── 7. Ernährung & Recovery ───────────────────────────────────────────────
  {
    id: 'diet_style', category: 'Ernährung & Recovery',
    question: 'Wie ernährst du dich grob?',
    type: 'select', options: ['Ausgewogen/Mischkost', 'Low-Carb', 'Vegan/Vegetarisch', 'High-Carb', 'Ketogen', 'Anderes'],
  },
  {
    id: 'pre_run_carbs', category: 'Ernährung & Recovery',
    question: 'Isst du vor langen Läufen (>90min) Kohlenhydrate?',
    type: 'select', options: ['Immer', 'Meistens', 'Manchmal', 'Nie (trainiere nüchtern)'],
  },
  {
    id: 'race_fueling', category: 'Ernährung & Recovery',
    question: 'Nimmst du Gels/Riegel bei Läufen >75 Minuten?',
    type: 'select', options: ['Immer', 'Manchmal', 'Trainiere ich noch', 'Nie'],
  },
  {
    id: 'alcohol_weekly', category: 'Ernährung & Recovery',
    question: 'Wie viel Alkohol trinkst du pro Woche?',
    type: 'select', options: ['Keinen', '1–3 Gläser', '4–7 Gläser', 'Mehr als 7'],
  },
  {
    id: 'cold_therapy', category: 'Ernährung & Recovery',
    question: 'Machst du regelmäßig Eisbäder oder Kältetherapie?',
    type: 'select', options: ['Ja, regelmäßig', 'Gelegentlich', 'Nein'],
  },
  {
    id: 'sauna', category: 'Ernährung & Recovery',
    question: 'Gehst du regelmäßig in die Sauna?',
    type: 'select', options: ['Regelmäßig (1x+/W)', 'Gelegentlich', 'Selten', 'Nie'],
  },
  {
    id: 'weight_optimization', category: 'Ernährung & Recovery',
    question: 'Wie wichtig ist Gewichtsoptimierung für deine Laufleistung?',
    type: 'select', options: ['Sehr wichtig — aktiv daran arbeitend', 'Mittel — achte darauf', 'Kaum wichtig', 'Gar nicht'],
  },
]

export const QUESTION_CATEGORIES = [
  'Rennen & Ziele',
  'Aktuelles Training',
  'Zeitplan & Alltag',
  'Körper & Gesundheit',
  'Laufstil & Equipment',
  'Motivation & Mentalität',
  'Ernährung & Recovery',
] as const

export type ProfileAnswers = Record<string, string | string[] | number | boolean | null>
