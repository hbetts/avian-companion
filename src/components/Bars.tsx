"use client";
import { useId, useState } from "react";

/**
 * A small single-series bar chart: thin ink bars with a 2px gap and rounded
 * data-ends, recessive baseline, hover tooltip. One series, so no legend.
 */
export function Bars({
  values,
  labels,
  tickEvery = 6,
  height = 96,
  ariaLabel,
  format = (v: number) => v.toLocaleString(),
}: {
  values: number[];
  labels: string[];
  tickEvery?: number;
  height?: number;
  ariaLabel: string;
  format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const n = values.length;
  const max = Math.max(1, ...values);
  const W = 100;
  const gap = 0.6;
  const bw = (W - gap * (n - 1)) / n;
  const plotH = height - 18;
  const empty = values.every((v) => v === 0);

  return (
    <figure className="m-0" aria-label={ariaLabel}>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full h-full block" role="img" aria-labelledby={id}>
          <title id={id}>{ariaLabel}</title>
          <line x1={0} x2={W} y1={plotH + 0.5} y2={plotH + 0.5} stroke="var(--hairline)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => {
            const h = v === 0 ? 0 : Math.max(1.5, (v / max) * (plotH - 6));
            const x = i * (bw + gap);
            const active = hover === i;
            return (
              <g key={i}>
                <rect x={x} y={0} width={bw} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
                {v > 0 ? (
                  <rect x={x} y={plotH - h} width={bw} height={h} rx={Math.min(1, bw / 2)} fill={active ? "var(--ink)" : "var(--bar)"} opacity={active ? 1 : 0.85} style={{ pointerEvents: "none" }} />
                ) : (
                  <rect x={x} y={plotH - 1} width={bw} height={1} fill="var(--bar-soft)" style={{ pointerEvents: "none" }} />
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[11px] tabular-nums" style={{ color: "var(--ink-soft)" }}>
          {labels.map((l, i) => (i % tickEvery === 0 || (i === n - 1 && (n - 1) % tickEvery > tickEvery / 2) ? <span key={i} className="absolute" style={{ left: `${(i / n) * 100}%`, transform: i === n - 1 ? "translateX(-100%)" : undefined }}>{l}</span> : null))}
        </div>
        {hover !== null && values[hover] > 0 && (
          <div
            className="absolute -top-1 text-xs px-2 py-1 rounded-md pointer-events-none whitespace-nowrap"
            style={{
              left: `${((hover + 0.5) / n) * 100}%`,
              transform: "translate(-50%, -100%)",
              background: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            {labels[hover]} · {format(values[hover])}
          </div>
        )}
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "var(--ink-soft)" }}>
            nothing yet
          </div>
        )}
      </div>
    </figure>
  );
}
