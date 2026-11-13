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

export type Label = { x: number; y: number; w: number; h: number; fs: number; rot: number; align: "center" | "left" | "right" };

export type Tile = SpeciesSummary & {
  x: number; // left, px
  y: number; // top, px
  w: number; // image width
  h: number; // image height
  rot: number;
  pose: "perched" | "flight";
  z: number;
  label: Label; // the name, placed wherever there is air around the bird
};

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const shrink = (b: Box, f: number): Box => ({ x: b.x + (b.w * (1 - f)) / 2, y: b.y + (b.h * (1 - f)) / 2, w: b.w * f, h: b.h * f });

/**
 * The collage: the most-heard bird in the middle, the rest placed around it
 * along a spiral with air between them, like cut-outs laid out on a table.
 * Sizes follow the frame's count^0.4 rule. Names are set afterwards in
 * whatever gap suits each bird: under it, above, beside, or tilted along a
 * wing. The whole arrangement is then scaled to fit.
 */
export function layoutTiles(species: SpeciesSummary[], W: number, H: number): Tile[] {
  if (!species.length || W < 50 || H < 50) return [];
  const sorted = [...species].sort((a, b) => b.n - a.n || a.rank - b.rank);
  const weights = sorted.map((s) => Math.pow(Math.max(1, s.n), COUNT_EXP));
  const sum = weights.reduce((a, b) => a + b, 0);
  const n = sorted.length;
  const budget = W * H * (n <= 2 ? 0.22 : n <= 6 ? 0.36 : n <= 12 ? 0.5 : 0.58);
  const maxSide = Math.min(W * 0.55, H * 0.6, 480);
  const GAP = 26; // clear air between any two birds, before scaling

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
    return { s, w, h, pose, rot: (hash(s.slug + "r") - 0.5) * 8 };
  });

  // 2. placement, biggest first, along a spiral that is a little wider than tall
  const bodies: Box[] = []; // what later birds must keep clear of
  const pos: { x: number; y: number }[] = [];
  const stretch = Math.max(0.55, Math.min(1.9, W / H)); // portrait screens get a taller spiral
  sized.forEach((t, i) => {
    // cut-outs are mostly air at the corners, so the body box is a touch smaller than the image, plus the gap
    const box = { w: t.w * 0.94 + GAP, h: t.h * 0.94 + GAP };
    if (i === 0) {
      pos.push({ x: -t.w / 2, y: -t.h / 2 });
      bodies.push({ x: -box.w / 2, y: -box.h / 2, ...box });
      return;
    }
    const phase = hash(t.s.slug + "p") * Math.PI * 2;
    let best: { x: number; y: number } | null = null;
    for (let theta = 0.2; theta < 90 && !best; theta += 0.12) {
      const r = 5 * theta;
      const cx = Math.cos(theta + phase) * r * stretch;
      const cy = Math.sin(theta + phase) * r;
      const cand = { x: cx - box.w / 2, y: cy - box.h / 2, ...box };
      if (!bodies.some((p) => overlaps(p, cand))) best = { x: cx - t.w / 2, y: cy - t.h / 2 };
    }
    const p = best ?? { x: 0, y: 0 };
    pos.push(p);
    bodies.push({ x: p.x + t.w / 2 - box.w / 2, y: p.y + t.h / 2 - box.h / 2, ...box });
  });

  // 3. names: try a few spots around each bird and keep the first that is clear of every bird and name
  const taken: Box[] = sized.map((t, i) => shrink({ x: pos[i].x, y: pos[i].y, w: t.w, h: t.h }, 0.96));
  const labels: Label[] = [];
  sized.forEach((t, i) => {
    const fs = Math.max(16, Math.min(28, t.w * 0.14));
    const text = t.s.com + (t.s.n > 1 ? `  x${t.s.n}` : "");
    const lw = text.length * fs * 0.46;
    const lh = fs * 1.15;
    const { x, y, w, h } = { x: pos[i].x, y: pos[i].y, w: t.w, h: t.h };
    const cx = x + w / 2;
    const r = hash(t.s.slug + "l");
    const tilt = (hash(t.s.slug + "t") - 0.5) * 10;
    // each option: centre of the name, its angle and which side anchors the text
    const options: { x: number; y: number; rot: number; align: Label["align"] }[] = [
      { x: cx + (r - 0.5) * w * 0.4, y: y + h + lh * 0.55, rot: tilt, align: "center" },
      { x: cx + (r - 0.5) * w * 0.4, y: y - lh * 0.6, rot: tilt, align: "center" },
      { x: x + w + lw / 2 + 4, y: y + h * (0.3 + r * 0.4), rot: tilt * 0.6, align: "left" },
      { x: x - lw / 2 - 4, y: y + h * (0.3 + r * 0.4), rot: tilt * 0.6, align: "right" },
      { x: x + w * 0.85 + lw / 2, y: y - lh * 0.3, rot: -14 - r * 8, align: "left" },
      { x: x + w * 0.15 - lw / 2, y: y + h + lh * 0.3, rot: -14 - r * 8, align: "right" },
      { x: cx, y: y + h + lh * 1.6, rot: tilt, align: "center" },
    ];
    if (t.pose === "flight") options.unshift(options.splice(4, 1)[0]); // a name along the wing suits a flying bird
    let pick = options[options.length - 1];
    for (const o of options) {
      const box = { x: o.x - lw / 2, y: o.y - lh / 2, w: lw, h: lh };
      if (!taken.some((b) => overlaps(b, box))) {
        pick = o;
        break;
      }
    }
    const box = { x: pick.x - lw / 2, y: pick.y - lh / 2, w: lw, h: lh };
    taken.push(box);
    labels.push({ ...box, fs, rot: pick.rot, align: pick.align });
  });

  // 4. fit to the container
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  sized.forEach((t, i) => {
    minX = Math.min(minX, pos[i].x, labels[i].x);
    minY = Math.min(minY, pos[i].y, labels[i].y);
    maxX = Math.max(maxX, pos[i].x + t.w, labels[i].x + labels[i].w);
    maxY = Math.max(maxY, pos[i].y + t.h, labels[i].y + labels[i].h);
  });
  const bw = maxX - minX, bh = maxY - minY;
  const scale = Math.min((W - 24) / bw, (H - 24) / bh, n <= 3 ? 1 : 1.35);
  const ox = (W - bw * scale) / 2 - minX * scale;
  const oy = (H - bh * scale) / 2 - minY * scale;

  return sized.map((t, i) => ({
    ...t.s,
    x: pos[i].x * scale + ox,
    y: pos[i].y * scale + oy,
    w: t.w * scale,
    h: t.h * scale,
    rot: t.rot,
    pose: t.pose,
    z: n - i, // smaller birds sit on top of bigger ones
    label: {
      x: labels[i].x * scale + ox,
      y: labels[i].y * scale + oy,
      w: labels[i].w * scale,
      h: labels[i].h * scale,
      fs: labels[i].fs * scale,
      rot: labels[i].rot,
      align: labels[i].align,
    },
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
            className="absolute select-none rounded-2xl"
            style={{ left: t.x, top: t.y, width: t.w, height: t.h, zIndex: selected === t.slug ? 101 : t.z, transformOrigin: "50% 60%" }}
            data-range={rangeKey}
          >
            <BirdArt species={t} pose={t.pose} layoutId={`art-${t.slug}`} eager />
          </motion.button>
        ))}
        {tiles.map((t, i) => (
          <motion.div
            key={`${t.slug}-name`}
            layout
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: t.label.rot }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={reduced ? { duration: 0.2 } : { layout: spring, duration: 0.4, delay: Math.min(0.6, 0.2 + i * 0.025) }}
            className="hand absolute pointer-events-none leading-none whitespace-nowrap flex items-center"
            style={{
              left: t.label.x,
              top: t.label.y,
              width: t.label.w,
              height: t.label.h,
              fontSize: t.label.fs,
              color: "var(--collage-ink)",
              justifyContent: t.label.align === "left" ? "flex-start" : t.label.align === "right" ? "flex-end" : "center",
              transformOrigin: t.label.align === "left" ? "0% 50%" : t.label.align === "right" ? "100% 50%" : "50% 50%",
              zIndex: 200,
            }}
          >
            {t.com}
            {t.n > 1 && (
              <span className="font-sans ml-1.5" style={{ fontSize: Math.max(10, t.label.fs * 0.48), color: "var(--collage-ink-soft)", letterSpacing: "0.02em" }}>
                ×{t.n}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
