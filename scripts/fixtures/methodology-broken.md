---
id: methodology-broken
name: Kaputte Vorlage (Testdatei)
version: 1
distances: [marathon]
summary: Absichtlich fehlerhaft, für scripts/check-methodologies.mts --fixture und die Tests.
sources:
  - { author: "Test", year: 2026, title: "Fixture" }
phases:
  split: { base: 0.30, build: 0.40, peak: 0.25 }
  taper: { weeks: { marathon: 3 }, volume: [0.7, 0.5, 0.25] }
volume:
  start: 0.5
  phases: { base: [0.5, 0.7], build: [0.75, 0.95], peak: [0.9, 1.0] }
  ramp_max: 0.25
  recovery_week: { every: 4, volume: 0.7 }
intensity:
  base:  { easy: 0.9, moderate: 0.1, hard: 0 }
  build: { easy: 0.8, moderate: 0.15, hard: 0.05 }
  peak:  { easy: 0.8, moderate: 0.15, hard: 0.05 }
  taper: { easy: 0.85, moderate: 0.15, hard: 0 }
week:
  runs: 6
  key_sessions: { base: 1, build: 2, peak: 2, taper: 1 }
  key_gap_days: 2
  long_run: { share: 0.3, max_km: 32, max_minutes: 180 }
  long_run_maxkm: 35
workouts:
  base: [{ kind: fartlek, unit: minutes, from: 20, to: 30 }]
  build: []
  peak: []
  taper: []
paces: { source: goal_time, offsets: { easy: 80 } }
adaptation:
  thresholds: { tsb_fatigue: -25, acwr_caution: 1.5 }
  fatigue: { share: 0.7, days: 3 }
  missed_km: { strategy: redistribute, cap_pct: 0.3, cap_km: 5 }
  missed_key: { strategy: move, max_shift_days: 7 }
  volume_review: { weeks: 3, below: 0.85, above: 1.15 }
  triggers: { missed_km: volume_adjustment }
---
Absichtlich fehlerhaft: Phasen-Summe 0,95, unbekanntes Feld long_run_maxkm, unbekannte Einheit fartlek, Steigerung 25 %.
