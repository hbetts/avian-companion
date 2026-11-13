/**
 * Names that follow the bird. Each cut-out is reduced to a small silhouette;
 * its outline is traced, and the name is laid along the straightest, flattest
 * stretch of back, belly or wing that has room for it, with the inked band of
 * the letters kept clear of the bird. Birds with no clean edge get a straight
 * tangent below them instead.
 */

export type Mask = { w: number; h: number; ink: Uint8Array };
export type Pt = { x: number; y: number };
export type LabelPath = { points: Pt[]; capH: number; fallback: boolean };

/** Downsample an image's alpha channel to a binary mask about `w` wide. */
export function maskFromImage(img: HTMLImageElement, w = 96): Mask | null {
  const ar = img.naturalWidth / img.naturalHeight || 1;
  const h = Math.max(8, Math.round(w / ar));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ink[i] = data[i * 4 + 3] > 60 ? 1 : 0;
  return { w, h, ink };
}

const at = (m: Mask, x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.ink[y * m.w + x]);

/** Moore-neighbour trace of the outer boundary of the largest blob, clockwise on screen. */
export function traceContour(m: Mask): Pt[] {
  // start at the topmost-leftmost ink pixel of the biggest connected component
  const seen = new Uint8Array(m.w * m.h);
  let bestStart: Pt | null = null, bestSize = 0;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.ink[y * m.w + x] || seen[y * m.w + x]) continue;
      let size = 0;
      const stack = [[x, y]];
      seen[y * m.w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        size++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (at(m, nx, ny) && !seen[ny * m.w + nx]) {
            seen[ny * m.w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestStart = { x, y };
      }
    }
  }
  if (!bestStart) return [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // clockwise on screen, starting east
  const pts: Pt[] = [];
  let cur = { ...bestStart };
  let dir = 0; // pretend we arrived heading east: the backtrack pixel (west) is outside the blob
  let firstDir = -1;
  const limit = m.w * m.h * 4;
  for (let n = 0; n < limit; n++) {
    let found = -1;
    // look from just past the backtrack direction, turning clockwise
    for (let k = 0; k < 8; k++) {
      const d = (dir + 5 + k) % 8;
      if (at(m, cur.x + dirs[d][0], cur.y + dirs[d][1])) {
        found = d;
        break;
      }
    }
    if (found < 0) {
      pts.push({ x: cur.x + 0.5, y: cur.y + 0.5 });
      break; // a lone pixel
    }
    // Jacob's stopping criterion: back at the start and about to repeat the first move
    if (n > 0 && cur.x === bestStart.x && cur.y === bestStart.y && found === firstDir) break;
    if (n === 0) firstDir = found;
    pts.push({ x: cur.x + 0.5, y: cur.y + 0.5 });
    cur = { x: cur.x + dirs[found][0], y: cur.y + dirs[found][1] };
    dir = found;
  }
  return pts;
}

/** Smooth and resample to roughly unit spacing. */
export function tidy(pts: Pt[], passes = 3): Pt[] {
  if (pts.length < 8) return pts;
  let p = pts;
  for (let k = 0; k < passes; k++) {
    p = p.map((_, i) => {
      const a = p[(i - 2 + p.length) % p.length], b = p[(i - 1 + p.length) % p.length], c = p[i], d = p[(i + 1) % p.length], e = p[(i + 2) % p.length];
      return { x: (a.x + b.x + c.x + d.x + e.x) / 5, y: (a.y + b.y + c.y + d.y + e.y) / 5 };
    });
  }
  const out: Pt[] = [p[0]];
  let acc = 0;
  for (let i = 1; i <= p.length; i++) {
    const a = p[i - 1], b = p[i % p.length];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    acc += seg;
    while (acc >= 1 && seg > 0) {
      const t = 1 - (acc - 1) / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      acc -= 1;
    }
  }
  return out;
}

function inkNear(m: Mask, p: Pt): boolean {
  return !!at(m, Math.floor(p.x), Math.floor(p.y));
}

/**
 * Lay a name of `len` mask units along the outline. `capH` is the letter
 * height in mask units; `gap` the air between bird and letters.
 */
