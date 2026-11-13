"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGroup } from "motion/react";
import { RANGES, RANGE_LABEL, type DetectionsResponse, type Range } from "@/lib/model";
import { plural, relTime } from "@/lib/format";
import { Header } from "./Header";
import { RangeControl } from "./RangeControl";
import { Collage } from "./Collage";
import { BirdSheet } from "./BirdSheet";
import { usePolling } from "./usePolling";

export function HomeView() {
  const params = useSearchParams();
  const router = useRouter();
  const range = (RANGES.includes(params.get("range") as Range) ? params.get("range") : "today") as Range;
  const selected = params.get("bird");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      const q = next.toString();
      router.replace(q ? `/?${q}` : "/", { scroll: false });
    },
    [params, router],
  );

  // usePolling keeps the last good answer while the next range loads, so tiles move rather than vanish
  const { data: shown, error, loading } = usePolling<DetectionsResponse>(`/api/detections?range=${range}`, 60_000);

  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const seed = useMemo(() => shown?.species.find((s) => s.slug === selected), [shown, selected]);

  const status = shown
    ? shown.totals.species
      ? `${plural(shown.totals.species, "bird")} · ${plural(shown.totals.detections, "call")} · last heard ${relTime(shown.lastHeard)}`
      : "Listening for birds…"
    : error
      ? "Could not reach the server"
      : "Loading…";

  return (
    <LayoutGroup>
      <Header status={status}>
        <RangeControl value={range} onChange={(r) => setParam("range", r === "today" ? null : r)} />
      </Header>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-3 pb-5 flex-1">
        <div className="flex items-baseline justify-between px-1 pt-3 pb-2">
          <h1 className="eyebrow">{RANGE_LABEL[range]}</h1>
          {shown?.demo && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--seal)", color: "#fff" }} title="Example data until the frame is connected">
              demo data
            </span>
          )}
        </div>
        {shown && shown.species.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center text-center py-24 px-6">
            <p className="hand text-3xl" style={{ color: "var(--ink-2)" }}>listening for birds…</p>
            <p className="mt-2 text-sm max-w-sm" style={{ color: "var(--ink-soft)" }}>
              {range === "today" ? "Nothing has called yet today. Try a longer range, or come back after dawn." : "No birds were heard in this range."}
            </p>
          </div>
        )}
        {shown && <Collage species={shown.species} rangeKey={range} selected={selected} onSelect={(slug) => setParam("bird", slug)} />}
      </main>
      <BirdSheet slug={selected} seed={seed} onClose={() => setParam("bird", null)} />
    </LayoutGroup>
  );
}
