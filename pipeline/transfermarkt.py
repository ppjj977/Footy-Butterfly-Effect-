"""Stream-filter the Transfermarkt 'player-scores' Kaggle dataset to the PL slice.

The raw dump is huge (appearances.csv alone is 300 MB+), so we read it row by
row and keep only Premier League rows (domestic competition id ``GB1``) for the
target seasons. Output is a small ``players.csv`` / ``transfers.csv`` written
into each ``seasons/PL_<year>/`` folder — that's what gets committed; the raw
dump stays out of git (see .gitignore).

Expected files in ``pipeline/data/raw/transfermarkt/`` (standard Kaggle schema,
``davidcariboo/player-scores``):
  appearances.csv         (required) minutes/goals/assists per game
  players.csv             (required) names + positions
  clubs.csv               (required) club_id -> name (for PL club mapping)
  player_valuations.csv   (optional) market values -> value_share
  transfers.csv           (optional) incoming transfers
"""
from __future__ import annotations

import csv
import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import clubs

PL_COMP = "GB1"  # Transfermarkt domestic competition id for the Premier League
POS_MAP = {"Goalkeeper": "GK", "Defender": "DF", "Midfield": "MF", "Attack": "FW"}
MIN_MINUTES = 270  # ignore cameo-only players to keep files lean
MAX_TRANSFERS = 25  # cap incoming transfers per season (top by fee)
EUR_TO_GBP = 0.86  # rough, for display fees only


def _reader(path: Path):
    return csv.reader(path.open(newline="", encoding="utf-8-sig"))


def parse_date(s: str) -> Optional[datetime.date]:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def season_of(d: datetime.date) -> int:
    """PL season start year (Aug–May window)."""
    return d.year if d.month >= 7 else d.year - 1


