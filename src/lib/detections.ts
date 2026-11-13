import { getJSON, putJSON, listKeys, deleteKeys, clearMemo } from "./store";
import type {
  DayFile,
  Rhythm,
  Detection,
  DetectionsResponse,
  IndexFile,
  Range,
  SpeciesDetail,
  SpeciesSummary,
  StatsResponse,
} from "./model";
import { dayKey, lastDays, localToMs, hourOf } from "./time";
import { describe } from "./species";
import { STATION_TZ } from "./config";

export const INDEX_KEY = "index.json";
export const dayPath = (date: string) => `days/${date}.json`;

const emptyIndex = (): IndexFile => ({ updated: new Date(0).toISOString(), days: {}, daily: {}, species: {} });

export async function loadIndex(fresh = false): Promise<IndexFile> {
  return (await getJSON<IndexFile>(INDEX_KEY, { fresh })) ?? emptyIndex();
}

export async function loadDays(dates: string[]): Promise<DayFile[]> {
  const files = await Promise.all(dates.map((d) => getJSON<DayFile>(dayPath(d))));
  return files.filter((f): f is DayFile => !!f);
}

/** Replace one or more whole days and rebuild the index entries they touch. */
export async function storeDays(
  days: { date: string; detections: Detection[] }[],
  meta: { demo?: boolean; station?: IndexFile["station"] },
): Promise<IndexFile> {
  const now = new Date().toISOString();
  let index = await loadIndex(true);

  // A real station replacing demo data starts from a clean slate.
  if (index.demo && !meta.demo) {
    await wipeAll();
    index = emptyIndex();
  }

  for (const day of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) continue;
    const dets = day.detections
      .filter((d) => d && typeof d.sci === "string" && typeof d.t === "string")
      .map((d) => ({ t: d.t, sci: d.sci, com: d.com ?? d.sci, conf: Number(d.conf) || 0, ...(d.file ? { file: d.file } : {}), ...(d.clip ? { clip: d.clip } : {}) }))
      .sort((a, b) => a.t.localeCompare(b.t));
    await putJSON(dayPath(day.date), { date: day.date, detections: dets, updated: now } satisfies DayFile);

    const perSpecies: Record<string, number> = {};
    for (const d of dets) perSpecies[d.sci] = (perSpecies[d.sci] ?? 0) + 1;
    index.daily[day.date] = perSpecies;
    index.days[day.date] = { n: dets.length, species: Object.keys(perSpecies).length };

    // first/last timestamps for the species heard this day
    for (const d of dets) {
      const stamp = `${day.date} ${d.t}`;
      const s = index.species[d.sci] ?? { com: d.com, first: stamp, last: stamp, total: 0 };
      if (stamp < s.first) s.first = stamp;
      if (stamp > s.last) s.last = stamp;
      s.com = d.com || s.com;
      index.species[d.sci] = s;
    }
  }

  // totals always derive from the per-day table so they stay consistent
  for (const s of Object.values(index.species)) s.total = 0;
  for (const perSpecies of Object.values(index.daily)) {
    for (const [sci, n] of Object.entries(perSpecies)) {
      if (index.species[sci]) index.species[sci].total += n;
    }
  }
  for (const [sci, s] of Object.entries(index.species)) if (s.total === 0) delete index.species[sci];

  index.updated = now;
  index.demo = !!meta.demo;
  if (meta.station) index.station = meta.station;
  await putJSON(INDEX_KEY, index);
  return index;
}

export async function wipeAll(): Promise<number> {
  const keys = [
    ...(await listKeys("days/")),
    ...(await listKeys("clips/")),
    ...(await listKeys("index.json")),
  ];
  await deleteKeys(keys);
  clearMemo();
  return keys.length;
}

// ---------------------------------------------------------------- aggregation

type Acc = {
  n: number;
  first: number | null;
  last: number | null;
  hours: number[];
  best: number;
  clip?: string;
  clipAt?: number;
  com: string;
};

function accumulate(acc: Map<string, Acc>, date: string, d: Detection, sinceMs: number | null) {
  const ms = localToMs(date, d.t);
  if (sinceMs !== null && ms < sinceMs) return;
  const a: Acc = acc.get(d.sci) ?? { n: 0, first: null, last: null, hours: new Array(24).fill(0), best: 0, com: d.com };
  a.n += 1;
  a.first = a.first === null ? ms : Math.min(a.first, ms);
  a.last = a.last === null ? ms : Math.max(a.last, ms);
  a.hours[hourOf(d.t)] += 1;
  a.best = Math.max(a.best, d.conf);
  if (d.clip && (a.clipAt === undefined || ms > a.clipAt)) {
    a.clip = d.clip;
    a.clipAt = ms;
  }
  acc.set(d.sci, a);
}

