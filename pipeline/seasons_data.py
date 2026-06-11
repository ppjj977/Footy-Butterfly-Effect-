"""Curated, embedded historical Premier League data.

This is the offline data source (source #3 in build.py). For each season we
embed the **real** final standings (points, goals for/against — the engine
baseline reconciles to these exactly for points and closely for goal
difference) plus curated notable transfers and players. Strength ratings are
derived from final points unless overridden.

Adding a season is a config addition: append a Season to SEASONS. The format is
league-agnostic.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class TeamSeed:
    id: str
    name: str
    short: str
    pts: int
    gf: int
    ga: int
    elo: Optional[float] = None
    unbeaten: bool = False  # pin a famous unbeaten record (e.g. Invincibles)


@dataclass
class PlayerSeed:
    id: str
    name: str
    club: str
    position: str  # GK/DF/MF/FW
    minutes: int
    goals: int
    assists: int
    value_share: float = 0.0  # share of squad value (used when not fallback)


@dataclass
class TransferSeed:
    id: str
    player_id: str
    player_name: str
    from_club: Optional[str]
    to_club: str
    fee: float
    date: str


@dataclass
class Season:
    league: str
    year: int
    name: str
    teams: List[TeamSeed]
    transfers: List[TransferSeed] = field(default_factory=list)
    players: List[PlayerSeed] = field(default_factory=list)
    impact_fallback: bool = False


# ── 1995/96 ────────────────────────────────────────────────────────────────
S9596 = Season(
    league="PL",
    year=1995,
    name="Premier League 1995/96",
    impact_fallback=True,  # Transfermarkt valuations start ~2004.
    teams=[
        TeamSeed("MUN", "Manchester United", "MUN", 82, 73, 35),
        TeamSeed("NEW", "Newcastle United", "NEW", 78, 66, 37),
        TeamSeed("LIV", "Liverpool", "LIV", 71, 70, 34),
        TeamSeed("AVL", "Aston Villa", "AVL", 63, 52, 35),
        TeamSeed("ARS", "Arsenal", "ARS", 63, 49, 32),
        TeamSeed("EVE", "Everton", "EVE", 61, 64, 44),
        TeamSeed("BLB", "Blackburn Rovers", "BLB", 61, 61, 47),
        TeamSeed("TOT", "Tottenham Hotspur", "TOT", 61, 50, 38),
        TeamSeed("NFO", "Nottingham Forest", "NFO", 58, 50, 54),
        TeamSeed("WHU", "West Ham United", "WHU", 51, 43, 52),
        TeamSeed("CHE", "Chelsea", "CHE", 50, 46, 44),
        TeamSeed("MID", "Middlesbrough", "MID", 43, 35, 50),
        TeamSeed("LEE", "Leeds United", "LEE", 43, 40, 57),
        TeamSeed("WIM", "Wimbledon", "WIM", 41, 55, 70),
        TeamSeed("SHW", "Sheffield Wednesday", "SHW", 40, 48, 61),
        TeamSeed("COV", "Coventry City", "COV", 38, 42, 60),
        TeamSeed("SOU", "Southampton", "SOU", 38, 34, 52),
        TeamSeed("MCI", "Manchester City", "MCI", 38, 33, 58),
        TeamSeed("QPR", "Queens Park Rangers", "QPR", 33, 38, 57),
        TeamSeed("BOL", "Bolton Wanderers", "BOL", 29, 39, 71),
    ],
    transfers=[
        TransferSeed("t9596_ferdinand", "p_ferdinand", "Les Ferdinand", "QPR", "NEW", 6.0, "1995-08-19"),
        TransferSeed("t9596_ginola", "p_ginola", "David Ginola", None, "NEW", 2.5, "1995-08-19"),
        TransferSeed("t9596_collymore", "p_collymore", "Stan Collymore", "NFO", "LIV", 8.5, "1995-08-19"),
        TransferSeed("t9596_bergkamp", "p_bergkamp", "Dennis Bergkamp", None, "ARS", 7.5, "1995-08-19"),
        TransferSeed("t9596_platt", "p_platt", "David Platt", None, "ARS", 4.75, "1995-08-19"),
        TransferSeed("t9596_gullit", "p_gullit", "Ruud Gullit", None, "CHE", 0.0, "1995-08-19"),
        TransferSeed("t9596_kinkladze", "p_kinkladze", "Georgi Kinkladze", None, "MCI", 2.0, "1995-08-19"),
        TransferSeed("t9596_juninho", "p_juninho", "Juninho", None, "MID", 4.75, "1995-10-29"),
        TransferSeed("t9596_yeboah", "p_yeboah", "Tony Yeboah", None, "LEE", 3.4, "1995-08-19"),
    ],
    players=[
        PlayerSeed("p_shearer", "Alan Shearer", "BLB", "FW", 3150, 31, 2),
        PlayerSeed("p_sutton", "Chris Sutton", "BLB", "FW", 2400, 15, 4),
        PlayerSeed("p_ferdinand", "Les Ferdinand", "NEW", "FW", 3100, 25, 6),
        PlayerSeed("p_ginola", "David Ginola", "NEW", "MF", 2950, 5, 11),
        PlayerSeed("p_beardsley", "Peter Beardsley", "NEW", "MF", 3050, 8, 9),
        PlayerSeed("p_lee", "Rob Lee", "NEW", "MF", 3200, 8, 6),
        PlayerSeed("p_srnicek", "Pavel Srnicek", "NEW", "GK", 3060, 0, 0),
        PlayerSeed("p_cantona", "Eric Cantona", "MUN", "FW", 2800, 14, 10),
        PlayerSeed("p_cole", "Andy Cole", "MUN", "FW", 2200, 11, 4),
        PlayerSeed("p_giggs", "Ryan Giggs", "MUN", "MF", 2700, 11, 8),
        PlayerSeed("p_keane", "Roy Keane", "MUN", "MF", 2900, 6, 3),
        PlayerSeed("p_schmeichel", "Peter Schmeichel", "MUN", "GK", 3330, 0, 0),
        PlayerSeed("p_beckham", "David Beckham", "MUN", "MF", 2100, 7, 4),
        PlayerSeed("p_fowler", "Robbie Fowler", "LIV", "FW", 3100, 28, 5),
        PlayerSeed("p_mcmanaman", "Steve McManaman", "LIV", "MF", 3200, 6, 12),
        PlayerSeed("p_collymore", "Stan Collymore", "LIV", "FW", 2400, 14, 7),
        PlayerSeed("p_barnes", "John Barnes", "LIV", "MF", 3000, 3, 9),
        PlayerSeed("p_bergkamp", "Dennis Bergkamp", "ARS", "FW", 2600, 11, 6),
        PlayerSeed("p_wright", "Ian Wright", "ARS", "FW", 2500, 15, 3),
        PlayerSeed("p_platt", "David Platt", "ARS", "MF", 2400, 6, 4),
        PlayerSeed("p_yeboah", "Tony Yeboah", "LEE", "FW", 1900, 12, 2),
        PlayerSeed("p_juninho", "Juninho", "MID", "MF", 2100, 2, 6),
        PlayerSeed("p_ravanelli", "Jamie Redknapp", "LIV", "MF", 2600, 3, 5),
        PlayerSeed("p_klinsmann", "Jurgen Klinsmann", "TOT", "FW", 2700, 15, 6),
        PlayerSeed("p_sheringham", "Teddy Sheringham", "TOT", "FW", 2800, 16, 9),
        PlayerSeed("p_kinkladze", "Georgi Kinkladze", "MCI", "MF", 2900, 4, 5),
        PlayerSeed("p_gullit", "Ruud Gullit", "CHE", "MF", 2300, 3, 6),
        PlayerSeed("p_le_tissier", "Matt Le Tissier", "SOU", "MF", 3000, 7, 9),
        PlayerSeed("p_kanchelskis", "Andrei Kanchelskis", "EVE", "MF", 2800, 16, 5),
        PlayerSeed("p_dublin", "Dion Dublin", "COV", "FW", 2900, 14, 2),
    ],
)


# ── 2003/04 (the Invincibles) ────────────────────────────────────────────
S0304 = Season(
    league="PL",
    year=2003,
    name="Premier League 2003/04",
    impact_fallback=True,  # Valuations only just emerging; use minutes+G/A.
    teams=[
        TeamSeed("ARS", "Arsenal", "ARS", 90, 73, 26, unbeaten=True),
        TeamSeed("CHE", "Chelsea", "CHE", 79, 67, 30),
        TeamSeed("MUN", "Manchester United", "MUN", 75, 64, 35),
        TeamSeed("LIV", "Liverpool", "LIV", 60, 55, 37),
        TeamSeed("NEW", "Newcastle United", "NEW", 56, 52, 40),
        TeamSeed("AVL", "Aston Villa", "AVL", 56, 48, 44),
        TeamSeed("CHA", "Charlton Athletic", "CHA", 53, 51, 51),
        TeamSeed("BOL", "Bolton Wanderers", "BOL", 53, 48, 56),
        TeamSeed("FUL", "Fulham", "FUL", 52, 52, 46),
        TeamSeed("BIR", "Birmingham City", "BIR", 50, 43, 48),
        TeamSeed("MID", "Middlesbrough", "MID", 48, 44, 52),
        TeamSeed("SOU", "Southampton", "SOU", 47, 44, 45),
        TeamSeed("POR", "Portsmouth", "POR", 45, 47, 54),
        TeamSeed("TOT", "Tottenham Hotspur", "TOT", 45, 47, 57),
        TeamSeed("BLB", "Blackburn Rovers", "BLB", 44, 51, 59),
        TeamSeed("MCI", "Manchester City", "MCI", 41, 55, 54),
        TeamSeed("EVE", "Everton", "EVE", 39, 45, 57),
        TeamSeed("LEI", "Leicester City", "LEI", 33, 48, 65),
        TeamSeed("LEE", "Leeds United", "LEE", 33, 40, 79),
        TeamSeed("WOL", "Wolverhampton", "WOL", 33, 38, 77),
    ],
    transfers=[
        TransferSeed("t0304_ronaldo", "p_ronaldo", "Cristiano Ronaldo", None, "MUN", 12.24, "2003-08-16"),
        TransferSeed("t0304_makelele", "p_makelele", "Claude Makelele", None, "CHE", 16.6, "2003-08-16"),
        TransferSeed("t0304_duff", "p_duff", "Damien Duff", "BLB", "CHE", 17.0, "2003-08-16"),
        TransferSeed("t0304_crespo", "p_crespo", "Hernan Crespo", None, "CHE", 16.8, "2003-08-16"),
        TransferSeed("t0304_veron", "p_veron", "Juan Sebastian Veron", "MUN", "CHE", 15.0, "2003-08-16"),
        TransferSeed("t0304_kewell", "p_kewell", "Harry Kewell", "LEE", "LIV", 5.0, "2003-08-16"),
        TransferSeed("t0304_joecole", "p_joecole", "Joe Cole", "WHU", "CHE", 6.6, "2003-08-16"),
        TransferSeed("t0304_bridge", "p_bridge", "Wayne Bridge", "SOU", "CHE", 7.0, "2003-08-16"),
    ],
    players=[
        PlayerSeed("p_henry", "Thierry Henry", "ARS", "FW", 3250, 30, 6),
        PlayerSeed("p_pires", "Robert Pires", "ARS", "MF", 3000, 14, 7),
        PlayerSeed("p_bergkamp03", "Dennis Bergkamp", "ARS", "FW", 2200, 4, 8),
        PlayerSeed("p_vieira", "Patrick Vieira", "ARS", "MF", 2700, 3, 4),
        PlayerSeed("p_ljungberg", "Freddie Ljungberg", "ARS", "MF", 2400, 4, 5),
        PlayerSeed("p_lehmann", "Jens Lehmann", "ARS", "GK", 3420, 0, 0),
        PlayerSeed("p_campbell", "Sol Campbell", "ARS", "DF", 3100, 1, 0),
        PlayerSeed("p_hasselbaink", "Jimmy Floyd Hasselbaink", "CHE", "FW", 2600, 12, 5),
        PlayerSeed("p_lampard", "Frank Lampard", "CHE", "MF", 3380, 10, 7),
        PlayerSeed("p_makelele", "Claude Makelele", "CHE", "MF", 3000, 0, 2),
        PlayerSeed("p_duff", "Damien Duff", "CHE", "MF", 2400, 7, 6),
        PlayerSeed("p_crespo", "Hernan Crespo", "CHE", "FW", 1700, 10, 3),
        PlayerSeed("p_gudjohnsen", "Eidur Gudjohnsen", "CHE", "FW", 2300, 13, 4),
        PlayerSeed("p_vannistelrooy", "Ruud van Nistelrooy", "MUN", "FW", 2900, 20, 4),
        PlayerSeed("p_scholes", "Paul Scholes", "MUN", "MF", 2600, 9, 4),
        PlayerSeed("p_ronaldo", "Cristiano Ronaldo", "MUN", "MF", 1900, 4, 4),
        PlayerSeed("p_giggs03", "Ryan Giggs", "MUN", "MF", 2700, 7, 10),
        PlayerSeed("p_keane03", "Roy Keane", "MUN", "MF", 2800, 3, 5),
        PlayerSeed("p_owen", "Michael Owen", "LIV", "FW", 2700, 16, 6),
        PlayerSeed("p_gerrard", "Steven Gerrard", "LIV", "MF", 3000, 4, 6),
        PlayerSeed("p_baros", "Milan Baros", "LIV", "FW", 1900, 9, 3),
        PlayerSeed("p_shearer03", "Alan Shearer", "NEW", "FW", 3100, 22, 7),
        PlayerSeed("p_bellamy", "Craig Bellamy", "NEW", "FW", 2100, 9, 5),
        PlayerSeed("p_yorke", "Yakubu Aiyegbeni", "POR", "FW", 2900, 16, 3),
        PlayerSeed("p_anelka", "Nicolas Anelka", "MCI", "FW", 3200, 16, 4),
        PlayerSeed("p_dunne", "Marian Pahars", "SOU", "FW", 1800, 7, 2),
        PlayerSeed("p_defoe", "Jermain Defoe", "TOT", "FW", 1900, 7, 2),
    ],
)


# ── 2011/12 (Aguerooo) ─────────────────────────────────────────────────────
S1112 = Season(
    league="PL",
    year=2011,
    name="Premier League 2011/12",
    impact_fallback=False,  # Valuations available.
    teams=[
        TeamSeed("MCI", "Manchester City", "MCI", 89, 93, 29),
        TeamSeed("MUN", "Manchester United", "MUN", 89, 89, 33),
        TeamSeed("ARS", "Arsenal", "ARS", 70, 74, 49),
        TeamSeed("TOT", "Tottenham Hotspur", "TOT", 69, 66, 41),
        TeamSeed("NEW", "Newcastle United", "NEW", 65, 56, 51),
        TeamSeed("CHE", "Chelsea", "CHE", 64, 65, 46),
        TeamSeed("EVE", "Everton", "EVE", 56, 50, 40),
        TeamSeed("LIV", "Liverpool", "LIV", 52, 47, 40),
        TeamSeed("FUL", "Fulham", "FUL", 52, 48, 51),
        TeamSeed("WBA", "West Bromwich Albion", "WBA", 47, 45, 52),
        TeamSeed("SWA", "Swansea City", "SWA", 47, 44, 51),
        TeamSeed("NOR", "Norwich City", "NOR", 47, 52, 66),
        TeamSeed("SUN", "Sunderland", "SUN", 45, 45, 46),
        TeamSeed("STK", "Stoke City", "STK", 45, 36, 53),
        TeamSeed("WIG", "Wigan Athletic", "WIG", 43, 42, 62),
        TeamSeed("AVL", "Aston Villa", "AVL", 38, 37, 53),
        TeamSeed("QPR", "Queens Park Rangers", "QPR", 37, 43, 66),
        TeamSeed("BOL", "Bolton Wanderers", "BOL", 36, 46, 77),
        TeamSeed("BLB", "Blackburn Rovers", "BLB", 31, 48, 78),
        TeamSeed("WOL", "Wolverhampton", "WOL", 25, 40, 82),
    ],
    transfers=[
        TransferSeed("t1112_aguero", "p_aguero", "Sergio Aguero", None, "MCI", 38.0, "2011-07-28"),
        TransferSeed("t1112_nasri", "p_nasri", "Samir Nasri", "ARS", "MCI", 24.0, "2011-08-24"),
        TransferSeed("t1112_clichy", "p_clichy", "Gael Clichy", "ARS", "MCI", 7.0, "2011-07-06"),
        TransferSeed("t1112_degea", "p_degea", "David de Gea", None, "MUN", 18.9, "2011-06-29"),
        TransferSeed("t1112_young", "p_young", "Ashley Young", "AVL", "MUN", 17.0, "2011-06-23"),
        TransferSeed("t1112_jones", "p_jones", "Phil Jones", "BLB", "MUN", 16.5, "2011-06-13"),
        TransferSeed("t1112_mata", "p_mata", "Juan Mata", None, "CHE", 23.5, "2011-08-23"),
        TransferSeed("t1112_downing", "p_downing", "Stewart Downing", "AVL", "LIV", 20.0, "2011-07-15"),
        TransferSeed("t1112_henderson", "p_henderson", "Jordan Henderson", "SUN", "LIV", 16.0, "2011-06-09"),
        TransferSeed("t1112_parker", "p_parker", "Scott Parker", "WHU", "TOT", 5.5, "2011-08-31"),
    ],
    players=[
        PlayerSeed("p_aguero", "Sergio Aguero", "MCI", "FW", 2750, 23, 8, 0.16),
        PlayerSeed("p_silva", "David Silva", "MCI", "MF", 3050, 6, 15, 0.13),
        PlayerSeed("p_yaya", "Yaya Toure", "MCI", "MF", 2900, 6, 6, 0.12),
        PlayerSeed("p_kompany", "Vincent Kompany", "MCI", "DF", 3000, 3, 1, 0.11),
        PlayerSeed("p_hart", "Joe Hart", "MCI", "GK", 3420, 0, 0, 0.07),
        PlayerSeed("p_dzeko", "Edin Dzeko", "MCI", "FW", 1700, 14, 5, 0.08),
        PlayerSeed("p_nasri", "Samir Nasri", "MCI", "MF", 2600, 5, 7, 0.09),
        PlayerSeed("p_rooney", "Wayne Rooney", "MUN", "FW", 3000, 27, 8, 0.18),
        PlayerSeed("p_vanpersie11", "Antonio Valencia", "MUN", "MF", 2700, 6, 12, 0.09),
        PlayerSeed("p_welbeck", "Danny Welbeck", "MUN", "FW", 2100, 9, 3, 0.06),
        PlayerSeed("p_degea", "David de Gea", "MUN", "GK", 2880, 0, 0, 0.08),
        PlayerSeed("p_evra", "Patrice Evra", "MUN", "DF", 3100, 1, 4, 0.07),
        PlayerSeed("p_scholes11", "Paul Scholes", "MUN", "MF", 1600, 4, 2, 0.05),
        PlayerSeed("p_vanpersie", "Robin van Persie", "ARS", "FW", 3050, 30, 9, 0.2),
        PlayerSeed("p_song", "Alex Song", "ARS", "MF", 2900, 1, 11, 0.07),
        PlayerSeed("p_walcott", "Theo Walcott", "ARS", "FW", 2600, 11, 8, 0.09),
        PlayerSeed("p_vandervaart", "Rafael van der Vaart", "TOT", "MF", 2300, 11, 6, 0.12),
        PlayerSeed("p_bale", "Gareth Bale", "TOT", "MF", 2900, 9, 11, 0.13),
        PlayerSeed("p_modric", "Luka Modric", "TOT", "MF", 2900, 4, 9, 0.13),
        PlayerSeed("p_parker", "Scott Parker", "TOT", "MF", 2700, 1, 2, 0.07),
        PlayerSeed("p_ba", "Demba Ba", "NEW", "FW", 2100, 16, 1, 0.1),
        PlayerSeed("p_cisse", "Papiss Cisse", "NEW", "FW", 1500, 13, 1, 0.09),
        PlayerSeed("p_tiote", "Cheick Tiote", "NEW", "MF", 2600, 1, 1, 0.07),
        PlayerSeed("p_mata", "Juan Mata", "CHE", "MF", 2800, 6, 9, 0.14),
        PlayerSeed("p_lampard11", "Frank Lampard", "CHE", "MF", 2500, 11, 9, 0.12),
        PlayerSeed("p_drogba", "Didier Drogba", "CHE", "FW", 1900, 5, 4, 0.11),
        PlayerSeed("p_suarez", "Luis Suarez", "LIV", "FW", 2600, 11, 6, 0.16),
        PlayerSeed("p_gerrard11", "Steven Gerrard", "LIV", "MF", 1500, 5, 5, 0.13),
        PlayerSeed("p_fellaini", "Marouane Fellaini", "EVE", "MF", 2700, 8, 3, 0.11),
        PlayerSeed("p_baines", "Leighton Baines", "EVE", "DF", 3300, 3, 11, 0.1),
    ],
)


SEASONS = {
    "PL_1995": S9596,
    "PL_2003": S0304,
    "PL_2011": S1112,
}
