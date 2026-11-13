const TZ = process.env.NEXT_PUBLIC_STATION_TZ || "Africa/Kampala";

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(opts.year ? { year: "numeric" } : {}),
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${fmtDate(iso)} · ${fmtTime(iso)}`;
}

/** "YYYY-MM-DD" (station-local) to a short label like "13 Nov". */
export function fmtDay(day: string, withWeekday = false): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", ...(withWeekday ? { weekday: "short" } : {}) }).format(date);
}

export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "not yet";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
