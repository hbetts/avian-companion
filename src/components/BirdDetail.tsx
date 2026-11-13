"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { SpeciesDetail, SpeciesMedia, SpeciesSummary } from "@/lib/model";
import { fmtDateTime, fmtDay, hourLabel, plural, relTime } from "@/lib/format";
import { BirdArt } from "./BirdArt";
import { AudioPlayer } from "./AudioPlayer";
import { Bars } from "./Bars";
import { RangeMap } from "./RangeMap";

type Seed = Pick<SpeciesSummary, "sci" | "com" | "slug" | "art"> & Partial<SpeciesSummary>;
type Pose = "perched" | "flight";

/**
 * Everything about one bird. In the sheet it is a single column; on its own
 * page (`wide`) the painting, map and links sit on the left with the story,
 * recordings and charts on the right.
 */
export function BirdDetail({ slug, seed, shared = true, wide = false }: { slug: string; seed?: Seed; shared?: boolean; wide?: boolean }) {
  const [detail, setDetail] = useState<SpeciesDetail | null>(null);
  const [media, setMedia] = useState<SpeciesMedia | null>(null);
  const [missing, setMissing] = useState(false);
  const [pose, setPose] = useState<Pose | null>(null);
  const reduced = useReducedMotion();

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
  const bothPoses = !!(bird.art.perched && bird.art.flight);
  const shownPose: Pose = pose ?? (bird.art.perched ? "perched" : "flight");
  const link = (label: string) => media?.links.find((l) => l.label.startsWith(label));
  const paragraphs = media?.wikipedia?.extract.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) ?? [];
  const genus = bird.sci.split(" ")[0];
  const epithet = bird.sci.split(" ").slice(1).join(" ");
  const station = detail?.station?.lat !== undefined && detail.station.lon !== undefined ? { lat: detail.station.lat, lon: detail.station.lon, name: detail.station.name } : undefined;

  const hero = (
    <div className="card relative overflow-hidden" style={{ minHeight: wide ? 420 : 280 }}>
      <div className="bird-hero absolute inset-0" aria-hidden />
      <div className="relative flex items-center justify-center p-8" style={{ height: wide ? 440 : 290 }}>
        <motion.div
          key={shownPose}
          initial={reduced || !pose ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", bounce: 0, duration: 0.45 }}
          className="w-full h-full"
          style={{ maxWidth: wide ? 420 : 300 }}
        >
          <BirdArt species={bird} pose={shownPose} layoutId={shared ? `art-${bird.slug}` : undefined} eager />
        </motion.div>
      </div>
      {hasArt && bothPoses && (
        <div className="absolute left-3 bottom-3 flex rounded-full p-0.5" style={{ background: "var(--paper-3)" }} role="radiogroup" aria-label="Pose">
          {(["perched", "flight"] as Pose[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={shownPose === p}
              aria-label={p === "perched" ? "Perched" : "In flight"}
              onClick={() => setPose(p)}
              className="pressable relative w-9 h-9 rounded-full flex items-center justify-center"
              style={{ color: shownPose === p ? "var(--paper)" : "var(--ink-2)" }}
            >
              {shownPose === p && <motion.span layoutId={`pose-pill-${slug}`} className="absolute inset-0 rounded-full" style={{ background: "var(--ink)" }} transition={{ type: "spring", bounce: 0, duration: 0.35 }} />}
              <span className="relative">
                {p === "perched" ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M9.5 2.5c-1.6 0-2.7 1.2-2.9 2.7L3 8.3l.7.9 3-1.4c.2.8.7 1.5 1.4 1.9L7 13.5h1.2l.8-3.4h.9l.8 3.4H12l-1.1-3.9c1.2-.6 1.9-1.8 1.9-3.2V5l1.4-.9-1.6-.5C12.2 2.9 11 2.5 9.5 2.5z" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 9.2 1.5 4.6c1.9-.6 3.9-.2 5.4 1l1.1.9 1.1-.9c1.5-1.2 3.5-1.6 5.4-1L8 9.2zm0 1.6 2.6-1.9L8 13.5 5.4 8.9 8 10.8z" /></svg>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
      {media && (
        <div className="absolute right-3 bottom-3 flex gap-2">
          {[link("Wikipedia"), link("eBird")].filter(Boolean).map((l) => (
            <a key={l!.url} href={l!.url} target="_blank" rel="noreferrer" className="pressable text-xs px-3 py-1.5 rounded-full" style={{ background: "var(--paper-3)", color: "var(--ink-2)" }}>
              {l!.label} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );

  const title = (
    <div className="card px-5 py-4">
      <h1 className="display" style={{ fontSize: wide ? "2.6rem" : "2rem" }}>{bird.com}</h1>
      <p className="italic mt-1" style={{ color: "var(--ink-soft)", fontFamily: "var(--font-serif)" }}>{bird.sci}</p>
      <p className="mt-4 text-sm tabular-nums" style={{ color: "var(--ink-soft)" }}>
        <b style={{ color: "var(--ink)" }}>{detail ? detail.total.toLocaleString() : seed?.n ?? "…"}</b> heard
        {detail?.first && (
          <>
            {" · "}
            <b style={{ color: "var(--ink)" }}>{relTime(detail.first)}</b> first heard
          </>
        )}
        {detail?.last && (
          <>
            {" · "}
            <b style={{ color: "var(--ink)" }}>{relTime(detail.last)}</b> last heard
          </>
        )}
      </p>
      {detail && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Today" value={detail.today} />
          <Stat label="This week" value={detail.week} />
          <Stat label="Days heard" value={`${detail.daysHeard}/${detail.daysTotal}`} />
        </div>
      )}
    </div>
  );

  const about = (media?.wikipedia || detail) && (
    <Card title="About">
      {paragraphs.length ? (
        <div className="space-y-3 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)", fontFamily: "var(--font-serif)" }}>
          {paragraphs.slice(0, 3).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{media ? "Nothing written about this bird yet." : "Looking it up…"}</p>
      )}
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-xs">
        <Fact label="Family" value={media?.gbif?.family ?? "—"} />
        <Fact label="Genus" value={media?.gbif?.genus ?? genus} italic />
        <Fact label="Species" value={epithet || "—"} italic />
        <Fact label="Here" value={detail ? detail.rarity : "…"} />
      </dl>
      {media?.wikipedia && (
        <a href={media.wikipedia.url} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2 mt-3 inline-block">
          Read more on Wikipedia
        </a>
      )}
    </Card>
  );

  const recordings = (
    <Card title="Recordings" hint={detail ? `${plural(detail.clips.length, "from the window")}` : undefined}>
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
          {link("xeno-canto") && (
            <a className="underline" href={link("xeno-canto")!.url} target="_blank" rel="noreferrer">
              Listen on xeno-canto
            </a>
          )}
        </p>
      ) : null}
    </Card>
  );

  const where = media && (media.gbif || media.rangeMap) && (
    <Card title="Where it lives" hint={media.gbif ? "sightings, GBIF" : undefined}>
      {media.gbif ? (
        <RangeMap taxonKey={media.gbif.key} station={station} name={bird.com} />
      ) : (
        <>
          <a href={media.rangeMap!.page} target="_blank" rel="noreferrer" className="block rounded-2xl overflow-hidden">
            <img src={media.rangeMap!.url} alt={`Range map of ${bird.com}`} className="w-full block" style={{ background: "#fff" }} loading="lazy" />
          </a>
          <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>Range map · {media.rangeMap!.credit}</p>
        </>
      )}
    </Card>
  );

  const charts = detail && (
    <>
      <Card title="When it calls" hint="Last 7 days, by hour">
        <Bars values={detail.hours} labels={detail.hours.map((_, h) => hourLabel(h))} tickEvery={6} ariaLabel={`${bird.com}: detections by hour of day over the last 7 days`} format={(v) => plural(v, "call")} />
      </Card>
      <Card title="Last 30 days">
        <Bars values={detail.days.map((d) => d.n)} labels={detail.days.map((d) => fmtDay(d.date))} tickEvery={7} ariaLabel={`${bird.com}: detections per day over the last 30 days`} format={(v) => plural(v, "call")} />
      </Card>
    </>
  );

  const elsewhere = media && (
    <Card title="Elsewhere">
      <ul className="divide-y hairline -mx-2">
        {media.links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-between px-2 py-2.5 text-sm rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
              <span>{l.label}</span>
              <span aria-hidden style={{ color: "var(--ink-soft)" }}>↗</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );

  if (wide) {
    return (
      <article className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] px-4 pb-10 pt-2">
        <div className="space-y-4">
          {hero}
          {where}
          {elsewhere}
        </div>
        <div className="space-y-4">
          {title}
          {about}
          {recordings}
          {charts}
        </div>
      </article>
    );
  }
  return (
    <article className="px-4 pb-10 pt-1 space-y-3">
      {hero}
      {title}
      {recordings}
      {about}
      {where}
      {charts}
      {elsewhere}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl px-3 py-2 text-center" style={{ background: "var(--paper-3)" }}>
      <div className="display text-xl tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="eyebrow" style={{ fontSize: "0.65rem" }}>{label}</div>
    </div>
  );
}

function Fact({ label, value, italic }: { label: string; value: string; italic?: boolean }) {
  return (
    <div>
      <dt style={{ color: "var(--ink-soft)" }}>{label}</dt>
      <dd className={`font-medium ${italic ? "italic" : ""}`} style={{ color: "var(--ink)", fontFamily: italic ? "var(--font-serif)" : undefined, fontSize: "0.85rem" }}>{value}</dd>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card px-5 py-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="display text-xl">{title}</h2>
        {hint && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{hint}</span>}
      </div>
      {children}
    </section>
  );
}
