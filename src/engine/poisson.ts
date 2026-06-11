import type { Outcome } from './types';
import type { Rng } from './rng';
import { HOME_ADVANTAGE } from './elo';

// ── Match model ───────────────────────────────────────────────────────────
// Expected goals per side are derived from the Elo difference plus home
// advantage, then goals are drawn from independent Poisson distributions with
// a small draw-inflation correction. Calibrated against PL 1995→2024 (see
// tests/calibration.test.ts).

// League baseline goals: a perfectly even match (after home advantage) yields
// roughly these expected goals. PL long-run avg ≈ 2.75 goals/game.
const BASE_HOME_XG = 1.45;
const BASE_AWAY_XG = 1.15;

// How strongly Elo difference moves expected goals. Each ELO_TO_XG Elo points
// of (effective) advantage multiplies a side's xG by ~e^(diff/ELO_SCALE).
const ELO_SCALE = 220;

// Draw inflation: low-scoring games draw more often than independent Poisson
// predicts. We nudge a sliver of probability mass toward the exact-draw
// outcomes via a rho term applied at the 0-0/1-1 cells.
const DRAW_RHO = 0.12;

export interface XgPair {
  home: number;
  away: number;
}

/** Expected goals for both sides from match-date Elo. */
export function expectedGoals(homeElo: number, awayElo: number): XgPair {
  const diff = homeElo + HOME_ADVANTAGE - awayElo;
  const homeXg = BASE_HOME_XG * Math.exp(diff / 2 / ELO_SCALE);
  const awayXg = BASE_AWAY_XG * Math.exp(-diff / 2 / ELO_SCALE);
  return {
    home: clampXg(homeXg),
    away: clampXg(awayXg),
  };
}

function clampXg(x: number): number {
  return Math.max(0.15, Math.min(5.5, x));
}

/** Draw a Poisson sample with mean lambda using the provided Rng. */
export function samplePoisson(lambda: number, rng: Rng): number {
  // Knuth's algorithm. lambda is bounded above (<=5.5) so this is cheap.
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/**
 * Simulate one match: returns goals for each side. Applies a draw-inflation
 * nudge so the outcome distribution matches reality better than naive Poisson.
 */
export function simulateMatch(
  homeElo: number,
  awayElo: number,
  rng: Rng,
): { hg: number; ag: number } {
  const xg = expectedGoals(homeElo, awayElo);
  let hg = samplePoisson(xg.home, rng);
  let ag = samplePoisson(xg.away, rng);

  // Draw inflation: if the match landed one goal apart in a low-scoring game,
  // occasionally pull it to a draw. This corrects independent Poisson's
  // tendency to under-produce draws.
  if (Math.abs(hg - ag) === 1 && hg + ag <= 3) {
    if (rng() < DRAW_RHO) {
      if (hg > ag) hg = ag;
      else ag = hg;
    }
  }
  return { hg, ag };
}

export function outcomeOf(hg: number, ag: number): Outcome {
  if (hg > ag) return 'H';
  if (hg < ag) return 'A';
  return 'D';
}
