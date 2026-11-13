"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SpeciesSummary } from "@/lib/model";
import { BirdArt } from "./BirdArt";

const COUNT_EXP = 0.4;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export type Tile = SpeciesSummary & {
  x: number; // left, px
  y: number; // top, px
  w: number; // image width
  h: number; // image height
  label: number; // label strip height
  rot: number;
  pose: "perched" | "flight";
  z: number;
};

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * The collage: the most-heard bird in the middle, the rest placed around it
 * along a spiral, like paper cut-outs laid on a table. Sizes follow the
 * frame's count^0.4 rule; the whole arrangement is then scaled to fit.
 */
export function layoutTiles(species: SpeciesSummary[], W: number, H: number): Tile[] {
  if (!species.length || W < 50 || H < 50) return [];
  const sorted = [...species].sort((a, b) => b.n - a.n || a.rank - b.rank);
  const weights = sorted.map((s) => Math.pow(Math.max(1, s.n), COUNT_EXP));
  const sum = weights.reduce((a, b) => a + b, 0);
  const budget = W * H * (sorted.length <= 2 ? 0.3 : sorted.length <= 6 ? 0.5 : 0.78);
  const maxSide = Math.min(W * 0.6, H * 0.62, 520);

  // 1. sizes
  const sized = sorted.map((s, i) => {
    const r = hash(s.slug);
    const pose: "perched" | "flight" = s.art.perched && (!s.art.flight || r < 0.7) ? "perched" : s.art.flight ? "flight" : "perched";
    const dims = s.art[pose] ?? s.art.perched ?? s.art.flight;
    const ar = dims ? dims.w / dims.h : 1;
    const area = (budget * weights[i]) / sum;
    let w = Math.sqrt(area * ar);
    let h = Math.sqrt(area / ar);
    const big = Math.max(w, h);
    if (big > maxSide) {
      w *= maxSide / big;
      h *= maxSide / big;
    }
    const label = Math.max(16, Math.min(30, w * 0.16));
    return { s, w, h, label, pose, rot: (hash(s.slug + "r") - 0.5) * 9 };
  });

  // 2. placement, biggest first, along a spiral that is a little wider than tall
  const placed: Box[] = [];
  const pos: { x: number; y: number }[] = [];
  const stretch = Math.max(1, Math.min(1.9, W / H));
  sized.forEach((t, i) => {
    const full = { w: t.w, h: t.h + t.label };
    const pad = 0.3; // cut-outs are mostly air at the corners, so let the boxes overlap like paper on a table
    const box = { w: full.w * (1 - pad), h: full.h * (1 - pad) };
    if (i === 0) {
      pos.push({ x: -full.w / 2, y: -full.h / 2 });
      placed.push({ x: -box.w / 2, y: -box.h / 2, ...box });
      return;
    }
    const phase = hash(t.s.slug + "p") * Math.PI * 2;
    let best: { x: number; y: number } | null = null;
    for (let theta = 0.2; theta < 90 && !best; theta += 0.14) {
      const r = 5.5 * theta;
      const cx = Math.cos(theta + phase) * r * stretch;
      const cy = Math.sin(theta + phase) * r;
      const cand = { x: cx - box.w / 2, y: cy - box.h / 2, ...box };
      if (!placed.some((p) => overlaps(p, cand))) best = { x: cx - full.w / 2, y: cy - full.h / 2 };
    }
    const p = best ?? { x: 0, y: 0 };
    pos.push(p);
    placed.push({ x: p.x + (full.w - box.w) / 2, y: p.y + (full.h - box.h) / 2, ...box });
  });

  // 3. fit to the container
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  sized.forEach((t, i) => {
    minX = Math.min(minX, pos[i].x);
    minY = Math.min(minY, pos[i].y);
    maxX = Math.max(maxX, pos[i].x + t.w);
    maxY = Math.max(maxY, pos[i].y + t.h + t.label);
  });
  const bw = maxX - minX, bh = maxY - minY;
  const scale = Math.min((W - 16) / bw, (H - 16) / bh, sorted.length <= 3 ? 1 : 1.4);
  const ox = (W - bw * scale) / 2 - minX * scale;
  const oy = (H - bh * scale) / 2 - minY * scale;

  return sized.map((t, i) => ({
    ...t.s,
    x: pos[i].x * scale + ox,
    y: pos[i].y * scale + oy,
    w: t.w * scale,
    h: t.h * scale,
    label: t.label * scale,
    rot: t.rot,
    pose: t.pose,
    z: sized.length - i, // smaller birds sit on top of bigger ones
  }));
}

export function Collage({
  species,
  rangeKey,
  onSelect,
  selected,
}: {
  species: SpeciesSummary[];
  rangeKey: string;
  onSelect: (slug: string) => void;
  selected: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reduced = useReducedMotion();

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = Math.max(380, window.innerHeight - el.getBoundingClientRect().top - 20);
    setSize((s) => (Math.abs(s.w - w) > 1 || Math.abs(s.h - h) > 1 ? { w, h } : s));
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const tiles = useMemo(() => layoutTiles(species, size.w, size.h), [species, size.w, size.h]);
  const spring = reduced ? { duration: 0.2 } : { type: "spring" as const, bounce: 0, duration: 0.6 };

  return (
    <div ref={ref} className="paper-sheet relative w-full overflow-hidden" style={{ height: size.h || 380 }}>
      <AnimatePresence initial={false}>
        {tiles.map((t, i) => (
          <motion.button
            key={t.slug}
            layout
            type="button"
            aria-label={`${t.com}, heard ${t.n} ${t.n === 1 ? "time" : "times"}`}
            onClick={() => onSelect(t.slug)}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: t.rot - 12 }}
            animate={{ opacity: 1, scale: 1, rotate: t.rot }}
            exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, scale: 0.4, transition: { type: "spring", bounce: 0, duration: 0.35 } }}
            transition={reduced ? { duration: 0.2 } : { layout: spring, type: "spring", bounce: 0.24, duration: 0.7, delay: Math.min(0.45, i * 0.025) }}
            whileHover={reduced ? undefined : { scale: 1.04, zIndex: 100 }}
            whileTap={{ scale: 0.96 }}
            className="absolute flex flex-col items-center justify-end select-none rounded-2xl"
            style={{ left: t.x, top: t.y, width: t.w, height: t.h + t.label, zIndex: selected === t.slug ? 101 : t.z, transformOrigin: "50% 60%" }}
            data-range={rangeKey}
          >
            <div className="relative w-full" style={{ height: t.h }}>
              <BirdArt species={t} pose={t.pose} layoutId={`art-${t.slug}`} eager />
            </div>
            <div className="hand leading-none text-center whitespace-nowrap" style={{ fontSize: Math.max(13, Math.min(26, t.w * 0.15)), color: "var(--collage-ink)", height: t.label, marginTop: -2 }}>
              {t.com}
              {t.n > 1 && (
                <span className="font-sans align-middle ml-1" style={{ fontSize: Math.max(10, Math.min(13, t.w * 0.07)), color: "var(--collage-ink-soft)", letterSpacing: "0.02em" }}>
                  ×{t.n}
                </span>
              )}
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
