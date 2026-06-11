import { describe, it, expect } from 'vitest';
import { mulberry32, deriveSeed, hashSeed } from '../src/engine/rng';
import { expectedGoals, simulateMatch, outcomeOf } from '../src/engine/poisson';
import { computeImpact, MAX_DELTA } from '../src/engine/impact';
import { expectedScore } from '../src/engine/elo';
import { runTimeline, buildTable } from '../src/engine';
import { loadSeason } from './helpers';
import { encodeIntervention, decodeIntervention } from '../src/lib/share';
import type { Intervention } from '../src/engine/types';

describe('rng', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces values in [0,1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('derives distinct child seeds', () => {
    const seeds = new Set(Array.from({ length: 100 }, (_, i) => deriveSeed(42, i)));
    expect(seeds.size).toBe(100);
  });

  it('hashSeed is stable', () => {
    expect(hashSeed('PL1995flip')).toBe(hashSeed('PL1995flip'));
  });
});

describe('elo + poisson', () => {
  it('expectedScore is symmetric around 0.5', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    expect(expectedScore(1700, 1500)).toBeGreaterThan(0.7);
  });

  it('stronger team has higher expected goals', () => {
    const strong = expectedGoals(1800, 1400);
    const weak = expectedGoals(1400, 1800);
    expect(strong.home).toBeGreaterThan(strong.away);
    expect(weak.away).toBeGreaterThan(weak.home);
  });

  it('home advantage tilts an even match toward the home side', () => {
    const xg = expectedGoals(1500, 1500);
    expect(xg.home).toBeGreaterThan(xg.away);
  });

  it('average goals per game are in a realistic PL range', () => {
    const rng = mulberry32(7);
    let goals = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const { hg, ag } = simulateMatch(1500, 1500, rng);
      goals += hg + ag;
    }
    const avg = goals / N;
    expect(avg).toBeGreaterThan(2.3);
    expect(avg).toBeLessThan(3.2);
  });

  it('outcomeOf classifies correctly', () => {
    expect(outcomeOf(2, 1)).toBe('H');
    expect(outcomeOf(1, 1)).toBe('D');
    expect(outcomeOf(0, 3)).toBe('A');
  });
});

describe('impact model', () => {
  it('an ever-present elite forward lands near MAX_DELTA', () => {
    const d = computeImpact({
      minutesShare: 0.95,
      valueShare: 0.22,
      gaShare: 1.0,
      position: 'FW',
      fallback: false,
    });
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThanOrEqual(MAX_DELTA);
  });

  it('goalkeepers get the 0.7 multiplier', () => {
    const inputs = {
      minutesShare: 1,
      valueShare: 0.1,
      gaShare: 0,
      fallback: false,
    } as const;
    const gk = computeImpact({ ...inputs, position: 'GK' });
    const df = computeImpact({ ...inputs, position: 'DF' });
    expect(gk).toBeCloseTo(df * 0.7, 4);
  });

  it('a fringe player has low impact', () => {
    const d = computeImpact({
      minutesShare: 0.1,
      valueShare: 0.01,
      gaShare: 0.02,
      position: 'DF',
      fallback: false,
    });
    expect(d).toBeLessThan(10);
  });
});

describe('share encoding', () => {
  const cases: Intervention[] = [
    { type: 'flip', fixtureId: 12, outcome: 'A' },
    { type: 'cancel_transfer', transferId: 't1112_aguero' },
    { type: 'injure', playerId: 'p_henry', months: 6, startMonth: '2003-11' },
  ];
  it('round-trips every intervention type', () => {
    for (const iv of cases) {
      const enc = encodeIntervention(iv);
      expect(decodeIntervention(enc)).toEqual(iv);
    }
  });
});

describe('timeline determinism', () => {
  const season = loadSeason('PL_1995');
  const iv: Intervention = { type: 'flip', fixtureId: 5, outcome: 'A' };

  it('is a pure function of (season, intervention, seed)', () => {
    const a = runTimeline(season, iv, 1234);
    const b = runTimeline(season, iv, 1234);
    expect(a.altTable).toEqual(b.altTable);
    expect(a.headlines).toEqual(b.headlines);
  });

  it('different seeds can give different timelines', () => {
    const a = runTimeline(season, iv, 1);
    const b = runTimeline(season, iv, 99999);
    // Tables are arrays; at least the result set should differ somewhere.
    const same = JSON.stringify(a.results) === JSON.stringify(b.results);
    expect(same).toBe(false);
  });

  it('leaves untouched teams’ fixtures at their real results (minimal rewrite)', () => {
    const t = runTimeline(season, iv, 7);
    const fx = season.fixtures.find((f) => f.id === iv.fixtureId)!;
    const touched = new Set([fx.home, fx.away]);
    // Count fixtures NOT involving a touched team — none should be re-simulated.
    const resimIds = new Set(t.touchedFixtureIds);
    for (const f of season.fixtures) {
      if (!touched.has(f.home) && !touched.has(f.away)) {
        expect(resimIds.has(f.id)).toBe(false);
      }
    }
  });
});

describe('baseline table integrity', () => {
  it('every season builds a 20-row table with 38 games each', () => {
    for (const key of ['PL_1995', 'PL_2003', 'PL_2011']) {
      const s = loadSeason(key);
      const table = buildTable(s);
      expect(table.length).toBe(20);
      for (const row of table) expect(row.played).toBe(38);
    }
  });
});