function toSummary(sci: string, a: Acc): SpeciesSummary {
  const info = describe(sci, a.com);
  return {
    sci,
    com: info.com,
    slug: info.slug,
    rank: info.rank,
    art: info.art,
    n: a.n,
    first: a.first === null ? null : new Date(a.first).toISOString(),
    last: a.last === null ? null : new Date(a.last).toISOString(),
    hours: a.hours,
    best: Math.round(a.best * 1000) / 1000,
    ...(a.clip ? { clip: a.clip } : {}),
  };
}

const BUCKETS = 48;

/** Minutes since midnight at the station. */
function stationMinute(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: STATION_TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value) || 0;
  return get("hour") * 60 + get("minute");
}

const bucketOf = (t: string) => Math.min(BUCKETS - 1, Math.floor(((Number(t.slice(0, 2)) || 0) * 60 + (Number(t.slice(3, 5)) || 0)) / (1440 / BUCKETS)));

export async function rhythmFor(now = new Date()): Promise<Rhythm> {
  const today = dayKey(now);
  const dates = lastDays(8, today);
  const files = await loadDays(dates);
  const todayB = new Array(BUCKETS).fill(0);
  const weekB = new Array(BUCKETS).fill(0);
  for (const f of files) {
    const target = f.date === today ? todayB : weekB;
    for (const d of f.detections) target[bucketOf(d.t)] += 1;
  }
  return { today: todayB, week: weekB.map((n) => n / 7), nowMinute: stationMinute(now), buckets: BUCKETS };
}

export async function detectionsFor(range: Range): Promise<DetectionsResponse> {
  const now = new Date();
  const today = dayKey(now);
  const index = await loadIndex();
  const rhythm = await rhythmFor(now);
  const acc = new Map<string, Acc>();

  if (range === "today" || range === "24h" || range === "week") {
    const dates = range === "today" ? [today] : range === "24h" ? lastDays(2, today) : lastDays(7, today);
    const since = range === "24h" ? now.getTime() - 24 * 3600 * 1000 : null;
    for (const day of await loadDays(dates)) for (const d of day.detections) accumulate(acc, day.date, d, since);
  } else {
    const dates = range === "month" ? new Set(lastDays(30, today)) : null;
    for (const [date, perSpecies] of Object.entries(index.daily)) {
      if (dates && !dates.has(date)) continue;
      for (const [sci, n] of Object.entries(perSpecies)) {
        const s = index.species[sci];
        const a: Acc = acc.get(sci) ?? { n: 0, first: null, last: null, hours: new Array(24).fill(0), best: 0, com: s?.com ?? sci };
        a.n += n;
        const dayStart = localToMs(date, "00:00:00");
        a.first = a.first === null ? dayStart : Math.min(a.first, dayStart);
        a.last = a.last === null ? dayStart : Math.max(a.last, dayStart);
        acc.set(sci, a);
      }
    }
    // precise first/last and hour rhythm where the detail exists
    for (const [sci, a] of acc) {
      const s = index.species[sci];
      if (!s) continue;
      const [fd, ft] = s.first.split(" ");
      const [ld, lt] = s.last.split(" ");
      if (range === "all") {
        a.first = localToMs(fd, ft);
        a.last = localToMs(ld, lt);
      } else if (a.last !== null && ld >= dayKey(new Date(a.last))) {
        a.last = Math.max(a.last, localToMs(ld, lt) <= now.getTime() ? localToMs(ld, lt) : a.last);
      }
    }
    for (const day of await loadDays(lastDays(7, today))) {
      for (const d of day.detections) {
        const a = acc.get(d.sci);
        if (!a) continue;
        a.hours[hourOf(d.t)] += 1;
        a.best = Math.max(a.best, d.conf);
        const ms = localToMs(day.date, d.t);
        if (d.clip && (a.clipAt === undefined || ms > a.clipAt)) {
          a.clip = d.clip;
          a.clipAt = ms;
        }
      }
    }
  }

  const species = [...acc.entries()].map(([sci, a]) => toSummary(sci, a)).sort((x, y) => y.n - x.n || x.rank - y.rank);
  const lastHeard = species.reduce<string | null>((m, s) => (s.last && (!m || s.last > m) ? s.last : m), null);
  return {
    range,
    rhythm,
    now: now.toISOString(),
    tz: STATION_TZ,
    demo: !!index.demo,
    lastHeard,
    totals: { detections: species.reduce((n, s) => n + s.n, 0), species: species.length },
    species,
  };
}

