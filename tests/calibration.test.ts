import { describe, it, expect } from 'vitest';
import { mulberry32, deriveSeed } from '../src/engine/rng';
import { simulateWholeSeason } from '../src/engine/rewrite';
import { buildTable } from '../src/engine/table';
import { baselineEloMap, fixtureElo } from '../src/engine/elo';
import { simulateMatch, outcomeOf } from '../src/engine/poisson';
import { loadSeason, allSeasonKeys } from './helpers';
import type { Outcome, SeasonData, TeamId } from '../src/engine/types';

// ── Phase 1 gate ──────────────────────────────────────────────────────────
// For every season run N no-intervention simulations and report:
//   (a) the real champion's simulated title probability + rank,
//   (b) the multiclass Brier score of match-outcome predictions vs the
//       baseline ("real") results,
//   (c) the mean absolute points error per team.
// GATE: the real champion ranks top-2 by simulated title probability in
//       >= 80% of seasons.

const SIMS = 1000;

interface Report {
  key: string;
  name: string;
  champion: string;
  championTitleProb: number;
  championRank: number;
  brier: number;
  maePoints: number;
}

function fixtureOutcomeProbs(
  season: SeasonData,
  fixtureId: number,
  draws = 400,
): Record<Outcome, number> {
  const elo = baselineEloMap(season.teams);
  const fx = season.fixtures.find((f) => f.id === fixtureId)!;
  const he = fixtureElo(fx, 'home', elo);
  const ae = fixtureElo(fx, 'away', elo);
  const counts: Record<Outcome, number> = { H: 0, D: 0, A: 0 };
  const rng = mulberry32(deriveSeed(fixtureId + 1, 13));
  for (let i = 0; i < draws; i++) {
    const { hg, ag } = simulateMatch(he, ae, rng);
    counts[outcomeOf(hg, ag)]++;
  }
  return { H: counts.H / draws, D: counts.D / draws, A: counts.A / draws };
}

function backtest(season: SeasonData, key: string): Report {
  const baseline = buildTable(season);
  const realChampion = baseline[0].teamId;

  const titleCounts: Record<TeamId, number> = {};
  const pointsSum: Record<TeamId, number> = {};
  for (const t of season.teams) {
    titleCounts[t.id] = 0;
    pointsSum[t.id] = 0;
  }

  for (let s = 0; s < SIMS; s++) {
    const table = simulateWholeSeason(season, deriveSeed(season.meta.year, s + 1));
    titleCounts[table[0].teamId]++;
    for (const row of table) pointsSum[row.teamId] += row.points;
  }

  // Title probability + champion rank.
  const odds = season.teams
    .map((t) => ({ id: t.id, p: titleCounts[t.id] / SIMS }))
    .sort((a, b) => b.p - a.p);
  const championRank = odds.findIndex((o) => o.id === realChampion) + 1;

  // Mean absolute points error.
  const realPoints = new Map(baseline.map((r) => [r.teamId, r.points]));
  let mae = 0;
  for (const t of season.teams) {
    mae += Math.abs(pointsSum[t.id] / SIMS - (realPoints.get(t.id) ?? 0));
  }
  mae /= season.teams.length;

  // Brier score over all fixtures vs the baseline result.
  let brier = 0;
  for (const fx of season.fixtures) {
    const probs = fixtureOutcomeProbs(season, fx.id);
    const real = outcomeOf(fx.fhg, fx.fag);
    for (const o of ['H', 'D', 'A'] as Outcome[]) {
      const y = real === o ? 1 : 0;
      brier += (probs[o] - y) ** 2;
    }
  }
  brier /= season.fixtures.length;

  return {
    key,
    name: season.meta.name,
    champion: baseline[0].name,
    championTitleProb: odds.find((o) => o.id === realChampion)!.p,
    championRank,
    brier,
    maePoints: mae,
  };
}

describe('Phase 1 calibration backtest', () => {
  const keys = allSeasonKeys();
  const reports: Report[] = [];

  for (const key of keys) {
    it(`backtests ${key}`, () => {
      const season = loadSeason(key);
      const r = backtest(season, key);
      reports.push(r);

      // Per-season sanity: Brier beats an uninformative baseline (~0.667).
      expect(r.brier).toBeLessThan(0.66);
      // Points MAE should be within a sensible band for a high-variance sport.
      expect(r.maePoints).toBeLessThan(12);
    });
  }

  it('GATE: real champion ranks top-2 in >= 80% of seasons', () => {
    // Run any seasons not yet processed by the per-season tests.
    for (const key of keys) {
      if (!reports.find((r) => r.key === key)) {
        reports.push(backtest(loadSeason(key), key));
      }
    }

    const lines = [
      '',
      '─── Butterfly calibration report ───────────────────────────',
      'season            champion        P(title)  rank   Brier   MAE',
    ];
    for (const r of reports) {
      lines.push(
        `${r.name.padEnd(28)} ${r.champion.slice(0, 12).padEnd(12)} ` +
          `${(r.championTitleProb * 100).toFixed(1).padStart(5)}%  ` +
          `#${r.championRank}   ${r.brier.toFixed(3)}  ${r.maePoints.toFixed(2)}`,
      );
    }
    const topTwo = reports.filter((r) => r.championRank <= 2).length;
    const frac = topTwo / reports.length;
    lines.push('────────────────────────────────────────────────────────────');
    lines.push(
      `champion top-2 in ${topTwo}/${reports.length} seasons (${(frac * 100).toFixed(0)}%)`,
    );
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    expect(frac).toBeGreaterThanOrEqual(0.8);
  });
});
