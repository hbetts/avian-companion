"use client";
import { useId, useState } from "react";
import type { Rhythm as RhythmData } from "@/lib/model";

/** Light smoothing across neighbouring buckets so the curve reads as a rhythm, not a histogram. */
function smooth(v: number[], k = [0.06, 0.24, 0.4, 0.24, 0.06]): number[] {
  const half = (k.length - 1) / 2;
  return v.map((_, i) => k.reduce((s, w, j) => s + w * (v[i + j - half] ?? 0), 0));
}

/** Monotone cubic path through points, so the line never dips below the data. */
function monotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const n = pts.length;
  const dx: number[] = [], dy: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3, c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3, c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${pts[i + 1].x.toFixed(2)},${pts[i + 1].y.toFixed(2)}`;
  }
  return d;
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Today's detections through the day as a solid line up to now, over the
 * last week's average as a dashed line. A marker sits at the current time.
 */
export function Rhythm({ data, height = 190 }: { data: RhythmData; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const B = data.buckets;
  const perHour = 60 / (1440 / B); // buckets per hour, to express values as calls per hour
  const today = smooth(data.today).map((v) => v * perHour);
  const week = smooth(data.week).map((v) => v * perHour);
  const rawToday = data.today.map((v) => v * perHour);
  const rawWeek = data.week.map((v) => v * perHour);

  const W = 1000;
  const padL = 34, padR = 16, padT = 14, padB = 26;
  const plotW = W - padL - padR, plotH = height - padT - padB;
  const max = Math.max(1, ...today, ...week) * 1.1;
  const xOf = (i: number) => padL + ((i + 0.5) / B) * plotW;
  const yOf = (v: number) => padT + plotH - (v / max) * plotH;
  const nowX = padL + (data.nowMinute / 1440) * plotW;
  const nowBucket = Math.min(B - 1, Math.floor(data.nowMinute / (1440 / B)));

  const weekPts = week.map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  const todayPts = today.slice(0, nowBucket + 1).map((v, i) => ({ x: xOf(i), y: yOf(v) }));
  if (todayPts.length) todayPts.push({ x: nowX, y: yOf(today[nowBucket]) });
  const nowY = yOf(today[nowBucket]);

  // a handful of round gridlines
  const step = max > 40 ? 20 : max > 16 ? 10 : max > 8 ? 5 : max > 4 ? 3 : 1;
  const grid: number[] = [];
  for (let v = step; v < max; v += step) grid.push(v);

  const empty = rawToday.every((v) => v === 0) && rawWeek.every((v) => v === 0);
  const hx = hover === null ? null : xOf(hover);

  return (
    <figure className="m-0 relative select-none" aria-label="Today's detections through the day, over last week's average">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full block"
        style={{ height }}
        role="img"
        aria-labelledby={id}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((x - padL) / plotW) * B - 0.5);
          setHover(i >= 0 && i < B ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <title id={id}>Today&apos;s rhythm</title>
        {grid.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="var(--hairline)" strokeWidth={1} />
            <text x={padL - 8} y={yOf(v) + 3} fontSize={10} textAnchor="end" fill="var(--ink-soft)" className="tabular-nums">{v}</text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={yOf(0)} y2={yOf(0)} stroke="var(--hairline)" strokeWidth={1} />
        <path d={monotonePath(weekPts)} fill="none" stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" opacity={0.9} />
        {todayPts.length > 1 && (
          <>
            <path d={`${monotonePath(todayPts)} L${nowX.toFixed(2)},${yOf(0)} L${todayPts[0].x.toFixed(2)},${yOf(0)} Z`} fill="var(--ink)" opacity={0.05} />
            <path d={monotonePath(todayPts)} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {/* the rest of today, faintly, so the line visibly has somewhere to go */}
        <line x1={nowX} x2={W - padR} y1={yOf(0)} y2={yOf(0)} stroke="var(--ink-soft)" strokeWidth={1} strokeDasharray="1 4" opacity={0.6} />
        {hx !== null && hover !== null && (
          <>
            <line x1={hx} x2={hx} y1={padT} y2={yOf(0)} stroke="var(--ink-soft)" strokeWidth={1} opacity={0.5} />
            <circle cx={hx} cy={yOf(week[hover])} r={3.5} fill="var(--paper)" stroke="var(--ink-soft)" strokeWidth={1.5} />
            {hover <= nowBucket && <circle cx={hx} cy={yOf(today[hover])} r={4} fill="var(--ink)" />}
          </>
        )}
        <circle cx={nowX} cy={nowY} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2} />
        <text x={nowX} y={height - 8} fontSize={11} fontWeight={600} textAnchor="middle" fill="var(--ink)" className="tabular-nums">{hhmm(data.nowMinute)}</text>
        {[0, 6, 12, 18].map((h) => (
          <text key={h} x={padL + (h / 24) * plotW} y={height - 8} fontSize={10} textAnchor={h === 0 ? "start" : "middle"} fill="var(--ink-soft)" opacity={Math.abs(padL + (h / 24) * plotW - nowX) < 40 ? 0 : 1}>
            {hhmm(h * 60)}
          </text>
        ))}
        <text x={W - padR} y={height - 8} fontSize={10} textAnchor="end" fill="var(--ink-soft)" opacity={W - padR - nowX < 40 ? 0 : 1}>23:59</text>
      </svg>
      <div
        className="absolute text-xs px-2 py-0.5 rounded-full tabular-nums pointer-events-none"
        style={{
          left: `${(nowX / W) * 100}%`,
          top: `${(nowY / height) * 100}%`,
          transform: "translate(12px, -50%)",
          background: "var(--ink)",
          color: "var(--paper)",
          display: hover === null ? undefined : "none",
        }}
      >
        {Math.round(today[nowBucket])}/hr
      </div>
      {hover !== null && (
        <div
          className="absolute top-0 text-xs px-2 py-1 rounded-md pointer-events-none whitespace-nowrap"
          style={{ left: `${(xOf(hover) / W) * 100}%`, transform: `translate(${hover > B * 0.75 ? "-100%" : "8px"}, 0)`, background: "var(--ink)", color: "var(--paper)" }}
        >
          {hhmm(hover * (1440 / B))} · today {hover <= nowBucket ? Math.round(rawToday[hover]) : "—"} · usually {rawWeek[hover].toFixed(1)}
          <span style={{ opacity: 0.7 }}> /hr</span>
        </div>
      )}
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--ink-soft)" }}>
          nothing yet
        </div>
      )}
    </figure>
  );
}
