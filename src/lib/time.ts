import { STATION_TZ } from "./config";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: STATION_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD for an instant, in the station's time zone. */
export function dayKey(d: Date = new Date()): string {
  return dayFmt.format(d);
}

/** Offset (ms) of the station zone at the given instant. */
function zoneOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - at.getTime();
}

/** Station-local "YYYY-MM-DD" + "HH:MM:SS" -> instant (ms since epoch). */
export function localToMs(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0);
  const off = zoneOffsetMs(new Date(guess));
  return guess - off;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The last n day keys ending today, oldest first. */
export function lastDays(n: number, today = dayKey()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

export function hourOf(time: string): number {
  return Math.min(23, Math.max(0, Number(time.slice(0, 2)) || 0));
}
