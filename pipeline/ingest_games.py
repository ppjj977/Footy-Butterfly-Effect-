#!/usr/bin/env python3
"""Build Premier League seasons directly from the Transfermarkt games.csv.

games.csv contains real match results, so for every PL season (competition
``GB1``) we can write a season folder with real fixtures (exact real table) plus
incoming transfers from transfers.csv. Player minutes live only in
appearances.csv (not required here), so these seasons ship with flip +
cancel-transfer; injuries need appearances.csv.
"""
from __future__ import annotations

import csv
import datetime
import re
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Set

import clubs

EUR_TO_GBP = 0.86
MAX_TRANSFERS = 25


def _date(s: str) -> Optional[datetime.date]:
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def season_of(d: datetime.date) -> int:
    return d.year if d.month >= 7 else d.year - 1


def _matchday(round_str: str, fallback: int) -> int:
    m = re.search(r"\d+", round_str or "")
    return int(m.group()) if m else fallback


def parse_games(games_path: Path, years: Optional[Set[int]]):
    """Return (fixtures_by_year, teams_by_year) for PL (GB1) games."""
    fixtures_by_year: Dict[int, List[dict]] = defaultdict(list)
    teams_by_year: Dict[int, Set[str]] = defaultdict(set)
    with games_path.open(newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r.get("competition_id") != "GB1":
                continue
            try:
                y = int(r["season"])
            except (ValueError, KeyError):
                continue
            if years is not None and y not in years:
                continue
            d = _date(r.get("date", ""))
            if d is None:
                continue
            try:
                home = clubs.resolve(r["home_club_name"])
                away = clubs.resolve(r["away_club_name"])
                hg = int(r["home_club_goals"])
                ag = int(r["away_club_goals"])
            except (KeyError, ValueError):
                continue
            fixtures_by_year[y].append(
                {
                    "date": d,
                    "round": r.get("round", ""),
                    "home": home,
                    "away": away,
                    "fhg": hg,
                    "fag": ag,
                }
            )
            teams_by_year[y].add(home)
            teams_by_year[y].add(away)
    return fixtures_by_year, teams_by_year


def parse_transfers(
    transfers_path: Path, teams_by_year: Dict[int, Set[str]]
) -> Dict[int, List[dict]]:
    out: Dict[int, List[dict]] = defaultdict(list)
    if not transfers_path.exists():
        return out
    years = set(teams_by_year)
    with transfers_path.open(newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            d = _date(r.get("transfer_date", ""))
            if d is None:
                continue
            y = season_of(d)
            if y not in years:
                continue
            try:
                to_club = clubs.resolve(r.get("to_club_name", ""))
            except KeyError:
                continue
            if to_club not in teams_by_year[y]:
                continue  # club not in the PL that season
            try:
                from_club = clubs.resolve(r.get("from_club_name", ""))
            except KeyError:
                from_club = ""
            try:
                fee = float(r.get("transfer_fee") or 0)
            except ValueError:
                fee = 0.0
            pid = r.get("player_id", "")
            out[y].append(
                {
                    "id": f"trf_{pid}_{y}",
                    "player_id": "",  # no per-season player records without appearances
                    "player_name": r.get("player_name", "") or pid,
                    "from_club": from_club or "",
                    "to_club": to_club,
                    "fee": round(fee * EUR_TO_GBP / 1_000_000, 1),
                    "date": d.isoformat(),
                }
            )
    for y in out:
        out[y].sort(key=lambda t: -t["fee"])
        del out[y][MAX_TRANSFERS:]
    return out


def _write(folder: Path, name: str, header: List[str], rows: List[list]) -> None:
    with (folder / name).open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def build(tm_dir: Path, seasons_dir: Path, years: Optional[Set[int]] = None) -> List[int]:
    games = tm_dir / "games.csv"
    if not games.exists():
        return []
    fixtures_by_year, teams_by_year = parse_games(games, years)
    transfers_by_year = parse_transfers(tm_dir / "transfers.csv", teams_by_year)

    done = []
    for y in sorted(fixtures_by_year):
        fixtures = fixtures_by_year[y]
        if len(fixtures) < 100:  # guard against a half-scraped season
            continue
        fixtures.sort(key=lambda fx: fx["date"])
        team_ids = sorted(teams_by_year[y])
        per_round = max(1, len(team_ids) // 2)

        folder = seasons_dir / f"PL_{y}"
        folder.mkdir(parents=True, exist_ok=True)
        yy = f"{(y + 1) % 100:02d}"
        _write(folder, "meta.csv", ["league", "year", "name", "impact_fallback"],
               [["PL", y, f"Premier League {y}/{yy}", "false"]])
        _write(folder, "teams.csv", ["id", "name", "short", "elo"],
               [[t, clubs.BY_ID[t].name, clubs.BY_ID[t].short, ""] for t in team_ids])
        frows = []
        for i, fx in enumerate(fixtures):
            frows.append([i, _matchday(fx["round"], i // per_round + 1),
                          fx["date"].isoformat(), fx["home"], fx["away"], fx["fhg"], fx["fag"]])
        _write(folder, "fixtures.csv",
               ["id", "matchday", "date", "home", "away", "fhg", "fag"], frows)
        trows = [[t["id"], t["player_id"], t["player_name"], t["from_club"],
                  t["to_club"], t["fee"], t["date"]] for t in transfers_by_year.get(y, [])]
        _write(folder, "transfers.csv",
               ["id", "player_id", "player_name", "from_club", "to_club", "fee", "date"], trows)
        # players.csv left as header-only (no appearances data) -> no injuries.
        _write(folder, "players.csv",
               ["id", "name", "club", "position", "minutes", "goals", "assists", "value_share"], [])
        done.append(y)
    return done


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    ys = build(here / "data" / "raw" / "transfermarkt", here / "data" / "raw" / "seasons")
    print(f"Built PL seasons from games.csv: {ys}")
