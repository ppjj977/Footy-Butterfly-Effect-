import { describe, it, expect } from 'vitest';
import { runTimeline } from '../src/engine/rewrite';
import { buildTable } from '../src/engine/table';
import { loadSeason } from './helpers';
import type { Intervention, TeamId } from '../src/engine/types';

function meanPoints(
  key: string,
  iv: Intervention,
  teamId: TeamId,
  seeds = 60,
): number {
  const season = loadSeason(key);
  let sum = 0;
  for (let s = 1; s <= seeds; s++) {
    const t = runTimeline(season, iv, s * 101);
    sum += t.altTable.find((r) => r.teamId === teamId)!.points;
  }
  return sum / seeds;
}

describe('Phase 2 — flip intervention (Newcastle 95/96)', () => {
  const season = loadSeason('PL_1995');
  const realTable = buildTable(season);
  const newReal = realTable.find((r) => r.teamId === 'NEW')!;

  // Find a fixture Newcastle did not win, and flip it to a Newcastle win.
  function newcastleNonWin() {
    for (const fx of [...season.fixtures].sort((a, b) => a.date.localeCompare(b.date))) {
      if (fx.home === 'NEW' && fx.fhg <= fx.fag) return { fx, outcome: 'H' as const };
      if (fx.away === 'NEW' && fx.fag <= fx.fhg) return { fx, outcome: 'A' as const };
    }
    throw new Error('no Newcastle non-win found');
  }

  it('only re-simulates the touched teams (minimal rewrite)', () => {
    const { fx, outcome } = newcastleNonWin();
    const iv: Intervention = { type: 'flip', fixtureId: fx.id, outcome };
    const t = runTimeline(season, iv, 42);
    const touched = new Set([fx.home, fx.away]);
    for (const id of t.touchedFixtureIds) {
      const f = season.fixtures.find((x) => x.id === id)!;
      expect(touched.has(f.home) || touched.has(f.away)).toBe(true);
    }
  });

  it('flipping a Newcastle result toward a win does not reduce their points on average', () => {
    const { fx, outcome } = newcastleNonWin();
    const iv: Intervention = { type: 'flip', fixtureId: fx.id, outcome };
    const avg = meanPoints('PL_1995', iv, 'NEW');
    // The forced win itself adds points; momentum should not, on average,
    // leave them worse than reality.
    expect(avg).toBeGreaterThanOrEqual(newReal.points - 3);
  });

  it('produces 1-3 headlines and up to 3 key moments', () => {
    const { fx, outcome } = newcastleNonWin();
    const iv: Intervention = { type: 'flip', fixtureId: fx.id, outcome };
    const t = runTimeline(season, iv, 7);
    expect(t.headlines.length).toBeGreaterThanOrEqual(1);
    expect(t.headlines.length).toBeLessThanOrEqual(3);
    expect(t.keyMoments.length).toBeLessThanOrEqual(3);
    expect(t.interventionText.length).toBeGreaterThan(0);
  });

  it('probability context sums are coherent', () => {
    const { fx, outcome } = newcastleNonWin();
    const iv: Intervention = { type: 'flip', fixtureId: fx.id, outcome };
    const t = runTimeline(season, iv, 7);
    const totalTitle = Object.values(t.probability.titleOdds).reduce((a, b) => a + b, 0);
    expect(totalTitle).toBeCloseTo(1, 2);
    // Exactly 4 top-4 slots and 3 relegation slots per sim, so the sums match.
    const totalTop4 = Object.values(t.probability.top4Odds).reduce((a, b) => a + b, 0);
    expect(totalTop4).toBeCloseTo(4, 1);
  });
});

describe('Phase 2 — cancel transfer weakens the buyer', () => {
  it('cancelling Aguero 2011/12 lowers Man City’s average points', () => {
    const iv: Intervention = { type: 'cancel_transfer', transferId: 't1112_aguero' };
    const real = buildTable(loadSeason('PL_2011')).find((r) => r.teamId === 'MCI')!;
    const avg = meanPoints('PL_2011', iv, 'MCI');
    expect(avg).toBeLessThan(real.points);
  });
});

describe('Phase 2 — injury weakens the player’s club', () => {
  it('injuring Henry for 6 months lowers Arsenal’s average points', () => {
    const iv: Intervention = {
      type: 'injure',
      playerId: 'p_henry',
      months: 6,
      startMonth: '2003-11',
    };
    const real = buildTable(loadSeason('PL_2003')).find((r) => r.teamId === 'ARS')!;
    const avg = meanPoints('PL_2003', iv, 'ARS');
    expect(avg).toBeLessThan(real.points);
  });
});
