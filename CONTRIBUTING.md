# Contributing to Runmate

Thanks for helping. Runmate is pre-release, so please open an issue before a larger change.

## Workflow

1. Fork, then create a branch: `feature/<name>`, `fix/<name>` or `chore/<name>`.
2. `npm ci`, then keep these green before you open a pull request:
   - `npx tsc --noEmit`
   - `npm test` (Vitest; pure plan/analytics logic, no database or network)
3. One topic per pull request, against `main`, with a short description of what changes for the runner.

## Ground rules

- Plan logic is pure and tested. A new rule cites its source in `methodologies/research/` (or says it is a
  convention), and gets a test in `tests/`.
- Never hard-code heart-rate values: use `lib/analytics/hr.ts`.
- No real personal data in code, tests or fixtures (activities, health values, emails, tokens). Use synthetic data or
  the example block in `examples/`.
- The UI is German for now; code, comments and docs are English.

## Contributor License Agreement (CLA)

Runmate is licensed under the AGPL-3.0, and the project may also offer it under other terms (for example for the hosted
version). To keep that possible, every contributor signs a short CLA before the first pull request is merged: you keep
the copyright in your contribution and grant the project a perpetual, worldwide, non-exclusive licence to use,
modify, sublicense and relicense it. The CLA text and signing flow will be linked here before the repository is
public; until then, please do not open pull requests.
