# Launch: go-public checklist and announcement drafts

Drafts only: Livius posts them himself. Keep them honest: no invented user numbers, stars or testimonials; the
Garmin login is unofficial and experimental; Runmate is no medical device.

## Go-public checklist (in order)

1. `main` CI green (tests + gitleaks over the full history).
2. Legal templates filled (`grep -rn "PLATZHALTER" "app/(legal)"` is empty) — only needed if a public instance runs.
3. Set `NEXT_PUBLIC_REPO_URL=https://github.com/livius33/runmate` on the landing-page deployment.
4. GitHub: Settings → General → Danger Zone → **Change visibility → Public**. Then enable: Issues, Discussions
   (Q&A), private vulnerability reporting (Security → Advisories), branch protection on `main` (no required CI checks: the label-gated jobs count as passed when skipped; see
   CLAUDE.md, "Pull requests and CI").
5. Repository topics: `running`, `training-plan`, `marathon`, `self-hosted`, `garmin`, `nextjs`, `agpl`.
6. Post in this order, a day or two apart, and answer comments the same day: r/selfhosted → Show HN →
   r/AdvancedRunning → r/Garmin → r/laufen → intervals.icu forum. Product Hunt once hosted billing is live.

## r/selfhosted

**Title:** Runmate — self-hosted adaptive running training plans (Next.js + Postgres, AGPL)

I built Runmate for my own marathon training and have now opened it up. It generates a training block for a goal race
from published methods (Daniels, Pfitzinger, Hansons, Lydiard, Norwegian threshold, 80/20 or your own), then adapts
it to what you actually run: missed key sessions move, missed kilometres are rebalanced within safe caps, and a
fatigue guard softens sessions when your load (TSB/ACWR) gets too high. Every change is explained and can be undone.

- `docker compose up -d` — Postgres, migrations, the app and a daily sync. Neon + Vercel works too.
- Data: Garmin (unofficial login with your own credentials, experimental, stored encrypted), Apple Health via an iOS
  Shortcut, or file import (FIT/GPX/TCX/Garmin export ZIP).
- Multi-user: each person has their own profile, zones, sources and plans. Sign-in via Clerk (free tier).
- Run analysis, CTL/ATL/TSB, race-week checklist, pacing plan, a private ICS calendar feed of the plan.
- The UI is German for now; code and docs are English.

Repo: https://github.com/livius33/runmate · Self-host guide: docs/SELF-HOST.md

Feedback on the setup is very welcome — especially if something in the Compose file doesn't work on your box.

## Show HN

**Title:** Show HN: Runmate – training plans from published methods that adapt to your actual runs

Runmate is an open-source (AGPL) training-plan app for half and full marathons. Instead of an AI writing a plan, it
encodes published methods as plain Markdown + YAML templates (the research notes behind each rule are in the repo) and
a deterministic rule engine adapts the block when reality differs: a missed long run moves, unrun kilometres are
spread over the next days within caps, and a fatigue guard reacts to TSB/ACWR. Every change carries its reason.

Stack: Next.js 15, Postgres (Neon or plain), Drizzle, Clerk. Self-host with Docker Compose; a hosted version is
planned. Data comes from an unofficial Garmin login (experimental — the official API is applied for), Apple Health or
file import.

I'd love feedback on the engine rules and the template format: https://github.com/livius33/runmate

## r/AdvancedRunning

**Title:** I turned Daniels/Pfitz/Hansons/Norwegian-threshold into machine-readable templates + an adaptive engine (open source)

The templates are Markdown with YAML for the numbers (weekly structure, key sessions, long-run caps, taper), each with
its sources, and the "why" for every generated number is shown in the app. The engine handles the boring cases: moved
or missed key sessions, rebalancing unrun km, illness with a graded return, tune-up races inside a block, and a fatigue
guard based on CTL/ATL/TSB and ACWR.

I'm most interested in where the rules are wrong for you — e.g. how much missed volume should ever be made up, or when
a key session should be dropped instead of moved. Methods and research notes:
https://github.com/livius33/runmate/tree/main/methodologies

## r/Garmin

**Title:** Open-source training-plan app that reads your Garmin runs (self-hosted)

Runmate imports your runs via your own Garmin login (unofficial and experimental — no MFA support, Garmin can change
it any time; the official developer API is applied for) or from the Garmin data-export ZIP. It then builds and adapts a
training plan, analyses each run (splits, HR zones, comparison with similar runs) and tracks load (CTL/ATL/TSB).
Credentials are stored encrypted on your own instance. https://github.com/livius33/runmate

## r/laufen (Deutsch)

**Titel:** Runmate – Open-Source-Trainingspläne, die sich an deine echten Läufe anpassen

Ich habe mir für mein Marathontraining eine App gebaut und sie jetzt als Open Source veröffentlicht. Sie erstellt
einen Trainingsblock für dein Zielrennen nach bekannten Methoden (Daniels, Pfitzinger, Hansons, Lydiard, norwegisches
Schwellentraining, 80/20 oder eine eigene) und passt ihn an: verpasste Schlüsseleinheiten werden verschoben, fehlende
Kilometer mit Obergrenzen verteilt, bei zu hoher Belastung werden Einheiten entschärft. Jede Änderung wird erklärt und
lässt sich rückgängig machen. Die Oberfläche ist auf Deutsch.

Daten: Garmin-Login (inoffiziell, experimentell), Apple Health per Kurzbefehl oder Datei-Import. Selbst hosten mit
Docker Compose; eine gehostete Version ist in Arbeit. Kein Medizinprodukt.

https://github.com/livius33/runmate — Feedback zu den Regeln ist sehr willkommen.

## intervals.icu forum

**Title:** Runmate: open-source plan generator + adaptive engine (CTL/ATL/TSB, ACWR)

Short intro, link to `methodologies/research/` and the engine rules, and an explicit question: would an intervals.icu
import or calendar push be useful? (Only if the forum's rules allow tool announcements — check the category first.)
