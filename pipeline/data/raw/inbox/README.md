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

## Optional: players & transfers

To also unlock **injure a player** and **cancel a transfer** for a season, add a
`players.csv` and/or `transfers.csv` (schema in `../README.md`). Without them,
those two intervention types simply show no options for that season; flips still
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
