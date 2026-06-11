"""Load a season from a folder of user-supplied CSVs.

See pipeline/data/raw/README.md for the schema. Real fixtures (with results)
are used directly, so the baseline table is exactly the real final standings —
no reconciliation needed.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import List, Optional, Tuple

from seasons_data import PlayerSeed, Season, TeamSeed, TransferSeed


def _rows(path: Path) -> List[dict]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]


def _opt_int(v) -> Optional[int]:
    v = (v or "").strip()
    return int(float(v)) if v else None


def _truthy(v) -> bool:
    return str(v or "").strip().lower() in ("1", "true", "yes", "y")


def season_folders(seasons_dir: Path) -> List[Path]:
    """Folders under seasons/ that contain a meta.csv (skip _template etc.)."""
    if not seasons_dir.exists():
        return []
    out = []
    for folder in sorted(seasons_dir.iterdir()):
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        if (folder / "meta.csv").exists():
            out.append(folder)
    return out


def load_season_folder(folder: Path) -> Tuple[Season, List[dict]]:
    """Return (Season, real_fixtures) parsed from a season CSV folder."""
    meta = _rows(folder / "meta.csv")[0]

    teams = [
        TeamSeed(
            id=r["id"].strip(),
            name=r["name"].strip(),
            short=(r.get("short") or r["id"]).strip(),
            pts=0,
            gf=0,
            ga=0,
            elo=(float(r["elo"]) if (r.get("elo") or "").strip() else None),
        )
        for r in _rows(folder / "teams.csv")
    ]

    players: List[PlayerSeed] = []
    pf = folder / "players.csv"
    if pf.exists():
        for r in _rows(pf):
            players.append(
                PlayerSeed(
                    id=r["id"].strip(),
                    name=r["name"].strip(),
                    club=r["club"].strip(),
                    position=r["position"].strip().upper(),
                    minutes=int(float(r["minutes"])),
                    goals=int(float(r["goals"])),
                    assists=int(float(r["assists"])),
                    value_share=float(r.get("value_share") or 0) or 0.0,
                )
            )

    transfers: List[TransferSeed] = []
    tf = folder / "transfers.csv"
    if tf.exists():
        for r in _rows(tf):
            transfers.append(
                TransferSeed(
                    id=r["id"].strip(),
                    player_id=(r.get("player_id") or "").strip(),
                    player_name=r["player_name"].strip(),
                    from_club=((r.get("from_club") or "").strip() or None),
                    to_club=r["to_club"].strip(),
                    fee=float(r.get("fee") or 0) or 0.0,
                    date=r["date"].strip(),
                )
            )

    season = Season(
        league=meta["league"].strip(),
        year=int(meta["year"]),
        name=meta["name"].strip(),
        teams=teams,
        transfers=transfers,
        players=players,
        impact_fallback=_truthy(meta.get("impact_fallback")),
    )

    valid_ids = {t.id for t in teams}
    fixtures: List[dict] = []
    for i, r in enumerate(_rows(folder / "fixtures.csv")):
        home, away = r["home"].strip(), r["away"].strip()
        for tid in (home, away):
            if tid not in valid_ids:
                raise KeyError(
                    f"{folder.name}/fixtures.csv references unknown team id {tid!r}; "
                    f"add it to teams.csv (fail-loud, no fuzzy matching)."
                )
        fx = {
            "id": _opt_int(r.get("id")) if r.get("id") else i,
            "matchday": int(float(r["matchday"])),
            "date": r["date"].strip(),
            "home": home,
            "away": away,
            "fhg": int(float(r["fhg"])),
            "fag": int(float(r["fag"])),
        }
        if (r.get("homeElo") or "").strip():
            fx["homeElo"] = float(r["homeElo"])
        if (r.get("awayElo") or "").strip():
            fx["awayElo"] = float(r["awayElo"])
        fixtures.append(fx)

    return season, fixtures
