"use client";
import { useEffect, useState } from "react";
import type { SpeciesDetail, SpeciesMedia, SpeciesSummary } from "@/lib/model";
import { fmtDateTime, fmtDay, fmtTime, hourLabel, plural, relTime } from "@/lib/format";
import { BirdArt } from "./BirdArt";
import { AudioPlayer } from "./AudioPlayer";
import { Bars } from "./Bars";

type Seed = Pick<SpeciesSummary, "sci" | "com" | "slug" | "art"> & Partial<SpeciesSummary>;

export function BirdDetail({ slug, seed, shared = true }: { slug: string; seed?: Seed; shared?: boolean }) {
  const [detail, setDetail] = useState<SpeciesDetail | null>(null);
  const [media, setMedia] = useState<SpeciesMedia | null>(null);
  const [missing, setMissing] = useState(false);

  // the parent keys this component by slug, so state starts fresh for each bird
  useEffect(() => {
    let alive = true;
    fetch(`/api/species/${slug}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SpeciesDetail) => alive && setDetail(d))
      .catch(() => alive && setMissing(true));
    fetch(`/api/species/${slug}/media`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: SpeciesMedia | null) => alive && m && setMedia(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);

  const bird = detail ?? seed;
  if (!bird) {
    return <div className="p-6 text-sm" style={{ color: "var(--ink-soft)" }}>{missing ? "This bird is not in the list." : "Loading…"}</div>;
  }
  const hasArt = !!(bird.art.perched || bird.art.flight);

  return (
    <article className="pb-10">
      <div className="px-5 pt-2">
        <div className="bird-hero relative mx-auto rounded-full" style={{ width: "min(80%, 320px)", aspectRatio: hasArt ? undefined : "1", height: hasArt ? 250 : undefined, padding: 12 }}>
          <BirdArt species={bird} layoutId={shared ? `art-${bird.slug}` : undefined} />
        </div>
        <h1 className="display text-[2rem] mt-3 leading-tight">{bird.com}</h1>
        <p className="italic" style={{ color: "var(--ink-soft)", fontFamily: "var(--font-serif)" }}>{bird.sci}</p>
      </div>

      <div className="px-5 mt-4 grid grid-cols-3 gap-2">
        <Stat label="Today" value={detail ? detail.today : seed?.n ?? "…"} />
        <Stat label="This week" value={detail ? detail.week : "…"} />
        <Stat label="All time" value={detail ? detail.total : "…"} />
      </div>

      {detail && (
        <dl className="px-5 mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt style={{ color: "var(--ink-soft)" }}>First heard</dt>
          <dd className="text-right tabular-nums">{fmtDateTime(detail.first)}</dd>
          <dt style={{ color: "var(--ink-soft)" }}>Last heard</dt>
          <dd className="text-right tabular-nums">{detail.last ? `${relTime(detail.last)} · ${fmtTime(detail.last)}` : "—"}</dd>
        </dl>
      )}

      <Section title="Listen">
        {detail?.clips.length ? (
          <div className="space-y-2">
            {detail.clips.slice(0, 3).map((c) => (
              <AudioPlayer key={c.url} src={c.url} title={`Heard at the window · ${fmtDateTime(c.at)}`} credit={`Recorded by the frame · ${Math.round(c.conf * 100)}% sure`} />
            ))}
          </div>
        ) : (
          <p className="text-sm mb-2" style={{ color: "var(--ink-soft)" }}>
            {detail ? "No recording from the window has been uploaded for this bird yet." : "Looking for recordings…"}
          </p>
        )}
        {media?.call ? (
          <div className="mt-2">
            <AudioPlayer src={media.call.url} title="What this bird sounds like" credit={media.call.credit} href={media.call.page} />
          </div>
        ) : media ? (
          <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
            No reference recording found.{" "}
            {media.links.find((l) => l.label.startsWith("xeno-canto")) && (
              <a className="underline" href={media.links.find((l) => l.label.startsWith("xeno-canto"))!.url} target="_blank" rel="noreferrer">
                Listen on xeno-canto
              </a>
            )}
          </p>
        ) : null}
      </Section>

      {detail && (
        <Section title="When it calls" hint="Last 7 days, by hour">
          <Bars values={detail.hours} labels={detail.hours.map((_, h) => hourLabel(h))} tickEvery={6} ariaLabel={`${bird.com}: detections by hour of day over the last 7 days`} format={(v) => plural(v, "call")} />
        </Section>
      )}

      {detail && (
        <Section title="Last 30 days">
          <Bars values={detail.days.map((d) => d.n)} labels={detail.days.map((d) => fmtDay(d.date))} tickEvery={7} ariaLabel={`${bird.com}: detections per day over the last 30 days`} format={(v) => plural(v, "call")} />
        </Section>
      )}

      {media?.rangeMap && (
        <Section title="Where it lives">
          <a href={media.rangeMap.page} target="_blank" rel="noreferrer" className="block card overflow-hidden">
            <img src={media.rangeMap.url} alt={`Range map of ${bird.com}`} className="w-full block" style={{ background: "#fff" }} loading="lazy" />
          </a>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Range map · {media.rangeMap.credit}</p>
        </Section>
      )}

      {media?.wikipedia && (
        <Section title="About">
          <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{media.wikipedia.extract}</p>
          <a href={media.wikipedia.url} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2 mt-1 inline-block">
            Read more on Wikipedia
          </a>
        </Section>
      )}

      {media && (
        <Section title="Elsewhere">
          <ul className="card divide-y hairline overflow-hidden">
            {media.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                  <span>{l.label}</span>
                  <span aria-hidden style={{ color: "var(--ink-soft)" }}>↗</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card px-3 py-2 text-center">
      <div className="display text-2xl tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="eyebrow">{label}</div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="px-5 mt-7">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="display text-xl">{title}</h2>
        {hint && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}