export function placeLabel(m: Mask, len: number, capH: number, gap = 1.5): LabelPath {
  const contour = tidy(traceContour(m));
  const N = contour.length;
  const L = Math.ceil(len);
  type Cand = { pts: Pt[]; score: number };
  let best: Cand | null = null;

  if (N > L * 0.5 + 4) {
    // an edge may carry only part of the name; the rest runs on along its tangent
    for (const share of [1, 0.85, 0.7, 0.55]) {
      const Lw = Math.ceil(L * share);
      if (Lw + 4 > N) continue;
      for (let s = 0; s < N; s += 2) {
        let run: Pt[] = [];
        for (let i = 0; i <= Lw; i++) run.push(contour[(s + i) % N]);
        const a = run[0], b = run[run.length - 1];
        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        const r = chord / Lw;
        const S = Math.min(1, Math.max(0, (r - 0.85) / 0.12));
        if (S <= 0) continue;
        if (b.x < a.x) run = run.reverse(); // names read left to right
        // the steepest letter
        let theta = 0;
        for (let i = 2; i < run.length - 2; i++) {
          const dx = run[i + 2].x - run[i - 2].x, dy = run[i + 2].y - run[i - 2].y;
          const ang = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
          theta = Math.max(theta, ang > 90 ? 180 - ang : ang);
        }
        if (theta > 55) continue;
        const Lt = 1 - (0.5 * theta) / 55;
        for (const atEnd of share < 1 ? [true, false] : [true]) {
          // carry on along the tangent for the part of the name the edge cannot hold
          let full = run;
          if (Lw < L) {
            const extra = L - Lw;
            if (atEnd) {
              const e1 = run[run.length - 7] ?? run[0], e2 = run[run.length - 1];
              const d = Math.hypot(e2.x - e1.x, e2.y - e1.y) || 1;
              const u = { x: (e2.x - e1.x) / d, y: (e2.y - e1.y) / d };
              full = [...run, ...Array.from({ length: extra }, (_, i) => ({ x: e2.x + u.x * (i + 1), y: e2.y + u.y * (i + 1) }))];
            } else {
              const e1 = run[6] ?? run[run.length - 1], e2 = run[0];
              const d = Math.hypot(e2.x - e1.x, e2.y - e1.y) || 1;
              const u = { x: (e2.x - e1.x) / d, y: (e2.y - e1.y) / d };
              full = [...Array.from({ length: extra }, (_, i) => ({ x: e2.x + u.x * (extra - i), y: e2.y + u.y * (extra - i) })), ...run];
            }
          }
          // glyphs always rise to the left of travel; find which side of the bird is outside
          const t = { x: run[run.length - 1].x - run[0].x, y: run[run.length - 1].y - run[0].y };
          const tl = Math.hypot(t.x, t.y) || 1;
          const left = { x: t.y / tl, y: -t.x / tl };
          const mid = run[Math.floor(run.length / 2)];
          const glyphsOutward = !inkNear(m, { x: mid.x + left.x * 2.5, y: mid.y + left.y * 2.5 });
          const out = glyphsOutward ? left : { x: -left.x, y: -left.y };
          // the baseline sits `gap` outside the contour, or a cap-height further out when the glyphs rise back toward the bird
          const off = gap + (glyphsOutward ? 0 : capH);
          const pts = full.map((p) => ({ x: p.x + out.x * off, y: p.y + out.y * off }));
          // sweep the inked band of the letters against the bird and the edge of the picture
          let clear = true;
          for (let i = 0; i < pts.length && clear; i += 2) {
            for (const h of [0.3, capH * 0.5, capH]) {
              const q = { x: pts[i].x + left.x * h, y: pts[i].y + left.y * h };
              if (inkNear(m, q) || q.x < -capH || q.y < -capH || q.x > m.w + capH || q.y > m.h + capH) {
                clear = false;
                break;
              }
            }
          }
          if (!clear) continue;
          // prefer the back and the wing a little over the belly
          const upness = 1 - 0.15 * Math.max(0, out.y);
          const score = share * S * Lt * upness;
          if (!best || score > best.score) best = { pts, score };
        }
      }
    }
  }
  if (best) return { points: best.pts, capH, fallback: false };

  // fallback: a straight tangent under the lowest ink, centred
  let bottom = 0, left = m.w, right = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (m.ink[y * m.w + x]) {
        bottom = Math.max(bottom, y + 1);
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
  const cx = (left + right) / 2;
  const y = bottom + gap + capH;
  return { points: [{ x: cx - len / 2, y }, { x: cx + len / 2, y }], capH, fallback: true };
}

export function toPathD(pts: Pt[]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}
