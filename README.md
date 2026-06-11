# 🦋 Butterfly

A browser-based **counterfactual football engine**. Pick a real Premier League
season, change exactly **one thing**, and watch the engine re-simulate history
into an alternate timeline — a new final table, changed outcomes, and
newspaper-style headlines.

> _"You cancelled the Aguero transfer. United win the league."_

Infinitely replayable, instantly restartable, no accounts, no backend.

![simulation](https://img.shields.io/badge/SIMULATION-fan%20project-red)

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

Build the static site (Cloudflare Pages target):

```bash
npm run build          # → dist/
npm run preview
```

Run the engine tests + the calibration backtest:

```bash
npm test
npm run calibrate
```

## How it works

1. **Pick a season** — three iconic ones ship: 1995/96 (Newcastle's collapse),
   2003/04 (the Invincibles), 2011/12 (Aguerooo).
2. **Change one thing:**
   - **Flip a result** — pick a fixture, force a different outcome. Both teams'
     later fixtures are re-simulated with a decaying momentum swing.
   - **Cancel a transfer** — undo a signing; the buyer loses the player's impact.
   - **Injure a player** — rule a star out for 3 or 6 months.
3. **Watch the timeline reveal** — animated table diff, templated headlines, the
   biggest swing moments, and a probability footnote from 500 background
   simulations.
4. **Share** — download the PNG card or copy a seed URL that reproduces the exact
   timeline (`?l=PL&y=1995&i=…&s=…`). Hit **Run it again** to re-roll the same
   counterfactual with a new seed.

The engine (`src/engine/`) is pure, deterministic TypeScript:
`runTimeline(season, intervention, seed)` is a unit-tested pure function. See
[CLAUDE.md](./CLAUDE.md) for the model, the minimal-rewrite rule, and the phase
gates.

## Data

Season data lives in `public/data/seasons/*.json`, produced by the offline
Python pipeline:

```bash
python3 pipeline/build.py
```

The pipeline prefers live public sources (football-data.co.uk results +
clubelo.com Elo) and falls back to CSVs in `pipeline/data/raw/`. When neither is
reachable it uses the **curated embedded dataset** (`pipeline/seasons_data.py`)
that ships with this repo, so the game is fully playable offline. Curated
baselines reconcile to each season's **real final standings** (exact points,
near-exact goal difference, pinned unbeaten records); strength comes from
per-team Elo.

## Disclaimer

Independent fan project. No affiliation with any club, league, or data
provider. All output is a **simulation**; headlines describe outcomes only
(positions, points, trophies, relegation). Stats are derived from public
sources.
