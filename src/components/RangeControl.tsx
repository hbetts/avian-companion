"use client";
import { motion, useReducedMotion } from "motion/react";
import { RANGES, type Range } from "@/lib/model";

const SHORT: Record<Range, string> = { today: "Today", "24h": "24 h", week: "Week", month: "Month", all: "All" };

export function RangeControl({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const reduced = useReducedMotion();
  const onKey = (e: React.KeyboardEvent) => {
    const i = RANGES.indexOf(value);
    if (e.key === "ArrowRight") onChange(RANGES[Math.min(RANGES.length - 1, i + 1)]);
    if (e.key === "ArrowLeft") onChange(RANGES[Math.max(0, i - 1)]);
  };
  return (
    <div
      role="radiogroup"
      aria-label="Time range"
      onKeyDown={onKey}
      className="relative inline-flex rounded-full p-1"
      style={{ background: "var(--paper-3)", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)" }}
    >
      {RANGES.map((r) => {
        const active = r === value;
        return (
          <motion.button
            key={r}
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onPointerDown={() => onChange(r)}
            onClick={() => onChange(r)}
            whileTap={{ scale: 0.96 }}
            className="relative z-10 px-2.5 sm:px-3.5 py-1.5 text-[13px] sm:text-sm font-medium rounded-full select-none whitespace-nowrap"
            style={{ color: active ? "var(--ink)" : "var(--ink-2)" }}
          >
            {active && (
              <motion.span
                layoutId="range-pill"
                className="absolute inset-0 rounded-full -z-10"
                style={{ background: "var(--paper)", boxShadow: "var(--shadow-sm)" }}
                transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.38 }}
              />
            )}
            {SHORT[r]}
          </motion.button>
        );
      })}
    </div>
  );
}
