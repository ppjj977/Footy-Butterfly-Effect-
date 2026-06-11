import type {
  Intervention,
  ProbabilityContext,
  SeasonData,
  TableDiffRow,
} from './types';

// ── Templated headline generator ──────────────────────────────────────────
// Outcomes only — positions, points, trophies, relegation. No claims about
// real individuals' conduct. Pure templates, no LLM. Each headline is a
// newspaper-style one-liner derived from the table diff.

function seasonLabel(season: SeasonData): string {
  const y = season.meta.year;
  const yy = String((y + 1) % 100).padStart(2, '0');
  return `${y}/${yy}`;
}

export function describeIntervention(
  season: SeasonData,
  iv: Intervention,
): string {
  if (iv.type === 'flip') {
    const fx = season.fixtures.find((f) => f.id === iv.fixtureId);
    if (!fx) return 'A result is changed';
    const h = team(season, fx.home);
    const a = team(season, fx.away);
    const verb =
      iv.outcome === 'H'
        ? `${h} beat ${a}`
        : iv.outcome === 'A'
          ? `${a} beat ${h}`
          : `${h} and ${a} draw`;
    return `What if ${verb} on matchday ${fx.matchday}?`;
  }
  if (iv.type === 'cancel_transfer') {
    const tr = season.transfers.find((t) => t.id === iv.transferId);
    if (!tr) return 'A transfer is cancelled';
    return `What if ${tr.playerName} never joined ${team(season, tr.toClub)}?`;
  }
  const pl = season.players.find((p) => p.id === iv.playerId);
  if (!pl) return 'A player is injured';
  return `What if ${pl.name} missed ${iv.months} months from ${monthName(iv.startMonth)}?`;
}

function team(season: SeasonData, id: string): string {
  return season.teams.find((t) => t.id === id)?.name ?? id;
}

function monthName(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${names[m - 1]} ${y}`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function generateHeadlines(
  season: SeasonData,
  diff: TableDiffRow[],
  iv: Intervention,
  prob: ProbabilityContext,
): string[] {
  const out: string[] = [];
  const byPos = [...diff].sort((a, b) => a.position - b.position);
  const realChamp = [...diff].sort((a, b) => a.realPosition - b.realPosition)[0];
  const newChamp = byPos[0];
  const label = seasonLabel(season);

  // 1. Champion change — the marquee headline.
  if (newChamp.teamId !== realChamp.teamId) {
    out.push(
      `${newChamp.name.toUpperCase()} CROWNED ${label} CHAMPIONS — ${realChamp.name} miss out`,
    );
    const odds = prob.titleOdds[newChamp.teamId] ?? 0;
    out.push(
      `In this timeline ${newChamp.short} lift the title; the engine gives it to them ${pct(odds)} of the time`,
    );
  } else {
    const odds = prob.titleOdds[realChamp.teamId] ?? 0;
    out.push(
      `${realChamp.name.toUpperCase()} HOLD ON — still ${label} champions in ${pct(odds)} of timelines`,
    );
  }

  // 2. Top-4 change.
  const top4Change = findZoneChange(diff, 4);
  if (top4Change) {
    out.push(
      `${top4Change.inName} gatecrash the top four at the expense of ${top4Change.outName}`,
    );
  }

  // 3. Relegation change.
  const n = season.teams.length;
  const relChange = findRelegationChange(diff, n);
  if (relChange) {
    out.push(
      `${relChange.savedName} survive; ${relChange.doomedName} go down instead`,
    );
  }

  // 4. Biggest mover note (fallback / colour).
  const mover = [...diff]
    .filter((d) => d.positionDelta !== 0)
    .sort((a, b) => Math.abs(b.positionDelta) - Math.abs(a.positionDelta))[0];
  if (mover && out.length < 3) {
    const dir = mover.positionDelta > 0 ? 'climb' : 'slide';
    out.push(
      `${mover.name} ${dir} ${Math.abs(mover.positionDelta)} place${
        Math.abs(mover.positionDelta) === 1 ? '' : 's'
      } to ${ordinal(mover.position)}`,
    );
  }

  // 5. Head-to-head irony for a flip that didn't move the title.
  if (out.length < 3 && iv.type === 'flip') {
    const fx = season.fixtures.find((f) => f.id === iv.fixtureId);
    if (fx) {
      out.push(
        `The ripple from one result fades — the ${label} table barely blinks`,
      );
    }
  }

  return out.slice(0, 3);
}

function findZoneChange(
  diff: TableDiffRow[],
  cutoff: number,
): { inName: string; outName: string } | null {
  const cameIn = diff.find(
    (d) => d.position <= cutoff && d.realPosition > cutoff,
  );
  const wentOut = diff.find(
    (d) => d.position > cutoff && d.realPosition <= cutoff,
  );
  if (cameIn && wentOut)
    return { inName: cameIn.name, outName: wentOut.name };
  return null;
}

function findRelegationChange(
  diff: TableDiffRow[],
  n: number,
): { savedName: string; doomedName: string } | null {
  const cutoff = n - 3; // positions > cutoff are relegated
  const saved = diff.find(
    (d) => d.position <= cutoff && d.realPosition > cutoff,
  );
  const doomed = diff.find(
    (d) => d.position > cutoff && d.realPosition <= cutoff,
  );
  if (saved && doomed)
    return { savedName: saved.name, doomedName: doomed.name };
  return null;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
