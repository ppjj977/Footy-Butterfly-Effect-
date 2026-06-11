#!/usr/bin/env python3
"""Turn raw uploaded CSVs into playable seasons, then build.

Drop CSV files into ``pipeline/data/raw/inbox/`` and run::

    python3 pipeline/convert.py

It currently understands the **football-data.co.uk** results format (the free
PL CSVs: columns ``Date, HomeTeam, AwayTeam, FTHG, FTAG``). Each file becomes a
season folder under ``seasons/<LEAGUE>_<YEAR>`` (real fixtures → exact real
table) and then the normal build runs, emitting the season JSON + manifest.

Club names are mapped explicitly via ``clubs.py``; an unrecognised name stops
the run with the exact spelling to add (no silent fuzzy-matching).

If a file isn't recognised, it's reported and skipped — paste a couple of its
header rows and we'll teach the converter that format too.
"""
from __future__ import annotations

import csv
from datetime import date, datetime
from pathlib import Path
from typing import List, Optional

import clubs
import transfermarkt
from ingest_csv import _rows, season_folders  # reuse the tolerant reader

PIPELINE = Path(__file__).resolve().parent
INBOX = PIPELINE / "data" / "raw" / "inbox"
SEASONS_DIR = PIPELINE / "data" / "raw" / "seasons"
TM_DIR = PIPELINE / "data" / "raw" / "transfermarkt"

FD_REQUIRED = {"HomeTeam", "AwayTeam", "FTHG", "FTAG"}


def parse_date(s: str) -> Optional[date]:
    s = (s or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def season_start_year(dates: List[date]) -> int:
    """PL seasons start in August; group by the Aug–May window."""
    earliest = min(dates)
    return earliest.year if earliest.month >= 7 else earliest.year - 1


def is_football_data(headers: set) -> bool:
    return FD_REQUIRED.issubset(headers)


def convert_football_data(path: Path) -> Optional[str]:
    """Write a season folder from a football-data.co.uk CSV. Returns its key."""
    rows = _rows(path)
    if not rows:
        print(f"  · {path.name}: empty, skipped")
        return None

    parsed = []
    unmapped: set = set()
    for r in rows:
        if not (r.get("HomeTeam") or "").strip():
            continue
        d = parse_date(r.get("Date", ""))
        if d is None:
            continue
        try:
            home = clubs.resolve(r["HomeTeam"])
            away = clubs.resolve(r["AwayTeam"])
        except KeyError as e:
            unmapped.add(str(e.args[0]))
            continue
        try:
            fhg, fag = int(r["FTHG"]), int(r["FTAG"])
        except (ValueError, KeyError):
            continue
        parsed.append((d, home, away, fhg, fag))

    if unmapped:
        raise SystemExit(
            f"\n✋ {path.name}: unrecognised club name(s): "
            + ", ".join(sorted(repr(u) for u in unmapped))
            + "\n   Add them to CLUBS aliases in pipeline/clubs.py and re-run."
        )
    if not parsed:
        print(f"  · {path.name}: no usable rows, skipped")
        return None

    parsed.sort(key=lambda x: x[0])
    year = season_start_year([p[0] for p in parsed])
    team_ids = sorted({p[1] for p in parsed} | {p[2] for p in parsed})
    n = len(team_ids)
    per_round = max(1, n // 2)

    key = f"PL_{year}"
    folder = SEASONS_DIR / key
    folder.mkdir(parents=True, exist_ok=True)

    def write(name, header, data):
        with (folder / name).open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(data)

    yy = f"{(year + 1) % 100:02d}"
    impact_fallback = year < 2004  # no valuations pre-2004
    write(
        "meta.csv",
        ["league", "year", "name", "impact_fallback"],
        [["PL", year, f"Premier League {year}/{yy}", str(impact_fallback).lower()]],
    )
    write(
        "teams.csv",
        ["id", "name", "short", "elo"],
        [[tid, clubs.BY_ID[tid].name, clubs.BY_ID[tid].short, ""] for tid in team_ids],
    )
    fixtures = []
    for i, (d, home, away, fhg, fag) in enumerate(parsed):
        fixtures.append([i, i // per_round + 1, d.isoformat(), home, away, fhg, fag])
    write(
        "fixtures.csv",
        ["id", "matchday", "date", "home", "away", "fhg", "fag"],
        fixtures,
    )
    # Empty (but headed) optional files so the folder is complete; players /
    # transfers can be added later to unlock injure / cancel-transfer.
    if not (folder / "players.csv").exists():
        write("players.csv", ["id", "name", "club", "position", "minutes", "goals", "assists", "value_share"], [])
    if not (folder / "transfers.csv").exists():
        write("transfers.csv", ["id", "player_id", "player_name", "from_club", "to_club", "fee", "date"], [])

    print(f"  ✓ {path.name}: {n} teams, {len(parsed)} fixtures → seasons/{key}/")
    return key


def main() -> None:
    INBOX.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in INBOX.rglob("*.csv"))
    converted: List[str] = []
    unknown: List[Path] = []
    if files:
        print(f"Scanning {len(files)} file(s) in inbox…")
    for path in files:
        with path.open(newline="", encoding="utf-8-sig") as f:
            headers = set(next(csv.reader(f), []))
        if is_football_data(headers):
            key = convert_football_data(path)
            if key:
                converted.append(key)
        else:
            unknown.append(path)

    if unknown:
        print("\nUnrecognised format (skipped):")
        for p in unknown:
            print(f"  · {p.relative_to(INBOX)}")
        print("  → share a couple of header rows and I'll add a parser.")

    # Build PL seasons straight from Transfermarkt games.csv (real results) +
    # transfers.csv. Gives flip + cancel-transfer for every PL season present.
    games_done: List[int] = []
    if (TM_DIR / "games.csv").exists():
        import ingest_games

        print("\nTransfermarkt games.csv found — building PL seasons (results + transfers)…")
        games_done = ingest_games.build(TM_DIR, SEASONS_DIR)
        print(f"  ✓ seasons built: {games_done}")

    # If the (huge) appearances.csv is present, enrich with player minutes so the
    # injure intervention works too. Optional — skipped when absent.
    tm_done: List[int] = []
    if (TM_DIR / "appearances.csv").exists():
        years = {
            int(f.name[3:])
            for f in season_folders(SEASONS_DIR)
            if f.name.startswith("PL_") and f.name[3:].isdigit()
        }
        print(f"\nappearances.csv found — extracting player minutes for {sorted(years)}…")
        tm_done = transfermarkt.enrich(TM_DIR, SEASONS_DIR, years)
        print(f"  ✓ player data written for: {sorted(tm_done)}")
    elif (TM_DIR / "games.csv").exists():
        print(
            "\n(No appearances.csv — seasons get flip + cancel-transfer. "
            "Add the filtered appearances.csv to also enable injuries.)"
        )

    if converted or games_done or tm_done:
        if converted:
            print(f"\nConverted (football-data): {', '.join(sorted(set(converted)))}")
        print("\nRunning build…\n")
        import build

        build.main()
    else:
        print("\nNothing converted.")


if __name__ == "__main__":
    main()
