---
description: "Open-source running-training web app: plan generator, adaptive plan, analysis; self-host free, hosted at runmate.dev"
type: Project
about: "Runmate"
---

# Runmate

## What This Is

Runmate is a running-training web app. It imports activities (Garmin, Apple Health, files), builds a training plan
from fixed and documented rules, compares plan and actual runs, and adapts the plan with a reason for every change.
Two products from one codebase: the public AGPL-3.0 repo to clone and self-host, and the hosted app at runmate.dev
with a landing page for people who do not want to run a server. The UI is in German.

## Core Value

A runner sees each day what to run and why. The plan fits their life (days, volume, goals), reacts to what was
actually run, and can be changed at any time, as far as the data allows, with every change explained.

## Current State

| Attribute | Value |
|-----------|-------|
| Type | Application (multi-user) |
| Version | 1.0.0 (not yet public) |
| Status | Pre-launch: code separated from the private dashboard, deployment not yet |
| Last Updated | 2026-11-18 |

## Requirements

### Validated (v1.0 "Launch", phases 1–7, see docs/LAUNCH-PLAN.md and docs/phases/)

- [x] Own repo without finance code or personal data, AGPL-3.0, Docker self-host
- [x] Multi-user: every row scoped to its user
- [x] Data sources behind one adapter: Garmin, Apple Health, file import
- [x] Billing via Paddle, entitlements in one module, export and delete never gated
- [x] Demo athlete (read-only), onboarding, landing page, legal pages with placeholders
- [x] Plan generator from methodology templates, plan engine, kettlebell days, sleep/HRV

### Active (v1.1 "Shipping-ready", phases 8–12)

- [ ] Every feature tested, including niche paths; known bugs fixed (kettlebell toggle)
- [ ] Pricing: hosted Free + Plus (9 €/month, 79 €/year), 30-day Plus trial, then Free
- [ ] "Plan anpassen" changes the whole plan: goal and race, everyday life, interruption, suggestions and history
- [ ] Onboarding for a new user: sign in → data source → goals and profile → first plan → overview
- [ ] Deployment separated: own Vercel project, runmate.dev, repo public
- [ ] Design pass (discussed with Livius before it is built)

### Out of Scope

- Finance and anything personal from the private dashboard
- AI-written plans or texts: rules are fixed and traceable
- Native apps

## Constraints

- CLAUDE.md rules: user scoping, entitlements only via lib/billing/entitlements.ts, export/delete never gated,
  `npx tsc --noEmit` + `npm test` green, `next build` without a database, UI German, code and docs English
- Generator and engine rules need a research note in methodologies/research/ first
- Overview pages use a wide grid or week strip, never a narrow column of stacked cards
- Branches from `main`, one PR per self-contained change, no stacked PRs; Livius merges
- Planning before v1.1 lives in docs/phases/ and docs/LAUNCH-PLAN.md; from v1.1 on in .paul/
