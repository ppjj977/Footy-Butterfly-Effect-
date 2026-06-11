# 📥 Drop your CSV files here

This is the **upload inbox**. Put raw CSV files in this folder, commit/push them
(or just tell me in a session), and I'll transform them into playable seasons —
no Python on your side.

## What to upload

**Premier League results from [football-data.co.uk](https://www.football-data.co.uk/englandm.php)**
— the easiest source. On that page, right-click the **"Premier League"** CSV for
a season and Save As. The file (usually `E0.csv`) has columns like
`Date, HomeTeam, AwayTeam, FTHG, FTAG, …`. Drop one file per season here. Name
them anything (e.g. `2021-22.csv`); the season year is read from the dates.

That's enough for a fully playable season (real fixtures, exact real table, the
"flip a result" intervention).

## Optional: players & transfers (unlocks injure / cancel-transfer)

Two ways:

1. **Transfermarkt Kaggle dump (automatic).** Put the raw
   [`davidcariboo/player-scores`](https://www.kaggle.com/datasets/davidcariboo/player-scores)
   files — `appearances.csv`, `players.csv`, `clubs.csv`, and optionally
   `player_valuations.csv` + `transfers.csv` — into **`../transfermarkt/`**
   (not here). The converter streams them row-by-row, keeps only the Premier
   League slice for the seasons you've added, and writes a small
   `players.csv` / `transfers.csv` into each season folder. **Only that small
   output is committed — the giant raw files never enter git.**

   ⚠️ These files are huge (`appearances.csv` is 300 MB+), so they can't go
   through GitHub's web upload (25 MB) or even a normal git push (100 MB/file).
   Get them into `../transfermarkt/` via **Git LFS**, a direct file upload into
   the workspace, or by filtering them down first — then ping me and I'll run
   the extraction.

2. **Hand-written CSVs.** Add a `players.csv` / `transfers.csv` per season
   yourself (schema in `../README.md`).

Without either, injure/cancel just show no options for that season; flips still
work.

## What happens next

I run the converter, which:
1. reads each file, maps club names to ids (via `pipeline/clubs.py`),
2. writes a season folder under `../seasons/PL_<year>/`,
3. builds `public/data/seasons/PL_<year>.json` + updates the manifest,
4. commits — and the live site auto-deploys with your new season in the picker.

If a club name isn't recognised, the run stops and names the exact spelling to
add, so nothing is ever silently mismatched.

> Files you add here **are tracked in git** — commit and push them and I'll pick
> them up in the next session (or just attach them in chat). The football-data
> CSVs are small. Only the bulk Transfermarkt/Kaggle dumps (in `../transfermarkt/`)
> are git-ignored to keep the repo lean.
