"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { SpeciesSummary } from "@/lib/model";
import { artUrl } from "@/lib/species";
import { maskFromImage, placeLabel, toPathD, type Mask } from "@/lib/contour";
import { BirdArt } from "./BirdArt";

const COUNT_EXP = 0.4;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

type Pose = "perched" | "flight";

/** The name set along the bird, in the mask's coordinate space. */
export type Label = {
  d: string; // path for the baseline
  fs: number; // font size, mask units
  vw: number; // viewBox width (mask width)
  vh: number;
  fallback: boolean;
};

export type Tile = SpeciesSummary & {
  x: number; // left, px
  y: number; // top, px
  w: number; // image width
  h: number; // image height
  rot: number;
  pose: Pose;
  z: number;
  label: Label;
};

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ------------------------------------------------------------ silhouettes

const masks = new Map<string, Mask | null>();
const pending = new Set<string>();

/** Loads a silhouette for every bird shown; bumps a counter as each arrives so the layout can re-run. */
function useMasks(species: SpeciesSummary[], poses: Map<string, Pose>) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const s of species) {
      const pose = poses.get(s.slug);
      if (!pose || !s.art[pose]) continue;
      const key = `${s.slug}/${pose}`;
      if (masks.has(key) || pending.has(key)) continue;
      pending.add(key);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        masks.set(key, maskFromImage(img, 96));
        pending.delete(key);
        if (alive) setVersion((v) => v + 1);
      };
      img.onerror = () => {
        masks.set(key, null);
        pending.delete(key);
      };
      img.src = artUrl(s.slug, pose);
    }
    return () => {
      alive = false;
    };
  }, [species, poses]);
  return version;
}

