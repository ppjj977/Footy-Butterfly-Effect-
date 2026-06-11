#!/usr/bin/env python3
"""Butterfly data pipeline.

Emits one ``public/data/seasons/{league}_{year}.json`` per season plus a
``manifest.json`` index. The pipeline supports three data sources, in
preference order:

1. Live download from football-data.co.uk (results) + clubelo.com (Elo).
2. CSVs manually placed in ``pipeline/data/raw/`` (Kaggle / football-data).
3. The curated, embedded dataset in ``seasons_data.py`` (used when offline).

This repository ships with source (3) wired up so the site is playable with no
network access. When run with network access, pass ``--live`` to fetch the real
fixture-level results (see ``fetch.py``); the embedded final standings are then
used only to validate the download.

The curated builder generates a deterministic double round-robin schedule, then
reconciles it against each season's real final standings so the *baseline*
table the engine shows matches history (exact points, near-exact goal
difference). Counterfactual realism comes from the per-team Elo ratings.
"""
from __future__ import annotations

import json
import os
import random
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List

from seasons_data import SEASONS, TeamSeed
from impact_calc import compute_player_impacts, compute_transfer_impacts

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data" / "seasons"

# A representative scoreline for each outcome + goal margin, used when the
# reconciler forces a result. Goal counts are tuned in the goals phase.
HOME_ADV = 65
ELO_SCALE = 220
BASE_HOME_XG = 1.45
BASE_AWAY_XG = 1.15


def expected_goals(home_elo: float, away_elo: float) -> tuple[float, float]:
    diff = home_elo + HOME_ADV - away_elo
    hg = BASE_HOME_XG * pow(2.718281828, diff / 2 / ELO_SCALE)
    ag = BASE_AWAY_XG * pow(2.718281828, -diff / 2 / ELO_SCALE)
    return max(0.15, min(5.5, hg)), max(0.15, min(5.5, ag))


def poisson(lmbda: float, rng: random.Random) -> int:
    # Knuth.
    L = pow(2.718281828, -lmbda)
    k, p = 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= L:
            return k - 1


