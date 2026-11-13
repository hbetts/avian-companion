/** Shapes shared by the station forwarder, the API and the UI. */

export type Detection = {
  t: string; // "HH:MM:SS" station-local
  sci: string;
  com: string;
  conf: number; // 0..1
  file?: string; // BirdNET-Pi clip file name, if one was extracted
  clip?: string; // URL of an uploaded clip
};

export type DayFile = { date: string; detections: Detection[]; updated: string };

/** first/last are "YYYY-MM-DD HH:MM:SS" station-local. */
export type SpeciesIndex = { com: string; first: string; last: string; total: number };

export type IndexFile = {
  updated: string;
  demo?: boolean;
  station?: { name?: string; lat?: number; lon?: number };
  days: Record<string, { n: number; species: number }>;
  daily: Record<string, Record<string, number>>; // date -> sci -> count
  species: Record<string, SpeciesIndex>; // sci -> summary
};

export type BirdEvent = {
  type: "new_species" | "first_today";
  sci: string;
  com: string;
  time: string; // "YYYY-MM-DD HH:MM:SS"
  conf?: number;
};

/**
 * What the station posts. Each day is sent whole (the station's database is
 * the truth); the server derives the index from the days it has.
 */
export type IngestPayload = {
  station?: { name?: string; lat?: number; lon?: number };
  demo?: boolean;
  day?: { date: string; detections: Detection[] };
  days?: { date: string; detections: Detection[] }[];
  events?: BirdEvent[];
};

export type Range = "today" | "24h" | "week" | "month" | "all";
export const RANGES: Range[] = ["today", "24h", "week", "month", "all"];
export const RANGE_LABEL: Record<Range, string> = {
  today: "Today",
  "24h": "24 hours",
  week: "This week",
  month: "This month",
  all: "All time",
};

export type ArtDims = { w: number; h: number };

export type SpeciesSummary = {
  sci: string;
  com: string;
  slug: string;
  rank: number;
  art: { perched?: ArtDims; flight?: ArtDims };
  n: number;
  first: string | null; // ISO instant
  last: string | null; // ISO instant
  hours: number[]; // 24 buckets within the range (from day files only)
  best: number; // best confidence in range
  clip?: string; // most recent uploaded clip in range
};

/** Half-hour buckets through the station day: today so far, and the mean of the previous 7 days. */
export type Rhythm = { today: number[]; week: number[]; nowMinute: number; buckets: number };

export type DetectionsResponse = {
  range: Range;
  rhythm: Rhythm;
  now: string;
  tz: string;
  demo: boolean;
  lastHeard: string | null;
  totals: { detections: number; species: number };
  species: SpeciesSummary[];
};

export type DaySeries = { date: string; detections: number; species: number };

export type StatsResponse = {
  now: string;
  tz: string;
  demo: boolean;
  firstDay: string | null;
  today: { detections: number; species: number };
  week: { detections: number; species: number; newSpecies: number };
  allTime: { detections: number; species: number };
  busiestHour: number | null;
  hours: number[]; // last 7 days, 24 buckets
  rhythm: Rhythm;
  days: DaySeries[]; // last 30 days
  topWeek: { sci: string; com: string; slug: string; n: number; art: SpeciesSummary["art"] }[];
  newThisWeek: { sci: string; com: string; slug: string; first: string; art: SpeciesSummary["art"] }[];
  lifeList: { sci: string; com: string; slug: string; first: string; total: number; art: SpeciesSummary["art"] }[];
};

export type SpeciesDetail = {
  sci: string;
  com: string;
  slug: string;
  rank: number;
  art: SpeciesSummary["art"];
  today: number;
  week: number;
  total: number;
  first: string | null;
  last: string | null;
  hours: number[]; // last 7 days
  days: { date: string; n: number }[]; // last 30 days
  clips: { url: string; at: string; conf: number }[]; // newest first
  daysHeard: number;
  daysTotal: number;
  rarity: "common" | "regular" | "occasional" | "rare";
  station?: { name?: string; lat?: number; lon?: number };
};

export type SpeciesMedia = {
  fetched: string;
  wikipedia?: { title: string; url: string; extract: string; thumb?: string };
  rangeMap?: { url: string; page: string; credit?: string };
  gbif?: { key: number; family?: string; order?: string; genus?: string };
  call?: { url: string; credit: string; source: "xeno-canto" | "wikimedia"; page?: string };
  links: { label: string; url: string }[];
};
