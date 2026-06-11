"""Premier League club registry (1992–present).

Single source of truth for mapping the various club-name spellings used by
external data sources (football-data.co.uk, ClubElo, Transfermarkt) onto our
stable team ids. Mapping is explicit and we fail loudly on an unknown name —
never fuzzy-match silently.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class Club:
    id: str
    name: str  # canonical display name
    short: str  # 3–4 char label
    aliases: tuple  # spellings seen in source data


CLUBS: List[Club] = [
    Club("ARS", "Arsenal", "ARS", ("Arsenal",)),
    Club("AVL", "Aston Villa", "AVL", ("Aston Villa",)),
    Club("BAR", "Barnsley", "BAR", ("Barnsley",)),
    Club("BIR", "Birmingham City", "BIR", ("Birmingham",)),
    Club("BLB", "Blackburn Rovers", "BLB", ("Blackburn",)),
    Club("BLP", "Blackpool", "BLP", ("Blackpool",)),
    Club("BOL", "Bolton Wanderers", "BOL", ("Bolton",)),
    Club("BOU", "Bournemouth", "BOU", ("Bournemouth",)),
    Club("BRA", "Bradford City", "BRA", ("Bradford",)),
    Club("BRE", "Brentford", "BRE", ("Brentford",)),
    Club("BHA", "Brighton & Hove Albion", "BHA", ("Brighton",)),
    Club("BUR", "Burnley", "BUR", ("Burnley",)),
    Club("CAR", "Cardiff City", "CAR", ("Cardiff",)),
    Club("CHA", "Charlton Athletic", "CHA", ("Charlton",)),
    Club("CHE", "Chelsea", "CHE", ("Chelsea",)),
    Club("COV", "Coventry City", "COV", ("Coventry",)),
    Club("CRY", "Crystal Palace", "CRY", ("Crystal Palace",)),
    Club("DER", "Derby County", "DER", ("Derby",)),
    Club("EVE", "Everton", "EVE", ("Everton",)),
    Club("FUL", "Fulham", "FUL", ("Fulham",)),
    Club("HUD", "Huddersfield Town", "HUD", ("Huddersfield",)),
    Club("HUL", "Hull City", "HUL", ("Hull",)),
    Club("IPS", "Ipswich Town", "IPS", ("Ipswich",)),
    Club("LEE", "Leeds United", "LEE", ("Leeds",)),
    Club("LEI", "Leicester City", "LEI", ("Leicester",)),
    Club("LIV", "Liverpool", "LIV", ("Liverpool",)),
    Club("LUT", "Luton Town", "LUT", ("Luton",)),
    Club("MCI", "Manchester City", "MCI", ("Man City", "Manchester City")),
    Club("MUN", "Manchester United", "MUN", ("Man United", "Manchester United", "Man Utd")),
    Club("MID", "Middlesbrough", "MID", ("Middlesbrough", "Middlesboro")),
    Club("NEW", "Newcastle United", "NEW", ("Newcastle",)),
    Club("NOR", "Norwich City", "NOR", ("Norwich",)),
    Club("NFO", "Nottingham Forest", "NFO", ("Nott'm Forest", "Nottingham Forest")),
    Club("OLD", "Oldham Athletic", "OLD", ("Oldham",)),
    Club("POR", "Portsmouth", "POR", ("Portsmouth",)),
    Club("QPR", "Queens Park Rangers", "QPR", ("QPR",)),
    Club("REA", "Reading", "REA", ("Reading",)),
    Club("SHU", "Sheffield United", "SHU", ("Sheffield United",)),
    Club("SHW", "Sheffield Wednesday", "SHW", ("Sheffield Weds", "Sheffield Wednesday")),
    Club("SOU", "Southampton", "SOU", ("Southampton",)),
    Club("STK", "Stoke City", "STK", ("Stoke",)),
    Club("SUN", "Sunderland", "SUN", ("Sunderland",)),
    Club("SWA", "Swansea City", "SWA", ("Swansea",)),
    Club("SWI", "Swindon Town", "SWI", ("Swindon",)),
    Club("TOT", "Tottenham Hotspur", "TOT", ("Tottenham", "Spurs")),
    Club("WAT", "Watford", "WAT", ("Watford",)),
    Club("WBA", "West Bromwich Albion", "WBA", ("West Brom",)),
    Club("WHU", "West Ham United", "WHU", ("West Ham",)),
    Club("WIG", "Wigan Athletic", "WIG", ("Wigan",)),
    Club("WIM", "Wimbledon", "WIM", ("Wimbledon",)),
    Club("WOL", "Wolverhampton Wanderers", "WOL", ("Wolves", "Wolverhampton")),
]

BY_ID: Dict[str, Club] = {c.id: c for c in CLUBS}

# Lowercased alias (and id, and canonical name) -> id.
ALIAS_TO_ID: Dict[str, str] = {}
for _c in CLUBS:
    ALIAS_TO_ID[_c.id.lower()] = _c.id
    ALIAS_TO_ID[_c.name.lower()] = _c.id
    ALIAS_TO_ID[_c.name.replace("&", "and").lower()] = _c.id
    for _a in _c.aliases:
        ALIAS_TO_ID[_a.lower()] = _c.id

# Suffix/prefix noise in Transfermarkt's long legal names, e.g.
# "Manchester United Football Club", "Association Football Club Bournemouth".
_SUFFIXES = (
    " association football club",
    " football club",
    " f.c.",
    " fc",
    " afc",
)
_PREFIXES = ("association football club ", "afc ")


def _normalise(name: str) -> str:
    s = (name or "").strip()
    low = s.lower()
    changed = True
    while changed:
        changed = False
        for suf in _SUFFIXES:
            if low.endswith(suf):
                s = s[: len(s) - len(suf)].strip()
                low = s.lower()
                changed = True
        for pre in _PREFIXES:
            if low.startswith(pre):
                s = s[len(pre):].strip()
                low = s.lower()
                changed = True
    return s


def resolve(name: str) -> str:
    """Map a source club name to our id, or raise with a clear message.

    Tolerates Transfermarkt's long legal names and 'and' vs '&'.
    """
    raw = (name or "").strip().lower()
    if raw in ALIAS_TO_ID:
        return ALIAS_TO_ID[raw]
    norm = _normalise(name).lower()
    for cand in (norm, norm.replace(" and ", " & "), norm.replace(" & ", " and ")):
        if cand in ALIAS_TO_ID:
            return ALIAS_TO_ID[cand]
    raise KeyError(name)
