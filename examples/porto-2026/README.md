# Example block: Porto Marathon 2026

A real, hand-written training block: the last eleven weeks of a 3:05 marathon build for the Porto Marathon on
8 November 2026 (race-pace long runs, a dress rehearsal, a half marathon as the final test, a two-week taper and three
recovery weeks). It shows what a plan file looks like and is the fixture most plan tests run against.

| File | What it is |
|---|---|
| `plan.ts` | The block as data: race, weeks, day-by-day sessions, pacing splits, rules, paces (`TrainingBlock`) |
| `runmate-porto-2026.md` | A methodology template that reproduces this plan's structure |
| `template.ts` | Loads that template (it is not in `methodologies/`, so the app never offers it) |
| `season.ts` | Example season goals after the block (used by the tests) |
| `porto-marathon.gpx` | The course (2024 route) for the course map |

## Use it in the app

1. Register it in `lib/plan/plan-files.ts`:
   ```ts
   import { PORTO_2026 } from '@/examples/porto-2026/plan'
   export const PLAN_FILES: TrainingBlock[] = [PORTO_2026]
   ```
2. Copy `porto-marathon.gpx` to `public/` for the course map and race strategy cards.

A hand-written block is read-only on the Saison page, minor races are not applied to it, and its recovery day is Sunday.
Paces and HR numbers in it belong to the runner it was written for; the app's own HR model is `lib/analytics/hr.ts`.