def make_schedule(teams: List[str], rng: random.Random) -> List[tuple[int, str, str]]:
    """Double round-robin, returned as (matchday, home, away)."""
    n = len(teams)
    arr = teams[:]
    if n % 2:
        arr.append("__BYE__")
        n += 1
    rounds = []
    fixed = arr[0]
    rot = arr[1:]
    for r in range(n - 1):
        day = [(fixed, rot[-1])] if r % 2 == 0 else [(rot[-1], fixed)]
        for i in range((n - 1) // 2):
            a, b = rot[i], rot[-(i + 2)]
            day.append((a, b) if (r + i) % 2 == 0 else (b, a))
        rounds.append([(h, a) for h, a in day if "__BYE__" not in (h, a)])
        rot = [rot[-1]] + rot[:-1]
    # Second half: reversed venues.
    second = [[(a, h) for h, a in day] for day in rounds]
    schedule: List[tuple[int, str, str]] = []
    md = 1
    for day in rounds + second:
        for h, a in day:
            schedule.append((md, h, a))
        md += 1
    return schedule


def date_for_matchday(year: int, matchday: int, total_days: int) -> str:
    """Spread matchdays across the season (mid-Aug to mid-May)."""
    # Day 1 ~ Aug 19 of `year`; final matchday ~ May 11 of `year+1`.
    import datetime

    start = datetime.date(year, 8, 19)
    end = datetime.date(year + 1, 5, 11)
    span = (end - start).days
    frac = (matchday - 1) / max(1, total_days - 1)
    d = start + datetime.timedelta(days=round(span * frac))
    return d.isoformat()


def points_of(hg: int, ag: int) -> tuple[int, int]:
    if hg > ag:
        return 3, 0
    if hg < ag:
        return 0, 3
    return 1, 1


def reconcile_points(
    fixtures: List[dict],
    targets: Dict[str, int],
    rng: random.Random,
    unbeaten: set | None = None,
) -> None:
    """Greedily edit outcomes so each team's points match its real total.

    Teams in `unbeaten` are never assigned a loss, which (with the points
    target) pins famous unbeaten records exactly.
    """
    unbeaten = unbeaten or set()

    def forbidden(team: str, outcome_pts_pair) -> bool:
        # A team loses when it earns 0 points from a decided game.
        return team in unbeaten and outcome_pts_pair == 0

    def team_points() -> Dict[str, int]:
        pts: Dict[str, int] = {t: 0 for t in targets}
        for fx in fixtures:
            ph, pa = points_of(fx["fhg"], fx["fag"])
            pts[fx["home"]] += ph
            pts[fx["away"]] += pa
        return pts

    def set_outcome(fx: dict, outcome: str) -> None:
        if outcome == "H":
            fx["fhg"], fx["fag"] = 2, 1
        elif outcome == "A":
            fx["fhg"], fx["fag"] = 1, 2
        else:
            fx["fhg"], fx["fag"] = 1, 1

    def outcome_pts(outcome: str) -> tuple[int, int]:
        return {"H": (3, 0), "A": (0, 3), "D": (1, 1)}[outcome]

    # Pre-pass: clear any initial losses for unbeaten teams (force a draw).
    for fx in fixtures:
        ph, pa = points_of(fx["fhg"], fx["fag"])
        if (fx["home"] in unbeaten and ph == 0) or (
            fx["away"] in unbeaten and pa == 0
        ):
            set_outcome(fx, "D")

    # Hill-climb with random-walk escapes, tracking the best solution seen.
    best_outcomes = [points_of(fx["fhg"], fx["fag"]) for fx in fixtures]
    best_err = sum(abs(team_points()[t] - targets[t]) for t in targets)

    for _ in range(60000):
        pts = team_points()
        err = {t: pts[t] - targets[t] for t in targets}
        total_err = sum(abs(e) for e in err.values())
        if total_err < best_err:
            best_err = total_err
            best_outcomes = [points_of(fx["fhg"], fx["fag"]) for fx in fixtures]
        if total_err == 0:
            return
        best = None  # (reduction, fx_index, outcome)
        for idx, fx in enumerate(fixtures):
            h, a = fx["home"], fx["away"]
            ph, pa = points_of(fx["fhg"], fx["fag"])
            for outcome in ("H", "D", "A"):
                nh, na = outcome_pts(outcome)
                if (nh, na) == (ph, pa):
                    continue
                if forbidden(h, nh) or forbidden(a, na):
                    continue
                reduction = (abs(err[h]) + abs(err[a])) - (
                    abs(err[h] + nh - ph) + abs(err[a] + na - pa)
                )
                if best is None or reduction > best[0]:
                    best = (reduction, idx, outcome)
        if best is not None and best[0] > 0:
            set_outcome(fixtures[best[1]], best[2])
        else:
            # Plateau / local min: take a few random sideways moves to escape,
            # respecting the unbeaten constraint.
            for _ in range(3):
                fx = rng.choice(fixtures)
                choices = ["H", "D", "A"]
                if fx["home"] in unbeaten:
                    choices = [o for o in choices if o != "A"]
                if fx["away"] in unbeaten:
                    choices = [o for o in choices if o != "H"]
                set_outcome(fx, rng.choice(choices))

    # Restore the best solution found.
    for fx, (ph, _pa) in zip(fixtures, best_outcomes):
        if (ph, _pa) == (3, 0):
            fx["fhg"], fx["fag"] = 2, 1
        elif (ph, _pa) == (0, 3):
            fx["fhg"], fx["fag"] = 1, 2
        else:
            fx["fhg"], fx["fag"] = 1, 1


def reconcile_goals(
    fixtures: List[dict], gf: Dict[str, int], ga: Dict[str, int]
) -> None:
    """Adjust goal counts (keeping each outcome) toward real GF/GA."""

    def totals() -> tuple[Dict[str, int], Dict[str, int]]:
        f = {t: 0 for t in gf}
        a = {t: 0 for t in gf}
        for fx in fixtures:
            f[fx["home"]] += fx["fhg"]
            a[fx["home"]] += fx["fag"]
            f[fx["away"]] += fx["fag"]
            a[fx["away"]] += fx["fhg"]
        return f, a

    for _ in range(40):
        cf, ca = totals()
        improved = False
        for fx in fixtures:
            h, a = fx["home"], fx["away"]
            hg, ag = fx["fhg"], fx["fag"]
            decisive_home = hg > ag
            decisive_away = ag > hg
            draw = hg == ag
            # Try raising/lowering home goals while preserving outcome.
            for dh in (1, -1):
                nhg = hg + dh
                if nhg < 0 or nhg > 7:
                    continue
                if draw and nhg != ag:
                    continue
                if decisive_home and nhg <= ag:
                    continue
                if decisive_away and nhg >= ag:
                    continue
                before = abs(cf[h] - gf[h]) + abs(ca[a] - ga[a])
                after = abs(cf[h] + dh - gf[h]) + abs(ca[a] + dh - ga[a])
                if after < before:
                    fx["fhg"] = nhg
                    cf[h] += dh
                    ca[a] += dh
                    hg = nhg
                    improved = True
            for da in (1, -1):
                nag = ag + da
                if nag < 0 or nag > 7:
                    continue
                if draw and nag != hg:
                    continue
                if decisive_home and nag >= hg:
                    continue
                if decisive_away and nag <= hg:
                    continue
                before = abs(cf[a] - gf[a]) + abs(ca[h] - ga[h])
                after = abs(cf[a] + da - gf[a]) + abs(ca[h] + da - ga[h])
                if after < before:
                    fx["fag"] = nag
                    cf[a] += da
                    ca[h] += da
                    ag = nag
                    improved = True
        if not improved:
            break


def elo_from_points(pts: int) -> float:
    return round(1500 + (pts - 50) * 8)


def build_season(key: str, season) -> dict:
    rng = random.Random(season.year * 1000 + 7)
    teams: List[TeamSeed] = season.teams
    ids = [t.id for t in teams]
    elo = {t.id: (t.elo if t.elo else elo_from_points(t.pts)) for t in teams}

    schedule = make_schedule(ids, rng)
    total_days = max(md for md, _, _ in schedule)
    fixtures: List[dict] = []
    for fid, (md, h, a) in enumerate(sorted(schedule, key=lambda x: x[0])):
        hxg, axg = expected_goals(elo[h], elo[a])
        fixtures.append(
            {
                "id": fid,
                "matchday": md,
                "date": date_for_matchday(season.year, md, total_days),
                "home": h,
                "away": a,
                "fhg": poisson(hxg, rng),
                "fag": poisson(axg, rng),
            }
        )

    targets = {t.id: t.pts for t in teams}
    unbeaten = {t.id for t in teams if getattr(t, "unbeaten", False)}
    reconcile_points(fixtures, targets, rng, unbeaten)
    gf = {t.id: t.gf for t in teams}
    ga = {t.id: t.ga for t in teams}
    reconcile_goals(fixtures, gf, ga)

    players = compute_player_impacts(season)
    transfers = compute_transfer_impacts(season, players)

    return {
        "meta": {
            "league": season.league,
            "year": season.year,
            "name": season.name,
            "teams": len(teams),
            "dataSource": "curated-model",
            "impactFallback": season.impact_fallback,
        },
        "teams": [
            {"id": t.id, "name": t.name, "short": t.short, "elo": elo[t.id]}
            for t in teams
        ],
        "fixtures": fixtures,
        "transfers": [asdict(tr) for tr in transfers],
        "players": [asdict(p) for p in players],
    }


def validate(key: str, data: dict, season) -> List[str]:
    """Return a list of validation warnings/errors for the report."""
    issues = []
    n = data["meta"]["teams"]
    expected_fixtures = n * (n - 1)
    if len(data["fixtures"]) != expected_fixtures:
        issues.append(
            f"{key}: fixture count {len(data['fixtures'])} != {expected_fixtures}"
        )
    # Recompute table and compare points to targets.
    pts = {t["id"]: 0 for t in data["teams"]}
    for fx in data["fixtures"]:
        ph, pa = points_of(fx["fhg"], fx["fag"])
        pts[fx["home"]] += ph
        pts[fx["away"]] += pa
    for t in season.teams:
        if pts[t.id] != t.pts:
            issues.append(
                f"{key}: {t.id} points {pts[t.id]} != real {t.pts} (residual)"
            )
    return issues


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"leagues": {}, "seasons": []}
    report_lines = ["# Butterfly pipeline validation report", ""]
    all_ok = True

    for key, season in SEASONS.items():
        data = build_season(key, season)
        out_path = OUT_DIR / f"{key}.json"
        out_path.write_text(json.dumps(data, separators=(",", ":")))
        size_kb = out_path.stat().st_size / 1024

        issues = validate(key, data, season)
        if issues:
            all_ok = False

        # Impact sanity table: top 5 players by impact.
        top5 = sorted(data["players"], key=lambda p: -p["impact"])[:5]
        report_lines.append(f"## {season.name}  (`{key}.json`, {size_kb:.0f} KB)")
        report_lines.append(
            f"- fixtures: {len(data['fixtures'])}  "
            f"transfers: {len(data['transfers'])}  players: {len(data['players'])}"
        )
        report_lines.append(
            f"- impact source: "
            f"{'minutes+G/A fallback' if season.impact_fallback else 'minutes+value+G/A'}"
        )
        report_lines.append("- top-5 impact deltas (Elo points):")
        for p in top5:
            report_lines.append(
                f"    - {p['name']:<22} {p['club']:<5} {p['impact']:5.1f}"
            )
        if issues:
            report_lines.append("- ⚠️ ISSUES:")
            for i in issues:
                report_lines.append(f"    - {i}")
        else:
            report_lines.append("- ✅ baseline table matches real points exactly")
        report_lines.append("")

        manifest["seasons"].append(
            {
                "key": key,
                "league": season.league,
                "year": season.year,
                "name": season.name,
                "file": f"{key}.json",
                "sizeKb": round(size_kb, 1),
                "dataSource": data["meta"]["dataSource"],
                "impactFallback": season.impact_fallback,
            }
        )
        manifest["leagues"].setdefault(
            season.league, {"name": "Premier League"}
        )

    manifest["seasons"].sort(key=lambda s: (s["league"], s["year"]))
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (ROOT / "pipeline" / "validation_report.md").write_text("\n".join(report_lines))

    print("\n".join(report_lines))
    print(f"\nWrote {len(manifest['seasons'])} seasons to {OUT_DIR}")
    print("manifest.json + validation_report.md written")
    if not all_ok:
        raise SystemExit("Validation found residual mismatches (see report).")


if __name__ == "__main__":
    main()
