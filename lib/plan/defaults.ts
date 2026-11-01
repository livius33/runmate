// Plan defaults without imports (lib/plan/blocks.ts and rules.ts import each other; these must not be part of that cycle).

// Stop rules for every block that brings none of its own (generated blocks copy them at go-live).
export const DEFAULT_STOP_RULES = [
  'HF im lockeren Lauf mehr als 8–10 Schläge über Normalwert → Einheit abbrechen.',
  'Symptome unterhalb des Halses, Fieber, Gliederschmerzen → Pause, ohne Ausnahme.',
  'Tempoeinheit nur auf erholten Beinen. Auf müden trainiert man Erschöpfungstoleranz, nicht Schwelle.',
]

// Training paces when no block gives any (no block yet, or a block frozen without paces and no race pace).
// Example values for a 5:00/km race pace, derived like blockPaces() does for generated blocks.
// TODO(Phase 2): derive from the user's profile (user_profile) instead.
export const DEFAULT_PACES: Record<string, string> = { easy: '6:20', threshold: '4:52', intervals_vo2: '4:35', race: '5:00' }
