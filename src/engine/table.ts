import type {
  Fixture,
  SeasonData,
  SimResult,
  TableRow,
  TableDiffRow,
  TeamId,
} from './types';
import { outcomeOf } from './poisson';

// ── League table construction ─────────────────────────────────────────────
// Builds a standings table from the season's real results, with an optional
// map of overrides (the re-simulated touched fixtures). PL tie-breaking:
// points, then goal difference, then goals scored, then name.

export function buildTable(
  season: SeasonData,
  overrides?: Map<number, SimResult>,
): TableRow[] {
  const rows = new Map<TeamId, TableRow>();
  for (const t of season.teams) {
    rows.set(t.id, {
      teamId: t.id,
      name: t.name,
      short: t.short,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      position: 0,
    });
  }

  for (const fx of season.fixtures) {
    const ov = overrides?.get(fx.id);
    const hg = ov ? ov.hg : fx.fhg;
    const ag = ov ? ov.ag : fx.fag;
    applyFixture(rows, fx, hg, ag);
  }

  return rank(Array.from(rows.values()));
}

function applyFixture(
  rows: Map<TeamId, TableRow>,
  fx: Fixture,
  hg: number,
  ag: number,
): void {
  const h = rows.get(fx.home);
  const a = rows.get(fx.away);
  if (!h || !a) return;
  h.played++;
  a.played++;
  h.gf += hg;
  h.ga += ag;
  a.gf += ag;
  a.ga += hg;
  const o = outcomeOf(hg, ag);
  if (o === 'H') {
    h.won++;
    a.lost++;
    h.points += 3;
  } else if (o === 'A') {
    a.won++;
    h.lost++;
    a.points += 3;
  } else {
    h.drawn++;
    a.drawn++;
    h.points++;
    a.points++;
  }
}

export function rank(rows: TableRow[]): TableRow[] {
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort(
    (x, y) =>
      y.points - x.points ||
      y.gd - x.gd ||
      y.gf - x.gf ||
      x.name.localeCompare(y.name),
  );
  rows.forEach((r, i) => (r.position = i + 1));
  return rows;
}

/** Join the real and alternate tables into a diff keyed by team. */
export function diffTables(real: TableRow[], alt: TableRow[]): TableDiffRow[] {
  const realByTeam = new Map(real.map((r) => [r.teamId, r]));
  return alt.map((r) => {
    const rr = realByTeam.get(r.teamId)!;
    return {
      ...r,
      realPosition: rr.position,
      realPoints: rr.points,
      positionDelta: rr.position - r.position,
      pointsDelta: r.points - rr.points,
    };
  });
}
