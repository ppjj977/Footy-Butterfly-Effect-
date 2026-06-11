# Butterfly — counterfactual football engine

> Pick a real season, change **one thing**, watch the engine re-simulate history.
> "You cancelled the Cantona transfer. United finish 4th."

This file is the project brief + working notes for anyone (human or agent)
picking the codebase up. The full original brief is in
`docs/butterflybuildprompt.md`.

## What it is

A static, zero-backend browser game. The whole interaction is:
**pick season → pick one intervention → watch the alternate timeline reveal**
(animated table diff, templated headlines, key swing moments, share card).
A run takes under two minutes and is infinitely replayable via re-seeding.

## Design pillars (priority order — do not relitigate)

1. **Plausibility over chaos.** The alternate timeline must feel like it could
   have happened. Credibility is the product.
2. **One change, big story.** Exactly three intervention types (§ interventions).
3. **Shareable timelines.** Output is a screenshot-worthy card + a seed URL that
   reproduces the exact timeline.

## Architecture

```
pipeline/                 Python: emits public/data/seasons/*.json (offline)
public/data/seasons/      Per-season JSON + manifest.json (lazy-loaded)
src/engine/               PURE TypeScript — no DOM, no fetch, no Date.now
  rng.ts elo.ts poisson.ts impact.ts table.ts rewrite.ts headlines.ts
src/lib/                  data loader, share-URL codec, share-card canvas
src/components/           React UI (Vite + Tailwind), mobile-first single flow
tests/                    vitest — engine + calibration backtest + rewrite
```

**Engine purity is non-negotiable:** `runTimeline(seasonData, intervention,
seed) → Timeline` is deterministic and unit-tested. Keep DOM/IO out of
`src/engine/`.

## The model

- **Strength:** per-team Elo (ClubElo when fetched live; otherwise derived from
  real final points in the curated dataset).
- **Matches:** independent Poisson with a draw-inflation term; expected goals
  from Elo difference + home advantage (`elo.ts` / `poisson.ts`).
- **Player impact:** `impact = clamp(W_min·minShare + W_val·valShare +
  W_ga·gaShare, 0, 90)`, GK ×0.7. Pre-2004 (no valuations) falls back to a
  minutes + G/A formula. Pipeline and engine share the formula (`impact.ts` ↔
  `pipeline/impact_calc.py`).
- **Momentum:** a flipped result applies ±25 Elo decaying linearly over 6
  fixtures to both teams.
- **Minimal-rewrite rule:** only *touched* teams' fixtures from the intervention
  point onward are re-simulated; everything else keeps its real result. The
  canonical timeline is one seeded draw; 500 background sims give the
  probability footnote ("Arsenal still win it 62% of the time").

## Interventions (exactly three)

| Type | Input | Effect |
|---|---|---|
| `flip` | a fixture + new outcome | result fixed; both teams' later fixtures re-simulated with momentum |
| `cancel_transfer` | a season incoming | buyer loses the player's impact (from the transfer date); in-league seller regains it |
| `injure` | player ≥1500 mins + 3/6 months + start | club loses impact for the window |

## Data pipeline

`python3 pipeline/build.py` emits the season JSONs + `manifest.json` +
`pipeline/validation_report.md`.

Three sources, in preference order (`fetch.py`): live football-data.co.uk +
clubelo.com → CSVs in `pipeline/data/raw/` → the **curated embedded dataset**
in `seasons_data.py`. The repo ships the curated path so the site is playable
**with no network access**. The curated builder generates a deterministic
double round-robin, then reconciles outcomes/goals so the baseline table
matches each season's real standings exactly on points (and closely on goal
difference); famous unbeaten records are pinned. `dataSource` in each file is
`curated-model` to flag provenance in the UI footer.

Cross-source club-name mapping is **explicit** (`NAME_MAP` in `fetch.py`) and
fails loudly — never fuzzy-match silently.

## Commands

```
npm run dev          # Vite dev server
npm run build        # tsc -b && vite build  → dist/ (Cloudflare Pages)
npm test             # vitest: engine + calibration + rewrite
npm run calibrate    # the Phase 1 backtest report
python3 pipeline/build.py   # regenerate season data
```

## Phase gates (status)

- **Phase 0 — pipeline:** ✅ all seasons validate; baseline points exact.
- **Phase 1 — engine + calibration:** ✅ gate passes — real champion ranks top-2
  by simulated title probability in 100% of seasons (`tests/calibration.test.ts`).
  *Note:* curated Elo is derived from real points, so MAE is low by
  construction; with live ClubElo data this becomes a genuine out-of-sample test.
- **Phase 2 — rewrite logic:** ✅ three interventions + minimal-rewrite +
  momentum + headline generator, golden behavioural tests in `tests/rewrite.test.ts`.
- **Phase 3 — UI + share:** ✅ full selection flow, animated table diff, PNG
  share card, seed URLs (`?l=PL&y=1995&i=…&s=…`).

## Guardrails

Headlines are **templated, outcomes only** (positions, points, trophies,
relegation) — no generated claims about individuals' conduct, no runtime LLM.
Every share card carries a visible **SIMULATION** tag; the footer states it's an
independent fan project with no affiliation, stats from public sources.

## Adding a season

Append a `Season` to `SEASONS` in `pipeline/seasons_data.py` (real final
standings + curated transfers/players), run the pipeline, commit the new JSON.
The format is league-agnostic — La Liga / Serie A are config additions.

## Parked (v2, do not build now)

Chaos Mode (full re-sim), multi-season cascades, other leagues, cups, manager
interventions, challenge mode.
