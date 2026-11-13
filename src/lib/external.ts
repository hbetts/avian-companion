/**
 * Public reference material for a species: a Wikipedia summary, a range map
 * from Wikidata/Commons, a reference recording (xeno-canto if a key is set,
 * otherwise Wikimedia Commons), and outbound links. Cached for 30 days.
 */
import { getJSON, putJSON } from "./store";
import type { SpeciesMedia } from "./model";

const UA = "avian-companion/1.0 (bird frame companion app)";
const TTL_MS = 30 * 24 * 3600 * 1000;

async function json<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

type WikiSummary = {
  title: string;
  extract: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page: string } };
  type?: string;
};

/** The whole lead section as plain text (the summary endpoint only gives the first paragraph). */
async function wikipediaIntro(title: string): Promise<string | undefined> {
  const r = await json<{ query?: { pages?: Record<string, { extract?: string }> } }>(
    `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`,
  );
  const page = Object.values(r?.query?.pages ?? {})[0];
  const text = page?.extract?.trim();
  return text && text.length > 40 ? text : undefined;
}

async function wikipedia(sci: string, com: string) {
  for (const q of [sci, com]) {
    const s = await json<WikiSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.replace(/ /g, "_"))}`);
    if (s && s.type !== "disambiguation" && s.extract) {
      const intro = await wikipediaIntro(s.title);
      return {
        title: s.title,
        url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(q.replace(/ /g, "_"))}`,
        extract: intro && intro.length > s.extract.length ? intro : s.extract,
        ...(s.thumbnail?.source ? { thumb: s.thumbnail.source } : {}),
      };
    }
  }
  return undefined;
}

type Claims = Record<string, { mainsnak?: { datavalue?: { value: unknown } } }[]>;

async function wikidata(sci: string): Promise<Claims | null> {
  const search = await json<{ search?: { id: string }[] }>(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=1&search=${encodeURIComponent(sci)}`,
  );
  const id = search?.search?.[0]?.id;
  if (!id) return null;
  const ent = await json<{ entities?: Record<string, { claims?: Claims }> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${id}`,
  );
  return ent?.entities?.[id]?.claims ?? null;
}

const claimStr = (c: Claims | null, p: string): string | undefined => {
  const v = c?.[p]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === "string" ? v : undefined;
};
const commonsFile = (name: string, width?: number) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name.replace(/ /g, "_"))}${width ? `?width=${width}` : ""}`;
const commonsPage = (name: string) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name.replace(/ /g, "_"))}`;

type XC = { recordings?: { file: string; rec: string; cnt: string; url: string; lic: string; q: string; type: string }[] };

async function xenoCanto(sci: string) {
  const key = process.env.XC_API_KEY;
  if (!key) return undefined;
  const q = `sp:"${sci}" q:A len:5-90`;
  const data = await json<XC>(`https://xeno-canto.org/api/3/recordings?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`);
  const recs = data?.recordings ?? [];
  const pick = recs.find((r) => /song|call/i.test(r.type)) ?? recs[0];
  if (!pick?.file) return undefined;
  const page = pick.url.startsWith("//") ? `https:${pick.url}` : pick.url;
  return { url: pick.file.startsWith("//") ? `https:${pick.file}` : pick.file, credit: `${pick.rec} · xeno-canto (${pick.cnt})`, source: "xeno-canto" as const, page };
}

type GbifMatch = { usageKey?: number; matchType?: string; family?: string; order?: string; genus?: string };

/** GBIF taxon key, used for the uniform occurrence map, plus family and order. */
async function gbif(sci: string): Promise<SpeciesMedia["gbif"] | undefined> {
  const m = await json<GbifMatch>(`https://api.gbif.org/v1/species/match?rank=SPECIES&name=${encodeURIComponent(sci)}`);
  if (!m?.usageKey || m.matchType === "NONE" || m.matchType === "HIGHERRANK") return undefined;
  return {
    key: m.usageKey,
    ...(m.family ? { family: m.family } : {}),
    ...(m.order ? { order: m.order } : {}),
    ...(m.genus ? { genus: m.genus } : {}),
  };
}

export async function speciesMedia(slug: string, sci: string, com: string): Promise<SpeciesMedia> {
  const key = `meta/${slug}.json`;
  const cached = await getJSON<SpeciesMedia>(key);
  // entries cached before the GBIF map existed are refreshed
  if (cached && cached.gbif !== undefined && Date.now() - new Date(cached.fetched).getTime() < TTL_MS) return cached;

  const [wiki, claims, xc, gb] = await Promise.all([wikipedia(sci, com), wikidata(sci), xenoCanto(sci), gbif(sci)]);
  const rangeFile = claimStr(claims, "P181");
  const audioFile = claimStr(claims, "P51");
  const ebird = claimStr(claims, "P3444");
  const inat = claimStr(claims, "P3151");
  const xcSlug = sci.trim().replace(/\s+/g, "-");

  const links: SpeciesMedia["links"] = [];
  if (wiki) links.push({ label: "Wikipedia", url: wiki.url });
  if (ebird) {
    links.push({ label: "eBird", url: `https://ebird.org/species/${ebird}` });
    links.push({ label: "Birds of the World (Cornell Lab)", url: `https://birdsoftheworld.org/bow/species/${ebird}/cur/introduction` });
    links.push({ label: "Macaulay Library recordings", url: `https://search.macaulaylibrary.org/catalog?taxonCode=${ebird}&mediaType=audio` });
  } else {
    links.push({ label: "eBird", url: `https://ebird.org/explore?q=${encodeURIComponent(com)}` });
  }
  links.push({ label: "xeno-canto recordings", url: `https://xeno-canto.org/species/${xcSlug}` });
  if (inat) links.push({ label: "iNaturalist", url: `https://www.inaturalist.org/taxa/${inat}` });

  const media: SpeciesMedia = {
    fetched: new Date().toISOString(),
    ...(wiki ? { wikipedia: wiki } : {}),
    ...(gb ? { gbif: gb } : {}),
    ...(rangeFile ? { rangeMap: { url: commonsFile(rangeFile, 1000), page: commonsPage(rangeFile), credit: "Wikimedia Commons" } } : {}),
    ...(xc
      ? { call: xc }
      : audioFile
        ? { call: { url: commonsFile(audioFile), credit: "Wikimedia Commons", source: "wikimedia" as const, page: commonsPage(audioFile) } }
        : {}),
    links,
  };
  // only cache a useful answer for the full period; thin answers retry sooner
  if (wiki || rangeFile || media.call || gb) await putJSON(key, media);
  else await putJSON(key, { ...media, fetched: new Date(Date.now() - TTL_MS + 6 * 3600 * 1000).toISOString() });
  return media;
}
