# BUTTERFLY — Claude Code Build Prompt (Draft v0.9)

> Paste everything below this line into Claude Code as the opening prompt. Treat it as the project brief and CLAUDE.md seed.

---

## Mission

Build **Butterfly**, a browser-based counterfactual football engine. The player picks a real historical season, changes exactly **one thing**, and the engine re-simulates the season around that change, producing an alternate timeline: a new final table, changed outcomes, and templated headlines. Infinitely replayable, instantly restartable, no daily mechanic.

**Elevator pitch:** "You cancelled the Cantona transfer. United finish 4th."

**Design pillars (priority order):**
1. **Plausibility over chaos.** The alternate timeline must feel like it could have happened. Credibility is the product.
2. **One change, big story.** The entire interaction is: pick season → pick one intervention → watch history rewrite.
3. **Shareable timelines.** The output is a screenshot-worthy "what if" card with a seed link so others can view the exact same timeline.

**NOT in scope:** daily puzzles, accounts, backend, multi-season cascades, match-event simulation (goalscorer level), manager interventions.

---

## 1. Core Loop

```
SELECT SEASON (league + year, e.g. Premier League 1995/96)
  → SELECT INTERVENTION (one of three types, see 1.2)
  → ENGINE RE-SIMULATES affected fixtures (seeded, see 2)
  → TIMELINE REVEAL: animated table diff, headlines, key swing moments
  → Share card / "Run it again" (same intervention, new seed)
    / "New change" (same season) / "New season"
```

A run takes under 2 minutes. "Run it again" re-rolls the same counterfactual with a new seed, showing the spread of possible histories. This is the replay hook.

### 1.1 Season scope (v1)
Premier League seasons 1995/96 to 2023/24 (post 22-team era, consistent 38-game format). Architecture must be league-agnostic so La Liga, Serie A, etc. are config additions later.

### 1.2 Intervention types (v1, exactly three)

| Type | Player input | Engine effect |
|---|---|---|
| **Flip a result** | Pick any fixture, set a different result (W/D/L from either side) | That result is fixed to the chosen outcome; both teams' *subsequent* fixtures are re-simulated with momentum-adjusted Elo |
| **Cancel a transfer** | Pick from that season's incoming transfers (top ~15 by value per club) | Buying club loses the player's impact delta for the season (or from the transfer date for January moves); seller keeps it. Both clubs' affected fixtures re-simulated |
| **Injure a player** | Pick any player with ≥ 1,500 minutes that season, choose 3 or 6 months out, choose start month | Player's club loses his impact delta for the window; affected fixtures re-simulated |

### 1.3 The minimal-rewrite rule (key design decision)
Do **not** re-simulate the whole season. Only fixtures involving a **touched team** (a team whose strength or results the intervention directly affects) from the intervention point onward are re-simulated. All other fixtures keep their real results. Opponents in re-simulated fixtures gain/lose points accordingly and the table is recomputed.

Rationale: keeping 80%+ of real history intact is what makes the counterfactual credible and the diff legible. Full-chaos re-simulation is a parked v2 toggle ("Chaos Mode").

---

## 2. Simulation Engine

### 2.1 Team strength
Match-date Elo per team, downloaded from **clubelo.com** (free CSV API, historical daily ratings) during the data pipeline. Fall back to computing Elo from results if ClubElo coverage gaps appear (the pipeline must support both, with ClubElo preferred).

### 2.2 Match model
Bivariate Poisson (or independent Poisson with a draw inflation factor). Expected goals per side derived from Elo difference plus home advantage, calibrated per league (see Phase 1 gate). Seeded PRNG (mulberry32); the entire timeline is a pure function of `(season, intervention, seed)`.

### 2.3 Player impact model
A player's removal shifts his team's effective Elo by an **impact delta**:

```
impact = clamp(
  W_min * minutes_share + W_val * squad_value_share + W_ga * goal_involvement_share,
  0, MAX_DELTA
)
```

- Inputs from the Transfermarkt Kaggle dataset (`davidcariboo/player-scores`): `appearances.csv` (minutes, goals, assists), `player_valuations.csv`, `players.csv`.
- MAX_DELTA initial value: 90 Elo points (roughly a star player; tune in Phase 1). Goalkeepers get a 0.7 multiplier on the formula (value share overstates GK match impact).
- Print the computed impact for the top 5 players of every title-winning team in the calibration report as a sanity check (prime Henry, Ronaldo 07/08, etc. should land near MAX_DELTA).

### 2.4 Momentum (result-flip only)
A flipped result applies a temporary Elo adjustment (±25, decaying linearly over 6 fixtures) to both teams, so a stolen win has ripple effects rather than being a 3-point arithmetic edit.

### 2.5 Timeline generation
For each run: simulate the touched fixtures once with the run seed → that is the **canonical timeline** shown to the player. Additionally run 500 background sims with derived seeds to compute probability context displayed alongside ("In 62% of timelines, Arsenal still win the league").

---

## 3. Data Pipeline (Python, runs offline, outputs static JSON)

