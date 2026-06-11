import { describe, it, expect } from 'vitest';
import { loadSeason } from './helpers';
import {
  createRun,
  playWeek,
  weekPreview,
  sortedTable,
  gradeSeason,
  baseStyle,
  type Decision,
  type RunState,
} from '../src/titlerun/campaign';
import { STYLES, styleEdge, resolveMatch, type Style } from '../src/titlerun/tactics';

function counter(s: Style): Style {
  return STYLES.find((x) => styleEdge(x, s) === 1)!;
}

function runSeason(
  clubId: string,
  seed: number,
  choose: (state: RunState) => Decision,
): RunState {
  let state = createRun(loadSeason('PL_2023'), clubId, seed);
  while (!state.finished) {
    if (!weekPreview(state)) break;
    state = playWeek(state, choose(state));
  }
  return state;
}

const SMART = (state: RunState): Decision => {
  const pre = weekPreview(state)!;
  // Counter the scouted style; ease off when knackered, push when fresh.
  return {
    style: counter(pre.scoutedStyle),
    intensity: state.stamina > 60 ? 'high' : state.stamina < 40 ? 'low' : 'normal',
    rotate: state.stamina < 45,
  };
};

const RANDOM = (() => {
  let n = 1;
  return (state: RunState): Decision => {
    const r = (k: number) => Math.floor(((n++ * 9301 + 49297) % 233280) / 233280 * k);
    void state;
    return {
      style: STYLES[r(5)],
      intensity: (['low', 'normal', 'high'] as const)[r(3)],
      rotate: r(2) === 0,
    };
  };
})();

describe('tactics core', () => {
  it('counter pentagon: every style beats exactly two and loses to two', () => {
    for (const a of STYLES) {
      const wins = STYLES.filter((b) => styleEdge(a, b) === 1);
      const losses = STYLES.filter((b) => styleEdge(a, b) === -1);
      expect(wins.length).toBe(2);
      expect(losses.length).toBe(2);
      expect(styleEdge(a, a)).toBe(0);
    }
  });

  it('winning the tactical matchup raises expected goals', () => {
    const rng = () => 0.5; // no jitter
    const beats = counter('possession');
    const won = resolveMatch(
      { elo: 1500, plan: { style: beats, intensity: 'normal' }, isHome: false },
      { elo: 1500, plan: { style: 'possession', intensity: 'normal' }, isHome: false },
      rng,
    );
    expect(won.homeStrength - won.awayStrength).toBeGreaterThan(0);
  });
});

describe('campaign determinism', () => {
  it('same seed + same decisions => identical final table', () => {
    const a = runSeason('WHU', 777, SMART);
    const b = runSeason('WHU', 777, SMART);
    expect(sortedTable(a).map((l) => [l.teamId, l.pts])).toEqual(
      sortedTable(b).map((l) => [l.teamId, l.pts]),
    );
  });

  it('plays a full 38-week season', () => {
    const s = runSeason('WHU', 5, SMART);
    expect(s.finished).toBe(true);
    expect(s.history.length).toBe(38);
    for (const line of Object.values(s.table)) expect(line.p).toBe(38);
  });
});

describe('skill beats luck (the whole point)', () => {
  it('a tactical strategy finishes higher than random across many runs', () => {
    const seeds = Array.from({ length: 24 }, (_, i) => i * 1000 + 13);
    let smartSum = 0;
    let randomSum = 0;
    for (const seed of seeds) {
      smartSum += gradeSeason(runSeason('WHU', seed, SMART)).position;
      randomSum += gradeSeason(runSeason('WHU', seed, RANDOM)).position;
    }
    const smartAvg = smartSum / seeds.length;
    const randomAvg = randomSum / seeds.length;
    // Skill should be worth multiple league places on average.
    expect(smartAvg).toBeLessThan(randomAvg - 1.5);
  });
});

describe('resource pressure', () => {
  it('high intensity every week drains stamina into the penalty zone', () => {
    const s = runSeason('WHU', 42, () => ({ style: 'press', intensity: 'high', rotate: false }));
    const lowStaminaWeeks = s.history.filter((w) => w.staminaAfter < 40).length;
    expect(lowStaminaWeeks).toBeGreaterThan(0);
  });

  it('objective + grading resolve sensibly', () => {
    const s = runSeason('MCI', 9, SMART);
    const g = gradeSeason(s);
    expect(g.position).toBeGreaterThanOrEqual(1);
    expect(['triumph', 'met', 'missed']).toContain(g.outcome);
    expect(baseStyle('MCI')).toBeDefined();
  });
});
