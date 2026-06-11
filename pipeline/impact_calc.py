"""Player + transfer impact deltas. Mirrors src/engine/impact.ts exactly."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

MAX_DELTA = 90.0
W_MIN, W_VAL, W_GA = 0.35, 0.40, 0.25
GK_MULT = 0.7


@dataclass
class PlayerOut:
    id: str
    name: str
    club: str
    position: str
    minutes: int
    goals: int
    assists: int
    impact: float
    valueShare: Optional[float] = None


@dataclass
class TransferOut:
    id: str
    playerId: str
    playerName: str
    fromClub: Optional[str]
    toClub: str
    fee: float
    date: str
    impact: float


def _impact(min_share, val_share, ga_share, position, fallback) -> float:
    if fallback or val_share is None:
        raw = 0.55 * min_share + 0.45 * ga_share
    else:
        raw = W_MIN * min_share + W_VAL * val_share + W_GA * ga_share
    delta = raw * MAX_DELTA
    if position == "GK":
        delta *= GK_MULT
    return round(max(0.0, min(MAX_DELTA, delta)), 1)


MAX_MINUTES = 3420.0  # 38 games * 90 min
GA_BENCHMARK = 35.0  # an elite attacking season's goals + assists


def compute_player_impacts(season) -> List[PlayerOut]:
    """Shares are absolute (fraction of a maximal contribution), not per-club,
    so only genuinely elite players approach MAX_DELTA."""
    out: List[PlayerOut] = []
    for p in season.players:
        min_share = min(1.0, p.minutes / MAX_MINUTES)
        ga_share = min(1.0, (p.goals + p.assists) / GA_BENCHMARK)
        val_share = p.value_share if not season.impact_fallback else None
        impact = _impact(min_share, val_share, ga_share, p.position, season.impact_fallback)
        out.append(
            PlayerOut(
                id=p.id,
                name=p.name,
                club=p.club,
                position=p.position,
                minutes=p.minutes,
                goals=p.goals,
                assists=p.assists,
                impact=impact,
                valueShare=(round(val_share, 3) if val_share is not None else None),
            )
        )
    return out


def compute_transfer_impacts(season, players: List[PlayerOut]) -> List[TransferOut]:
    by_id = {p.id: p for p in players}
    out: List[TransferOut] = []
    for tr in season.transfers:
        # If the transferred player is in our player records, reuse his impact;
        # otherwise estimate from the fee (a £m -> Elo heuristic for arrivals
        # we don't track at player level).
        pl = by_id.get(tr.player_id)
        if pl is not None:
            impact = pl.impact
        else:
            impact = round(min(MAX_DELTA, tr.fee * 1.6), 1)
        out.append(
            TransferOut(
                id=tr.id,
                playerId=tr.player_id,
                playerName=tr.player_name,
                fromClub=tr.from_club,
                toClub=tr.to_club,
                fee=tr.fee,
                date=tr.date,
                impact=impact,
            )
        )
    return out