**Sources (all free, no scraping):**
1. **football-data.co.uk** — full PL results CSVs 1995→present (fixtures, dates, scores). Direct HTTP download.
2. **clubelo.com API** — historical Elo (`api.clubelo.com/{team}` CSV).
3. **Transfermarkt Kaggle dataset** `davidcariboo/player-scores` — appearances, valuations, transfers. NOTE: Kaggle needs an API key; pipeline must also work from CSVs manually placed in `/data/raw/`.

**Output:** one `seasons/{league}_{year}.json` per season, containing: fixture list with dates and real results, per-team Elo at each matchdate, per-club transfer-in list with impact deltas, per-player season records (minutes, G+A, value share, impact delta). Plus a `manifest.json` index.

**Budget:** each season file < 400KB; lazy-load per selected season. Name normalisation between the three sources (e.g. "Man United" vs "Manchester United" vs Transfermarkt club IDs) is a known pain point: build an explicit mapping table, fail loudly on unmapped names rather than fuzzy-matching silently.

---

## 4. Architecture

Static site, zero backend, same stack as The Flip for reuse:

```
butterfly/
├── pipeline/                  # Python + pandas, offline
├── public/data/seasons/*.json
├── src/
│   ├── engine/                # PURE TypeScript, no DOM imports
│   │   ├── rng.ts             # mulberry32 (reuse from The Flip)
│   │   ├── elo.ts  poisson.ts  impact.ts  rewrite.ts  headlines.ts
│   ├── components/
│   └── App.tsx                # Vite + React + Tailwind
└── tests/                     # vitest, engine only
```

- Engine purity is non-negotiable: `(seasonData, intervention, seed) → timeline` must be deterministic and unit-testable.
- Shareable URL: `?l=PL&y=1995&i=<encoded intervention>&s=<seed>` reproduces the exact timeline read-only.
- localStorage only (recent runs, favourite what-ifs). Mobile-first single-flow UI.
- Host: Cloudflare Pages.

---

## 5. Output & UI

**Timeline reveal screen (the product):**
1. Headline block: 2-3 templated headlines generated from the diff, in newspaper style. Templates only, no LLM. Examples: champion change, top-4 change, relegation change, points-record notes, head-to-head ironies ("Newcastle's 12-point lead holds").
2. Animated table diff: real final table morphing into the alternate one, movers highlighted with ▲▼ and points swing.
3. Key moments strip: the 3 re-simulated fixtures with the largest impact on the diff.
4. Probability footnote from the 500-sim background run.
5. Share card (rendered to canvas/PNG): intervention sentence, top headline, mini table diff, seed URL.

**Tone and safety guardrail for headlines:** outcomes only (positions, points, trophies, relegation). No generated claims about real individuals' conduct, sackings, or personal lives. Every share card carries a visible "SIMULATION" tag. Footer: independent fan project, no affiliation, stats from public sources.

---

## 6. Build Phases & Gates

**Phase 0 — Pipeline.** All three sources ingested, name-mapping table complete for all PL clubs 1995→2024, season JSONs emitted with a validation report (fixture counts, Elo coverage %, impact-delta sanity table). *Gate: every season validates; no silent name mismatches.*

**Phase 1 — Engine + calibration harness.** Pure engine with tests, plus a **backtest harness**: for every season, run 1,000 no-intervention simulations and report (a) real champion's simulated title probability, (b) Brier score of match outcome predictions vs reality, (c) mean absolute points error per team. *Gate: real champion ranks top-2 by simulated title probability in ≥ 80% of seasons; calibration report committed to repo. Do not start UI before this passes.* This gate is the project: if the no-intervention sim isn't credible, no counterfactual will be.

**Phase 2 — Rewrite logic.** Implement the three interventions, minimal-rewrite rule, momentum, headline generator. *Gate: golden-seed snapshot tests; flipping the famous Newcastle 95/96 collapse fixtures produces sane, explainable timelines.*

**Phase 3 — UI + share.** Selection flow, timeline reveal with animated diff, share card PNG export, seed URLs. *Gate: full flow on a phone viewport; shared URL reproduces identical timeline.*

---

## 7. Decisions Made (do not relitigate)

1. Minimal-rewrite rule: only touched teams re-simulated; full chaos is a parked v2 toggle.
2. Three intervention types only in v1. No manager interventions (no reliable free data, and it drags headlines into personal-conduct territory).
3. ClubElo for strength, Poisson for matches, templated headlines, no runtime LLM calls.
4. Premier League only in v1; league-agnostic data format from day one.
5. Phase 1 calibration gate blocks all UI work.

## 8. Risks / Open Items

1. **Calibration realism** is the main effort risk; football is high-variance and the sim must mirror that without feeling random. Budget iteration time on the Poisson parameters and momentum decay.
2. **Cross-source name/ID mapping** (football-data ↔ ClubElo ↔ Transfermarkt) is fiddly; the explicit mapping table and loud failures exist for this reason.
3. **Transfermarkt coverage pre-2004** is thin (valuations start ~2004): for 1995–2004 seasons, the transfer-cancel and injury interventions fall back to a minutes + G+A only impact formula, flagged in the validation report.
4. **Expectation management in UI:** make clear the canonical timeline is one draw from a distribution; "Run it again" plus the probability footnote handles this.
5. **v2 parked:** Chaos Mode, multi-season cascade, other leagues, cup competitions, "challenge mode" (find the single change that relegates the champions).
