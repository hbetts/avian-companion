#!/usr/bin/env node
/**
 * Fill the app with example detections so it has something to show before the
 * frame is connected. Marked as demo data; the first real post from the
 * station wipes it automatically (or run scripts/reset.mjs).
 *
 *   node scripts/seed_demo.mjs                 -> http://localhost:3000, token from .env.local
 *   node scripts/seed_demo.mjs https://your-app.vercel.app
 *   INGEST_TOKEN=... node scripts/seed_demo.mjs https://your-app.vercel.app --days 14 --notify
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("http")) || "http://localhost:3000").replace(/\/$/, "");
const days = Number(args[args.indexOf("--days") + 1]) || 12;
const notify = args.includes("--notify");

function envLocal(name) {
  try {
    const m = readFileSync(path.join(here, "..", ".env.local"), "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}
const token = process.env.INGEST_TOKEN || envLocal("INGEST_TOKEN");
if (!token) {
  console.error("Need INGEST_TOKEN (env or .env.local)");
  process.exit(1);
}

const species = JSON.parse(readFileSync(path.join(here, "..", "src", "data", "species.json"), "utf8")).species;

// deterministic randomness so re-runs look the same
let seed = 20261113;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// Kampala day: a dawn chorus, a quiet midday, a dusk flurry.
function hourWeight(h) {
  const dawn = Math.exp(-((h - 6.5) ** 2) / 2.2);
  const dusk = 0.55 * Math.exp(-((h - 18) ** 2) / 2.5);
  const day = h >= 6 && h <= 19 ? 0.12 : 0.01;
  return dawn + dusk + day;
}
const hw = Array.from({ length: 24 }, (_, h) => hourWeight(h));
function randomTime(maxHour = 24) {
  let r = rnd() * hw.slice(0, maxHour).reduce((a, b) => a + b, 0);
  let h = 0;
  while (h < maxHour - 1 && r > hw[h]) r -= hw[h++];
  const mm = Math.floor(rnd() * 60);
  const ss = Math.floor(rnd() * 60);
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const tz = "Africa/Kampala";
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const hourNow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const today = fmt.format(new Date());
const dayKeys = Array.from({ length: days }, (_, i) => fmt.format(new Date(Date.now() - (days - 1 - i) * 86400000)));

const payloadDays = [];
for (let i = 0; i < dayKeys.length; i++) {
  const date = dayKeys[i];
  const isToday = date === today;
  const poolSize = 28 + i * 3; // the station "discovers" a few more species each day
  const pool = species.slice(0, poolSize);
  const dets = [];
  const nSpecies = 14 + Math.floor(rnd() * 12);
  const chosen = new Set();
  while (chosen.size < Math.min(nSpecies, pool.length)) {
    const idx = Math.floor(Math.pow(rnd(), 1.7) * pool.length);
    chosen.add(idx);
  }
  for (const idx of chosen) {
    const s = pool[idx];
    const calls = Math.max(1, Math.round(Math.pow(rnd(), 1.4) * (40 / (1 + idx / 8))));
    for (let k = 0; k < calls; k++) {
      const t = randomTime(isToday ? Math.max(1, hourNow + 1) : 24);
      if (isToday && Number(t.slice(0, 2)) > hourNow) continue;
      dets.push({ t, sci: s.sci, com: s.com, conf: Math.round((0.7 + rnd() * 0.29) * 1000) / 1000 });
    }
  }
  dets.sort((a, b) => a.t.localeCompare(b.t));
  payloadDays.push({ date, detections: dets });
}

async function post(body) {
  const r = await fetch(`${base}/api/ingest`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j)}`);
  return j;
}

const station = { name: "Kampala (demo)", lat: 0.2645, lon: 32.6346 };
for (let i = 0; i < payloadDays.length; i += 10) {
  const chunk = payloadDays.slice(i, i + 10);
  const res = await post({ demo: true, station, days: chunk });
  console.log(`posted ${chunk[0].date} .. ${chunk[chunk.length - 1].date}: ${res.days.map((d) => d.n).join(", ")} detections; ${res.species} species so far`);
}
if (notify) {
  const last = payloadDays[payloadDays.length - 1];
  const d = last.detections[last.detections.length - 1];
  if (d) {
    const res = await post({ demo: true, station, events: [{ type: "new_species", sci: d.sci, com: d.com, time: `${last.date} ${d.t}`, conf: d.conf }] });
    console.log(`sent a demo notification for ${d.com} to ${res.notified} subscriber(s)`);
  }
}
console.log(`done -> ${base}`);
