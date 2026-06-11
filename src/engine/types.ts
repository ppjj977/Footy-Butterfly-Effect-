// ── Butterfly engine types ───────────────────────────────────────────────
// These types describe the static season data (produced by the pipeline) and
// the runtime structures the engine produces. The engine is pure: no DOM, no
// fetch, no Date.now — everything is a function of (seasonData, intervention,
// seed).

export type TeamId = string;

export interface Team {
  id: TeamId;
  name: string;
  short: string;
  /** Baseline (season-average) Elo used when no match-date rating exists. */
  elo: number;
}

export interface Fixture {
  id: number;
  matchday: number;
  /** ISO date, used to look up match-date Elo and to order interventions. */
  date: string;
  home: TeamId;
  away: TeamId;
  /** Real (historical) full-time goals. The baseline timeline. */
  fhg: number;
  fag: number;
  /**
   * Optional match-date Elo snapshots (ClubElo). When absent the engine falls
   * back to Team.elo. Stored per fixture to keep lookups O(1).
   */
  homeElo?: number;
  awayElo?: number;
}

export interface PlayerRecord {
  id: string;
  name: string;
  club: TeamId;
  position: 'GK' | 'DF' | 'MF' | 'FW';
  minutes: number;
  goals: number;
  assists: number;
  /** Share of squad market value (0..1). May be undefined pre-2004. */
  valueShare?: number;
  /** Precomputed Elo impact delta (pipeline + engine agree on the formula). */
  impact: number;
}

export interface TransferRecord {
  id: string;
  playerId: string;
  playerName: string;
  fromClub: TeamId | null; // null = outside the league
  toClub: TeamId;
  /** Fee in £m (0 = free / loan / unknown). */
  fee: number;
  /** ISO date the move takes effect; January moves only affect later fixtures. */
  date: string;
  /** Elo impact the player brought to the buying club this season. */
  impact: number;
}

export interface SeasonData {
  meta: {
    league: string;
    year: number; // start year, e.g. 1995 for 1995/96
    name: string;
    teams: number;
    /** 'curated' | 'pipeline' | 'computed-elo' — provenance for the UI footer. */
    dataSource: string;
    /** True when valuations were unavailable (pre-2004): minutes+G/A only. */
    impactFallback: boolean;
  };
  teams: Team[];
  fixtures: Fixture[];
  transfers: TransferRecord[];
  players: PlayerRecord[];
}

// ── Interventions ─────────────────────────────────────────────────────────

export type Outcome = 'H' | 'D' | 'A';

export interface FlipIntervention {
  type: 'flip';
  fixtureId: number;
  /** The forced outcome from the home team's perspective. */
  outcome: Outcome;
}

export interface CancelTransferIntervention {
  type: 'cancel_transfer';
  transferId: string;
}

export interface InjureIntervention {
  type: 'injure';
  playerId: string;
  /** Window length in months. */
  months: 3 | 6;
  /** Start month as ISO 'YYYY-MM'. */
  startMonth: string;
}

export type Intervention =
  | FlipIntervention
  | CancelTransferIntervention
  | InjureIntervention;

// ── Timeline output ───────────────────────────────────────────────────────

export interface SimResult {
  fixtureId: number;
  hg: number;
  ag: number;
  outcome: Outcome;
}

export interface TableRow {
  teamId: TeamId;
  name: string;
  short: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  position: number;
}

export interface TableDiffRow extends TableRow {
  realPosition: number;
  realPoints: number;
  positionDelta: number; // realPosition - position (positive = moved up)
  pointsDelta: number;
}

export interface KeyMoment {
  fixtureId: number;
  matchday: number;
  date: string;
  home: string;
  away: string;
  realScore: string;
  newScore: string;
  /** Sum of absolute points swing across both teams caused by this fixture. */
  swing: number;
  blurb: string;
}

export interface ProbabilityContext {
  /** teamId -> P(wins title) across the background sims. */
  titleOdds: Record<TeamId, number>;
  /** teamId -> P(top 4). */
  top4Odds: Record<TeamId, number>;
  /** teamId -> P(relegated, bottom 3). */
  relegationOdds: Record<TeamId, number>;
  sims: number;
}

export interface Timeline {
  seed: number;
  intervention: Intervention;
  /** The real (historical) final table. */
  realTable: TableRow[];
  /** The alternate final table for the canonical seed. */
  altTable: TableRow[];
  diff: TableDiffRow[];
  /** Fixtures that were re-simulated (the "touched" set). */
  touchedFixtureIds: number[];
  results: SimResult[];
  keyMoments: KeyMoment[];
  headlines: string[];
  probability: ProbabilityContext;
  /** Human-readable description of the intervention. */
  interventionText: string;
}
