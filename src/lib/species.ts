import data from "@/data/species.json";

export type ArtDims = { w: number; h: number };
export type Species = {
  sci: string;
  com: string;
  slug: string;
  rank: number;
  art: { perched?: ArtDims; flight?: ArtDims };
};

const list = (data as { species: Species[] }).species;
const bySci = new Map(list.map((s) => [s.sci.toLowerCase(), s]));
const bySlug = new Map(list.map((s) => [s.slug, s]));

export const allSpecies = list;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function speciesBySci(sci: string): Species | undefined {
  return bySci.get(sci.toLowerCase()) ?? bySlug.get(slugify(sci));
}
export function speciesBySlug(slug: string): Species | undefined {
  return bySlug.get(slug);
}

/** Names, slug and art for a bird, with a generic entry for species outside the Uganda list. */
export function describe(sci: string, com?: string) {
  const s = speciesBySci(sci);
  return {
    sci,
    com: s?.com ?? com ?? sci,
    slug: s?.slug ?? slugify(sci),
    rank: s?.rank ?? 9999,
    art: s?.art ?? {},
  };
}

export function artUrl(slug: string, pose: "perched" | "flight" = "perched") {
  return `/birds/${slug}${pose === "flight" ? "-2" : ""}.webp`;
}
