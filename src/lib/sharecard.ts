import type { SeasonData, Timeline } from '../engine/types';

// Renders the shareable "what-if" card to a canvas (1080×1080, share-friendly).
// Pure 2D canvas, no external assets beyond system fonts.

const W = 1080;
const H = 1080;

export function drawShareCard(
  canvas: HTMLCanvasElement,
  season: SeasonData,
  timeline: Timeline,
  shareUrl: string,
): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Background gradient.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1a14');
  g.addColorStop(1, '#06100c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Top brand row.
  ctx.fillStyle = '#f5d142';
  ctx.font = '700 44px Inter, sans-serif';
  ctx.fillText('🦋 BUTTERFLY', 64, 110);
  ctx.fillStyle = '#7c8b82';
  ctx.font = '600 28px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(season.meta.name, W - 64, 110);
  ctx.textAlign = 'left';

  // SIMULATION tag.
  roundRect(ctx, W - 64 - 220, 140, 220, 46, 10);
  ctx.fillStyle = '#ffffff18';
  ctx.fill();
  ctx.fillStyle = '#ff6b6b';
  ctx.font = '800 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SIMULATION', W - 64 - 110, 172);
  ctx.textAlign = 'left';

  // Intervention sentence.
  ctx.fillStyle = '#aeb9b2';
  ctx.font = '600 30px Inter, sans-serif';
  wrapText(ctx, timeline.interventionText, 64, 240, W - 128, 40);

  // Headline (big).
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 60px Inter, sans-serif';
  const headlineBottom = wrapText(
    ctx,
    timeline.headlines[0] ?? 'History rewrites itself',
    64,
    340,
    W - 128,
    66,
  );

  // Mini table diff: show the biggest movers (up to 8 rows).
  const movers = [...timeline.diff]
    .filter((d) => d.positionDelta !== 0 || d.position <= 5)
    .sort((a, b) => a.position - b.position)
    .slice(0, 8);
  let y = Math.max(headlineBottom + 40, 540);
  ctx.font = '700 30px Inter, sans-serif';
  ctx.fillStyle = '#7c8b82';
  ctx.fillText('ALTERNATE TABLE', 64, y);
  y += 24;
  for (const r of movers) {
    y += 52;
    ctx.fillStyle = r.position === 1 ? '#f5d142' : '#0f1f18';
    roundRect(ctx, 64, y - 38, W - 128, 46, 8);
    ctx.fill();
    ctx.fillStyle = r.position === 1 ? '#0a1410' : '#e8efe9';
    ctx.font = '700 30px Inter, sans-serif';
    ctx.fillText(`${r.position}`, 84, y - 6);
    ctx.fillText(r.name, 150, y - 6);
    // points + delta
    ctx.textAlign = 'right';
    ctx.fillText(`${r.points}`, W - 96, y - 6);
    if (r.positionDelta !== 0) {
      ctx.fillStyle =
        r.positionDelta > 0 ? '#34d399' : r.position === 1 ? '#0a1410' : '#f87171';
      ctx.font = '700 26px Inter, sans-serif';
      ctx.fillText(
        `${r.positionDelta > 0 ? '▲' : '▼'}${Math.abs(r.positionDelta)}`,
        W - 150,
        y - 6,
      );
    }
    ctx.textAlign = 'left';
  }

  // Footer: seed URL + disclaimer.
  ctx.fillStyle = '#5f6d64';
  ctx.font = '500 22px Inter, sans-serif';
  ctx.fillText(truncate(shareUrl, 70), 64, H - 70);
  ctx.fillText(
    'Independent fan project · no affiliation · stats from public sources',
    64,
    H - 38,
  );
}

export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

// ── helpers ──
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): number {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
  return cy;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