def _int(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _header_index(path: Path) -> Tuple[List[str], Dict[str, int]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        header = next(csv.reader(f), [])
    return header, {name: i for i, name in enumerate(header)}


def load_club_map(tm_dir: Path) -> Dict[str, Optional[str]]:
    """Transfermarkt club_id -> our team id (None if not a club we know)."""
    f = tm_dir / "clubs.csv"
    if not f.exists():
        raise SystemExit("transfermarkt/clubs.csv is required (club id -> name).")
    _, idx = _header_index(f)
    cid_i, name_i = idx.get("club_id"), idx.get("name")
    out: Dict[str, Optional[str]] = {}
    rows = _reader(f)
    next(rows, None)
    for r in rows:
        if not r:
            continue
        cid = r[cid_i]
        try:
            out[cid] = clubs.resolve(r[name_i])
        except KeyError:
            out[cid] = None  # not a PL club we track (fine for foreign sellers)
    return out


def aggregate_appearances(
    tm_dir: Path, target_years: Set[int]
) -> Dict[Tuple[int, str], dict]:
    """(year, player_id) -> {min, g, a, club:{club_id:minutes}} for PL games."""
    f = tm_dir / "appearances.csv"
    if not f.exists():
        raise SystemExit("transfermarkt/appearances.csv is required.")
    _, idx = _header_index(f)
    ci = idx.get("competition_id")
    di = idx.get("date")
    pi = idx["player_id"]
    cl = idx.get("player_club_id")
    mi = idx.get("minutes_played")
    gi = idx.get("goals")
    ai = idx.get("assists")

    agg: Dict[Tuple[int, str], dict] = {}
    rows = _reader(f)
    next(rows, None)
    for r in rows:
        if ci is not None and r[ci] != PL_COMP:
            continue
        d = parse_date(r[di]) if di is not None else None
        if d is None:
            continue
        y = season_of(d)
        if y not in target_years:
            continue
        key = (y, r[pi])
        a = agg.get(key)
        if a is None:
            a = {"min": 0, "g": 0, "a": 0, "club": {}}
            agg[key] = a
        mp = _int(r[mi]) if mi is not None else 0
        a["min"] += mp
        a["g"] += _int(r[gi]) if gi is not None else 0
        a["a"] += _int(r[ai]) if ai is not None else 0
        if cl is not None:
            club = r[cl]
            a["club"][club] = a["club"].get(club, 0) + mp
    return agg


def load_player_meta(tm_dir: Path) -> Dict[str, Tuple[str, str]]:
    """player_id -> (name, position)."""
    f = tm_dir / "players.csv"
    if not f.exists():
        raise SystemExit("transfermarkt/players.csv is required.")
    _, idx = _header_index(f)
    pi = idx["player_id"]
    ni = idx.get("name")
    fi = idx.get("first_name")
    li = idx.get("last_name")
    posi = idx.get("position")
    out: Dict[str, Tuple[str, str]] = {}
    rows = _reader(f)
    next(rows, None)
    for r in rows:
        if not r:
            continue
        name = (r[ni] if ni is not None and r[ni] else "").strip()
        if not name and fi is not None and li is not None:
            name = f"{r[fi]} {r[li]}".strip()
        pos = POS_MAP.get(r[posi] if posi is not None else "", "MF")
        out[r[pi]] = (name or r[pi], pos)
    return out


def load_valuations(
    tm_dir: Path, target_years: Set[int]
) -> Dict[Tuple[int, str], float]:
    """(year, player_id) -> market value (EUR) as of that season's end."""
    f = tm_dir / "player_valuations.csv"
    if not f.exists():
        return {}
    _, idx = _header_index(f)
    pi = idx["player_id"]
    di = idx.get("date") if "date" in idx else idx.get("datetime")
    vi = idx.get("market_value_in_eur")
    if di is None or vi is None:
        return {}
    ends = {y: datetime.date(y + 1, 6, 30) for y in target_years}
    best: Dict[Tuple[int, str], Tuple[datetime.date, float]] = {}
    rows = _reader(f)
    next(rows, None)
    for r in rows:
        d = parse_date(r[di])
        if d is None or not r[vi]:
            continue
        mv = float(r[vi])
        pid = r[pi]
        for y, end in ends.items():
            if d <= end:
                key = (y, pid)
                cur = best.get(key)
                if cur is None or d > cur[0]:
                    best[key] = (d, mv)
    return {k: v[1] for k, v in best.items()}


def build_players(
    target_years: Set[int],
    agg: Dict[Tuple[int, str], dict],
    meta: Dict[str, Tuple[str, str]],
    vals: Dict[Tuple[int, str], float],
    club_map: Dict[str, Optional[str]],
) -> Dict[int, List[dict]]:
    """year -> list of player dict rows (our schema)."""
    by_year: Dict[int, List[dict]] = {y: [] for y in target_years}
    # First pass: assemble players + EUR value; second pass: value_share.
    squad_value: Dict[Tuple[int, str], float] = {}
    staged: Dict[int, List[dict]] = {y: [] for y in target_years}

    for (y, pid), a in agg.items():
        if a["min"] < MIN_MINUTES:
            continue
        our_club = None
        if a["club"]:
            top = max(a["club"].items(), key=lambda kv: kv[1])[0]
            our_club = club_map.get(top)
        if our_club is None:
            continue
        name, pos = meta.get(pid, (pid, "MF"))
        value = vals.get((y, pid), 0.0)
        staged[y].append(
            {
                "id": f"tm_{pid}",
                "name": name,
                "club": our_club,
                "position": pos,
                "minutes": a["min"],
                "goals": a["g"],
                "assists": a["a"],
                "_value": value,
            }
        )
        squad_value[(y, our_club)] = squad_value.get((y, our_club), 0.0) + value

    for y in target_years:
        for p in staged[y]:
            total = squad_value.get((y, p["club"]), 0.0)
            share = round(p.pop("_value") / total, 4) if total > 0 else 0.0
            p["value_share"] = share
            by_year[y].append(p)
        by_year[y].sort(key=lambda p: -p["minutes"])
    return by_year


def build_transfers(
    tm_dir: Path,
    target_years: Set[int],
    club_map: Dict[str, Optional[str]],
    players_by_year: Dict[int, List[dict]],
) -> Dict[int, List[dict]]:
    out: Dict[int, List[dict]] = {y: [] for y in target_years}
    f = tm_dir / "transfers.csv"
    if not f.exists():
        return out
    _, idx = _header_index(f)
    pi = idx.get("player_id")
    di = idx.get("transfer_date")
    fri = idx.get("from_club_id")
    toi = idx.get("to_club_id")
    fee_i = idx.get("transfer_fee")
    ni = idx.get("player_name")
    if pi is None or di is None or toi is None:
        return out

    known_ids = {
        y: {p["id"] for p in players_by_year.get(y, [])} for y in target_years
    }
    rows = _reader(f)
    next(rows, None)
    for r in rows:
        d = parse_date(r[di])
        if d is None:
            continue
        y = season_of(d)
        if y not in target_years:
            continue
        to_club = club_map.get(r[toi])
        if to_club is None:
            continue  # incoming to a non-PL/unknown club
        fee_eur = 0.0
        if fee_i is not None and r[fee_i]:
            try:
                fee_eur = float(r[fee_i])
            except ValueError:
                fee_eur = 0.0
        from_club = club_map.get(r[fri]) if fri is not None else None
        pid = r[pi]
        out[y].append(
            {
                "id": f"trf_{pid}_{y}",
                "player_id": f"tm_{pid}" if f"tm_{pid}" in known_ids[y] else "",
                "player_name": (r[ni] if ni is not None else "") or pid,
                "from_club": from_club or "",
                "to_club": to_club,
                "fee": round(fee_eur * EUR_TO_GBP / 1_000_000, 1),
                "date": d.isoformat(),
            }
        )
    for y in target_years:
        out[y].sort(key=lambda t: -t["fee"])
        del out[y][MAX_TRANSFERS:]
    return out


def write_season_files(folder: Path, players: List[dict], transfers: List[dict]) -> None:
    with (folder / "players.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "name", "club", "position", "minutes", "goals", "assists", "value_share"])
        for p in players:
            w.writerow([p["id"], p["name"], p["club"], p["position"], p["minutes"], p["goals"], p["assists"], p["value_share"]])
    with (folder / "transfers.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "player_id", "player_name", "from_club", "to_club", "fee", "date"])
        for t in transfers:
            w.writerow([t["id"], t["player_id"], t["player_name"], t["from_club"], t["to_club"], t["fee"], t["date"]])


def enrich(tm_dir: Path, seasons_dir: Path, target_years: Set[int]) -> List[int]:
    """Fill players.csv/transfers.csv for the given seasons. Returns years done."""
    if not target_years:
        return []
    club_map = load_club_map(tm_dir)
    agg = aggregate_appearances(tm_dir, target_years)
    meta = load_player_meta(tm_dir)
    vals = load_valuations(tm_dir, target_years)
    players_by_year = build_players(target_years, agg, meta, vals, club_map)
    transfers_by_year = build_transfers(tm_dir, target_years, club_map, players_by_year)

    done = []
    for y in sorted(target_years):
        folder = seasons_dir / f"PL_{y}"
        if not (folder / "meta.csv").exists():
            continue
        players = players_by_year.get(y, [])
        if not players:
            continue
        write_season_files(folder, players, transfers_by_year.get(y, []))
        # We have real valuations -> turn off the impact fallback for 2004+.
        if vals and y >= 2004:
            _set_impact_fallback(folder / "meta.csv", False)
        done.append(y)
    return done


def _set_impact_fallback(meta_path: Path, value: bool) -> None:
    rows = list(_reader(meta_path))
    if len(rows) < 2:
        return
    header, data = rows[0], rows[1]
    if "impact_fallback" not in header:
        return
    data[header.index("impact_fallback")] = str(value).lower()
    with meta_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerow(data)
