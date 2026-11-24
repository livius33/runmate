---
phase: 13-instagram
plan: 01
updated: 2026-11-21
description: "Instagram pipeline: tasks 2 to 4 built as a local dry run; account, token and publishing are open"
type: Progress
about: "Runmate"
---


# Phase 13 Plan 01: progress after tasks 2 to 4

**The pipeline runs as a dry run from local files: briefs → fact check → cards → queue → approval page. It lives in
its own local repository (`runmate-marketing`, no remote yet), reads this repo as a checkout and needs no account,
no token and no network. 90 tests, type check clean; a dry run writes five posts with 32 cards.**

| AC | State |
|----|-------|
| 1 Dry run produces a week | Done: five fixture posts for 2026-W48 from four research notes |
| 2 Fact check rejects | Done: number not in the cited lines, converted units, forbidden claims, unnamed methods or authors, bad references (tests) |
| 3 Nothing unapproved is published | Done: approval is bound to a hash over caption, brief and card images; tested against a mocked API |
| 4 Publish carousel and story | Open: needs the account and token |
| 5 Token refresh | Open |
| 6 Twelve seed posts approved | Open: five fixtures exist, none approved |
| 7 No secret in either repo | Holds so far: the local repo ignores `.env*`, keys and output |

## Decisions taken while building

- Rendering with satori and resvg directly instead of `next/og`: the pipeline is not a Next.js app.
- A cited source range is at most 30 lines; otherwise citing a whole note would let any number through.
- Approval is a static page that exports a decisions file; a script applies it. A decision made on an outdated page
  is refused, an edited caption is fact-checked again.
- A comparison card colours each side by a tone in the brief (neutral, warn, good), not by position.
- A second word list rejects the author's own training, which the research notes use as a worked example. It is a
  word list: a bare figure from that example still needs the reviewer's eye.

## Not verified

- The planner against the real Claude API (output format, quality, cost); it is tested with a mocked client.
- The export of decisions from the approval page in a browser; approving in the page and applying a decisions file
  from the command line both work.

## Found in the research notes

- `long-run.md` gives the Frandsen cohort as 5,205 runners in one place and "5.200" in the German app text.
- Coyle 1986 measured trained cyclists; the notes generalise to trained athletes.
- `adaptation.md` writes the long-run limit as "1.10 ×", `long-run.md` as "10 %". The fact check treats these as
  different numbers, so a post has to cite the note whose wording it uses.

## Next

Tasks 5 to 8 wait for the checkpoint with Livius (task 6): handle, account, Meta app, token. Seed posts (task 5)
can be drafted before that, with an `ANTHROPIC_API_KEY` for the planner or by hand as fixtures.