export async function statsFor(): Promise<StatsResponse> {
  const now = new Date();
  const today = dayKey(now);
  const index = await loadIndex();
  const week = lastDays(7, today);
  const weekFiles = await loadDays(week);

  const hours = new Array(24).fill(0);
  const topMap = new Map<string, { com: string; n: number }>();
  for (const day of weekFiles) {
    for (const d of day.detections) {
      hours[hourOf(d.t)] += 1;
      const t = topMap.get(d.sci) ?? { com: d.com, n: 0 };
      t.n += 1;
      topMap.set(d.sci, t);
    }
  }
  const weekSet = new Set(week);
  const weekDet = Object.entries(index.days).filter(([d]) => weekSet.has(d)).reduce((n, [, v]) => n + v.n, 0);
  const weekSpecies = new Set<string>();
  for (const d of week) for (const sci of Object.keys(index.daily[d] ?? {})) weekSpecies.add(sci);
  const weekStart = `${week[0]} 00:00:00`;
  const newThisWeek = Object.entries(index.species)
    .filter(([, s]) => s.first >= weekStart)
    .sort((a, b) => b[1].first.localeCompare(a[1].first))
    .map(([sci, s]) => ({ ...describe(sci, s.com), first: s.first }))
    .map(({ sci, com, slug, art, first }) => ({ sci, com, slug, art, first }));

  const days = lastDays(30, today).map((date) => ({
    date,
    detections: index.days[date]?.n ?? 0,
    species: index.days[date]?.species ?? 0,
  }));
  const allDays = Object.keys(index.days).sort();
  const busiest = hours.some((h) => h > 0) ? hours.indexOf(Math.max(...hours)) : null;

  return {
    now: now.toISOString(),
    tz: STATION_TZ,
    demo: !!index.demo,
    firstDay: allDays[0] ?? null,
    today: { detections: index.days[today]?.n ?? 0, species: index.days[today]?.species ?? 0 },
    week: { detections: weekDet, species: weekSpecies.size, newSpecies: newThisWeek.length },
    allTime: {
      detections: Object.values(index.days).reduce((n, v) => n + v.n, 0),
      species: Object.keys(index.species).length,
    },
    busiestHour: busiest,
    hours,
    rhythm: await rhythmFor(now),
    days,
    topWeek: [...topMap.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 10)
      .map(([sci, t]) => {
        const i = describe(sci, t.com);
        return { sci, com: i.com, slug: i.slug, n: t.n, art: i.art };
      }),
    newThisWeek,
    lifeList: Object.entries(index.species)
      .sort((a, b) => a[1].first.localeCompare(b[1].first))
      .map(([sci, s]) => {
        const i = describe(sci, s.com);
        return { sci, com: i.com, slug: i.slug, first: s.first, total: s.total, art: i.art };
      }),
  };
}

export async function speciesDetail(slug: string): Promise<SpeciesDetail | null> {
  const index = await loadIndex();
  const entry = Object.entries(index.species).find(([sci, s]) => describe(sci, s.com).slug === slug);
  const info = entry ? describe(entry[0], entry[1].com) : (await import("./species")).speciesBySlug(slug);
  if (!info) return null;
  const sci = info.sci;
  const today = dayKey();
  const week = lastDays(7, today);
  const hours = new Array(24).fill(0);
  const clips: SpeciesDetail["clips"] = [];
  let weekN = 0;
  for (const day of await loadDays(week)) {
    for (const d of day.detections) {
      if (d.sci !== sci) continue;
      weekN += 1;
      hours[hourOf(d.t)] += 1;
      if (d.clip) clips.push({ url: d.clip, at: new Date(localToMs(day.date, d.t)).toISOString(), conf: d.conf });
    }
  }
  clips.sort((a, b) => b.at.localeCompare(a.at));
  const s = index.species[sci];
  const daysTotal = Object.keys(index.days).length;
  const daysHeard = Object.values(index.daily).filter((per) => (per[sci] ?? 0) > 0).length;
  const share = daysTotal ? daysHeard / daysTotal : 0;
  const rarity = share >= 0.5 ? "common" : share >= 0.2 ? "regular" : share >= 0.05 ? "occasional" : "rare";
  const toIso = (stamp: string) => {
    const [d, t] = stamp.split(" ");
    return new Date(localToMs(d, t)).toISOString();
  };
  return {
    sci,
    com: info.com,
    slug: info.slug,
    rank: info.rank,
    art: info.art,
    today: index.daily[today]?.[sci] ?? 0,
    week: weekN,
    total: s?.total ?? 0,
    first: s ? toIso(s.first) : null,
    last: s ? toIso(s.last) : null,
    hours,
    days: lastDays(30, today).map((date) => ({ date, n: index.daily[date]?.[sci] ?? 0 })),
    clips: clips.slice(0, 12),
    daysHeard,
    daysTotal,
    rarity,
    ...(index.station ? { station: index.station } : {}),
  };
}
