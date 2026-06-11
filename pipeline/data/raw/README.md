# Put your CSV data here

This folder is the place to drop **real season data** so the pipeline builds the
game from it instead of the curated/embedded fallback dataset.

```
pipeline/data/raw/
├── seasons/                 ← your per-season data (tracked in git)
│   ├── _template/           ← copy this folder to start a new season
│   │   ├── meta.csv
│   │   ├── teams.csv
│   │   ├── fixtures.csv
│   │   ├── players.csv      (optional)
│   │   └── transfers.csv    (optional)
│   └── PL_1999/             ← e.g. one folder per season you add
└── transfermarkt/           ← optional bulk Kaggle dumps (git-ignored, large)
```

## How to add a season (3 steps)

1. Copy `seasons/_template` to `seasons/<LEAGUE>_<YEAR>` — e.g. `seasons/PL_1999`
   (the folder name is just a label; the real key comes from `meta.csv`).
2. Fill in the CSVs (see the schema below). At minimum you need `meta.csv`,
   `teams.csv`, and `fixtures.csv`.
3. Run the pipeline:

   ```bash
   cd pipeline && python3 build.py
   ```

   It writes `public/data/seasons/<LEAGUE>_<YEAR>.json`, updates
   `manifest.json`, and prints a validation report. Commit the generated JSON —
   that's what the site serves. The new season shows up in the picker
   automatically.

Any season folder you add **overrides** the curated one with the same key, and
is tagged `dataSource: "csv"` in the UI footer. Seasons you don't supply keep
using the embedded curated data.

> Tip: to see a fully-populated, real example to copy, export a curated season:
> ```bash
> cd pipeline && python3 build.py --export-csv PL_1995
> ```
> This writes `seasons/PL_1995/*.csv` with the real 380-fixture season you can
> edit.

## CSV schema

### `meta.csv` (one row)
| column | required | notes |
|---|---|---|
| `league` | ✅ | short code, e.g. `PL` |
| `year` | ✅ | season start year, e.g. `1999` for 1999/00 |
| `name` | ✅ | display name, e.g. `Premier League 1999/00` |
| `impact_fallback` | – | `true` if you have no player valuations (pre-2004); uses a minutes + goals/assists impact formula instead of value share |

### `teams.csv` (one row per team)
| column | required | notes |
|---|---|---|
| `id` | ✅ | short team id used everywhere else (e.g. `MUN`) |
| `name` | ✅ | full club name |
| `short` | – | 3–4 char label (defaults to `id`) |
| `elo` | – | starting strength; if blank it's derived from the team's real points |

### `fixtures.csv` (one row per match — the **real results**)
| column | required | notes |
|---|---|---|
| `matchday` | ✅ | round number |
| `date` | ✅ | `YYYY-MM-DD` (drives the order interventions take effect) |
| `home` / `away` | ✅ | team `id`s from `teams.csv` |
| `fhg` / `fag` | ✅ | final home/away goals (the real scoreline) |
| `id` | – | fixture id; auto-assigned by row order if omitted |
| `homeElo` / `awayElo` | – | match-date Elo snapshots (e.g. from ClubElo) |

The real final table is computed directly from these fixtures — no
reconciliation, so the baseline you see is exactly what happened.

### `players.csv` (optional — needed for injury & richer transfer interventions)
| column | required | notes |
|---|---|---|
| `id`, `name` | ✅ | unique player id + display name |
| `club` | ✅ | team `id` |
| `position` | ✅ | `GK` / `DF` / `MF` / `FW` (GK impact is scaled ×0.7) |
| `minutes`, `goals`, `assists` | ✅ | season totals (≥1500 mins to be injurable) |
| `value_share` | – | share of squad market value `0..1`; ignored when `impact_fallback=true` |

### `transfers.csv` (optional — needed for the cancel-transfer intervention)
| column | required | notes |
|---|---|---|
| `id` | ✅ | unique transfer id |
| `player_id` | ✅ | matches a `players.csv` id when possible (reuses that player's impact); otherwise the fee is used to estimate impact |
| `player_name` | ✅ | display name |
| `from_club` | – | selling club `id`; blank = from outside the league |
| `to_club` | ✅ | buying club `id` |
| `fee` | – | £m (0 = free/loan/unknown) |
| `date` | ✅ | `YYYY-MM-DD` the move takes effect (January moves only affect later fixtures) |

## Where to get the data (all free)

- **Results / fixtures:** [football-data.co.uk](https://www.football-data.co.uk/englandm.php)
  — download the Premier League CSV (`E0.csv`) per season. Columns
  `Date, HomeTeam, AwayTeam, FTHG, FTAG` map to `fixtures.csv`. You'll map club
  names to your `id`s (see `pipeline/fetch.py` `NAME_MAP`).
- **Player minutes / goals / valuations / transfers:** the Transfermarkt Kaggle
  dataset [`davidcariboo/player-scores`](https://www.kaggle.com/datasets/davidcariboo/player-scores)
  (`appearances.csv`, `players.csv`, `player_valuations.csv`, `transfers.csv`).
  Drop the raw dumps in `transfermarkt/` if you want to script the conversion.

> Cross-source club-name mapping is the known pain point. Keep it **explicit**
> (extend `NAME_MAP` in `pipeline/fetch.py`) and fail loudly on an unmapped name
> — never fuzzy-match silently.