let measureCtx: CanvasRenderingContext2D | null = null;
let handFamily = "";
const widths = new Map<string, number>();
/** Width of a name in the hand font at a given size, in px. */
function textWidth(text: string, fs: number): number {
  const key = `${fs.toFixed(1)}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (!measureCtx && typeof document !== "undefined") {
    measureCtx = document.createElement("canvas").getContext("2d");
    const probe = document.createElement("span");
    probe.className = "hand";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    handFamily = getComputedStyle(probe).fontFamily || "cursive";
    probe.remove();
  }
  let w = text.length * fs * 0.46;
  if (measureCtx) {
    measureCtx.font = `600 ${fs}px ${handFamily}`;
    const m = measureCtx.measureText(text).width;
    if (m > 0) w = m;
  }
  widths.set(key, w);
  return w;
}

const poseFor = (s: SpeciesSummary): Pose => {
  const r = hash(s.slug);
  return s.art.perched && (!s.art.flight || r < 0.7) ? "perched" : s.art.flight ? "flight" : "perched";
};

/**
 * The collage: the most-heard bird in the middle, the rest placed around it
 * along a spiral with air between them, like cut-outs laid out on a table.
 * Sizes follow the frame's count^0.4 rule. Each name runs along its bird's
 * outline, on the back, belly or wing, wherever the silhouette offers a
 * clean edge. The whole arrangement is then scaled to fit.
 */
export function layoutTiles(species: SpeciesSummary[], W: number, H: number, maskOf: (slug: string, pose: Pose) => Mask | null | undefined): Tile[] {
  if (!species.length || W < 50 || H < 50) return [];
  const sorted = [...species].sort((a, b) => b.n - a.n || a.rank - b.rank);
  const weights = sorted.map((s) => Math.pow(Math.max(1, s.n), COUNT_EXP));
  const sum = weights.reduce((a, b) => a + b, 0);
  const n = sorted.length;
  const budget = W * H * (n <= 2 ? 0.22 : n <= 6 ? 0.36 : n <= 12 ? 0.5 : 0.58);
  const maxSide = Math.min(W * 0.55, H * 0.6, 480);
  const GAP = 22; // clear air between any two birds (names included), before scaling

  // 1. sizes and names
  const sized = sorted.map((s, i) => {
    const pose = poseFor(s);
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
    const fs = Math.max(14, Math.min(24, w * 0.11));
    const text = s.com + (s.n > 1 ? `  ×${s.n}` : "");
    const len = textWidth(text, fs);
    // the label lives in mask units; k converts tile px to mask units
    const mask = maskOf(s.slug, pose);
    const vw = mask?.w ?? 96;
    const vh = mask?.h ?? Math.max(8, Math.round(96 / ar));
    const k = vw / w;
    const placed = mask
      ? placeLabel(mask, len * k, fs * 0.72 * k)
      : { points: [{ x: vw / 2 - (len * k) / 2, y: vh + 1.5 * k + fs * 0.72 * k }, { x: vw / 2 + (len * k) / 2, y: vh + 1.5 * k + fs * 0.72 * k }], capH: fs * 0.72 * k, fallback: true };
    // the outer extent of the bird plus its name, in tile px, relative to the tile's top-left
    let minX = 0, minY = 0, maxX = w, maxY = h;
    for (const p of placed.points) {
      minX = Math.min(minX, (p.x - placed.capH) / k);
      minY = Math.min(minY, (p.y - placed.capH) / k);
      maxX = Math.max(maxX, (p.x + placed.capH) / k);
      maxY = Math.max(maxY, (p.y + placed.capH) / k);
    }
    const label: Label = { d: toPathD(placed.points), fs: fs * k, vw, vh, fallback: placed.fallback };
    return { s, w, h, pose, rot: (hash(s.slug + "r") - 0.5) * 8, label, ext: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  });

  // 2. placement, biggest first, along a spiral that follows the container's shape
  const bodies: Box[] = [];
  const pos: { x: number; y: number }[] = [];
  const stretch = Math.max(0.55, Math.min(1.9, W / H));
  sized.forEach((t, i) => {
    // cut-outs are mostly air at the corners, so the body is a touch smaller than its extent, plus the gap
    const box = { w: t.ext.w * 0.94 + GAP, h: t.ext.h * 0.94 + GAP };
    const ecx = t.ext.x + t.ext.w / 2, ecy = t.ext.y + t.ext.h / 2; // extent centre, relative to tile origin
    if (i === 0) {
      pos.push({ x: -ecx, y: -ecy });
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
      if (!bodies.some((p) => overlaps(p, cand))) best = { x: cx - ecx, y: cy - ecy };
    }
    const p = best ?? { x: 0, y: 0 };
    pos.push(p);
    bodies.push({ x: p.x + ecx - box.w / 2, y: p.y + ecy - box.h / 2, ...box });
  });

  // 3. fit to the container
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  sized.forEach((t, i) => {
    minX = Math.min(minX, pos[i].x + t.ext.x);
    minY = Math.min(minY, pos[i].y + t.ext.y);
    maxX = Math.max(maxX, pos[i].x + t.ext.x + t.ext.w);
    maxY = Math.max(maxY, pos[i].y + t.ext.y + t.ext.h);
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
    label: t.label,
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
  const poses = useMemo(() => new Map(species.map((s) => [s.slug, poseFor(s)])), [species]);
  const maskVersion = useMasks(species, poses);

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

  const tiles = useMemo(
    () => layoutTiles(species, size.w, size.h, (slug, pose) => masks.get(`${slug}/${pose}`)),
    // maskVersion is the signal that another silhouette has arrived
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [species, size.w, size.h, maskVersion],
  );
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
            style={{ left: t.x, top: t.y, width: t.w, height: t.h, zIndex: selected === t.slug ? 101 : t.z, transformOrigin: "50% 60%", overflow: "visible" }}
            data-range={rangeKey}
          >
            <BirdArt species={t} pose={t.pose} layoutId={`art-${t.slug}`} eager />
            <svg
              className="absolute left-0 top-0 pointer-events-none"
              width={t.w}
              height={t.h}
              viewBox={`0 0 ${t.label.vw} ${t.label.vh}`}
              preserveAspectRatio="none"
              style={{ overflow: "visible" }}
              aria-hidden
            >
              <defs>
                <path id={`lbl-${t.slug}`} d={t.label.d} />
              </defs>
              <text className="hand" fontSize={t.label.fs} fill="var(--collage-ink)" style={{ fontWeight: 600 }}>
                <textPath href={`#lbl-${t.slug}`} startOffset="0">
                  {t.com}
                  {t.n > 1 && (
                    <tspan fill="var(--collage-ink-soft)" fontSize={t.label.fs * 0.62} style={{ fontFamily: "var(--font-sans)", fontWeight: 500 }}>
                      {"  "}×{t.n}
                    </tspan>
                  )}
                </textPath>
              </text>
            </svg>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
