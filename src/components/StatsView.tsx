"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { StatsResponse } from "@/lib/model";
import { fmtDay, hourLabel, plural } from "@/lib/format";
import { Header } from "./Header";
import { Bars } from "./Bars";
import { BirdArt } from "./BirdArt";
import { usePolling } from "./usePolling";

export function StatsView() {
  const { data, error } = usePolling<StatsResponse>("/api/stats", 120_000);
  const reduced = useReducedMotion();
  const station = process.env.NEXT_PUBLIC_STATION_NAME || "the window";

  return (
    <>
      <Header status={data ? `Since ${data.firstDay ? fmtDay(data.firstDay, true) : "the start"} · ${plural(data.allTime.species, "bird")}` : undefined} />
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-12 flex-1">
        <div className="flex items-baseline justify-between pt-5 mb-3">
          <h1 className="display text-3xl">Stats</h1>
          {data?.demo && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--seal)", color: "#fff" }}>
              demo data
            </span>
          )}
        </div>
        {error && !data && <p style={{ color: "var(--seal)" }}>Could not load stats.</p>}
        {!data && !error && <p style={{ color: "var(--ink-soft)" }}>Loading…</p>}
        {data && (
          <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.5 }} className="space-y-8">
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Tile label="Birds today" value={data.today.species} sub={plural(data.today.detections, "call")} />
              <Tile label="Birds this week" value={data.week.species} sub={plural(data.week.detections, "call")} />
              <Tile label="New this week" value={data.week.newSpecies} sub="never heard before" accent={data.week.newSpecies > 0} />
              <Tile label="All time" value={data.allTime.species} sub={`${plural(data.allTime.detections, "call")} near ${station}`} />
            </section>

            <section className="grid md:grid-cols-2 gap-6">
              <Panel title="Different birds per day" hint="Last 30 days">
                <Bars values={data.days.map((d) => d.species)} labels={data.days.map((d) => fmtDay(d.date))} tickEvery={7} height={140} ariaLabel="Number of different bird species heard per day over the last 30 days" format={(v) => plural(v, "bird")} />
              </Panel>
              <Panel title="When the garden is loudest" hint={data.busiestHour !== null ? `Last 7 days · busiest around ${hourLabel(data.busiestHour)}` : "Last 7 days"}>
                <Bars values={data.hours} labels={data.hours.map((_, h) => hourLabel(h))} tickEvery={6} height={140} ariaLabel="Detections by hour of day over the last 7 days" format={(v) => plural(v, "call")} />
              </Panel>
            </section>

            {data.newThisWeek.length > 0 && (
              <section>
                <h2 className="display text-xl mb-3">New this week</h2>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
                  {data.newThisWeek.map((s) => (
                    <Link key={s.sci} href={`/bird/${s.slug}`} className="card pressable shrink-0 w-40 p-3 snap-start">
                      <div className="h-28 relative">
                        <BirdArt species={s} />
                      </div>
                      <div className="hand text-xl leading-tight mt-1" style={{ color: "var(--ink-2)" }}>{s.com}</div>
                      <div className="text-xs" style={{ color: "var(--ink-soft)" }}>first heard {fmtDay(s.first.slice(0, 10), true)}</div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="grid md:grid-cols-2 gap-6">
              <Panel title="Most heard this week">
                {data.topWeek.length === 0 && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Nothing yet this week.</p>}
                <ol className="space-y-2">
                  {data.topWeek.map((s, i) => {
                    const max = data.topWeek[0].n;
                    return (
                      <li key={s.sci}>
                        <Link href={`/bird/${s.slug}`} className="flex items-center gap-3 group">
                          <span className="w-5 text-right text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{i + 1}</span>
                          <span className="w-10 h-10 relative shrink-0"><BirdArt species={s} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="flex justify-between text-sm">
                              <span className="truncate group-hover:underline">{s.com}</span>
                              <span className="tabular-nums ml-2" style={{ color: "var(--ink-2)" }}>{s.n.toLocaleString()}</span>
                            </span>
                            <span className="block h-1.5 rounded-full mt-1" style={{ background: "var(--paper-3)" }}>
                              <motion.span className="block h-full rounded-full" style={{ background: "var(--bar)" }} initial={reduced ? false : { width: 0 }} animate={{ width: `${(s.n / max) * 100}%` }} transition={{ type: "spring", bounce: 0, duration: 0.7, delay: i * 0.04 }} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </Panel>
              <Panel title="Life list" hint={`${plural(data.lifeList.length, "bird")} so far`}>
                <ul className="max-h-[420px] overflow-y-auto sheet-scroll divide-y hairline -mx-1">
                  {data.lifeList.map((s) => (
                    <li key={s.sci}>
                      <Link href={`/bird/${s.slug}`} className="flex items-center gap-3 px-1 py-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg">
                        <span className="w-9 h-9 relative shrink-0"><BirdArt species={s} /></span>
                        <span className="flex-1 min-w-0 text-sm">
                          <span className="block truncate">{s.com}</span>
                          <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>first {fmtDay(s.first.slice(0, 10))}</span>
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: "var(--ink-2)" }}>×{s.total.toLocaleString()}</span>
                      </Link>
                    </li>
                  ))}
                  {data.lifeList.length === 0 && <li className="text-sm py-2" style={{ color: "var(--ink-soft)" }}>No birds yet.</li>}
                </ul>
              </Panel>
            </section>
          </motion.div>
        )}
      </main>
    </>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="display text-4xl mt-1 tabular-nums" style={{ color: accent ? "var(--seal)" : "var(--ink)" }}>{value.toLocaleString()}</div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="display text-xl">{title}</h2>
        {hint && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}
