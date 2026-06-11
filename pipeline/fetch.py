"""Live data fetchers (football-data.co.uk + clubelo.com).

These are used when ``build.py`` is run with ``--live`` *and* the host has
network access to the sources. In the offline/CI environment the curated
builder is used instead. The functions here also accept CSVs manually placed in
``pipeline/data/raw/`` (Kaggle export / football-data download), per the brief.

football-data.co.uk URL pattern (Premier League = E0):
    https://www.football-data.co.uk/mmz4281/{YY}{YY}/E0.csv
e.g. 1995/96 -> mmz4281/9596/E0.csv

clubelo.com API:
    http://api.clubelo.com/{TeamName}   (daily historical Elo, CSV)

Name normalisation between the three sources is intentionally explicit (see
NAME_MAP): we fail loudly on an unmapped name rather than fuzzy-matching.
"""
from __future__ import annotations

import csv
import io
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

RAW = Path(__file__).resolve().parent / "data" / "raw"

# football-data short name -> our team id. Extend per league/era. Failing to
# map a name here is an error, by design.
NAME_MAP: Dict[str, str] = {
    "Man United": "MUN",
    "Manchester United": "MUN",
    "Man City": "MCI",
    "Manchester City": "MCI",
    "Liverpool": "LIV",
    "Arsenal": "ARS",
    "Chelsea": "CHE",
    "Tottenham": "TOT",
    "Newcastle": "NEW",
    "Aston Villa": "AVL",
    "Everton": "EVE",
    "Blackburn": "BLB",
    "Nott'm Forest": "NFO",
    "West Ham": "WHU",
    "Middlesbrough": "MID",
    "Leeds": "LEE",
    "Wimbledon": "WIM",
    "Sheffield Weds": "SHW",
    "Coventry": "COV",
    "Southampton": "SOU",
    "QPR": "QPR",
    "Bolton": "BOL",
    # 2003/04 + 2011/12 extras
    "Fulham": "FUL",
    "Charlton": "CHA",
    "Birmingham": "BIR",
    "Portsmouth": "POR",
    "Leicester": "LEI",
    "Wolves": "WOL",
    "Norwich": "NOR",
    "Swansea": "SWA",
    "Stoke": "STK",
    "Sunderland": "SUN",
    "Wigan": "WIG",
    "West Brom": "WBA",
}


def _http_get(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "butterfly/0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def map_name(name: str) -> str:
    if name not in NAME_MAP:
        raise KeyError(
            f"Unmapped club name from source: {name!r}. Add it to NAME_MAP."
        )
    return NAME_MAP[name]


def fetch_football_data(year: int) -> Optional[List[dict]]:
    """Return real fixtures for the PL season starting in `year`, or None."""
    yy = f"{year % 100:02d}{(year + 1) % 100:02d}"
    local = RAW / f"E0_{year}.csv"
    text: Optional[str] = None
    if local.exists():
        text = local.read_text()
    else:
        url = f"https://www.football-data.co.uk/mmz4281/{yy}/E0.csv"
        try:
            text = _http_get(url)
        except Exception as exc:  # noqa: BLE001
            print(f"  football-data fetch failed for {year}: {exc}")
            return None

    rows = list(csv.DictReader(io.StringIO(text)))
    fixtures = []
    for i, r in enumerate(rows):
        if not r.get("HomeTeam"):
            continue
        fixtures.append(
            {
                "id": i,
                "date": r.get("Date", ""),
                "home": map_name(r["HomeTeam"]),
                "away": map_name(r["AwayTeam"]),
                "fhg": int(r["FTHG"]),
                "fag": int(r["FTAG"]),
            }
        )
    return fixtures


def fetch_clubelo(team_name: str) -> Optional[str]:
    """Fetch raw ClubElo CSV for a club (caller parses by date)."""
    try:
        return _http_get(f"http://api.clubelo.com/{team_name}")
    except Exception as exc:  # noqa: BLE001
        print(f"  clubelo fetch failed for {team_name}: {exc}")
        return None
