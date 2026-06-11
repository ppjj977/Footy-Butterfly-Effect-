import type { Fixture, Team, TeamId } from './types';

// ── Elo helpers ───────────────────────────────────────────────────────────
// Strength is expressed in Elo points. Home advantage is added to the home
// side's effective rating before computing the expected-goals split.

export const HOME_ADVANTAGE = 65; // Elo points; calibrated for the PL.

/** Logistic expected score (win-probability proxy) for A vs B. */
export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

/** Look up a team's match-date Elo for a fixture, falling back to baseline. */
export function fixtureElo(
  fx: Fixture,
  side: 'home' | 'away',
  teamElo: Map<TeamId, number>,
): number {
  const snap = side === 'home' ? fx.homeElo : fx.awayElo;
  if (snap != null) return snap;
  const id = side === 'home' ? fx.home : fx.away;
  return teamElo.get(id) ?? 1500;
}

export function baselineEloMap(teams: Team[]): Map<TeamId, number> {
  return new Map(teams.map((t) => [t.id, t.elo]));
}
