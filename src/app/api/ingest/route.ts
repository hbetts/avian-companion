import { hasToken, unauthorized } from "@/lib/auth";
import { storeDays, wipeAll } from "@/lib/detections";
import { notifyEvents } from "@/lib/push";
import type { IngestPayload } from "@/lib/model";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The station posts whole days here (see station/README.md). */
export async function POST(req: Request) {
  if (!hasToken(req, "INGEST_TOKEN")) return unauthorized();
  let payload: IngestPayload;
  try {
    payload = (await req.json()) as IngestPayload;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const days = [...(payload.days ?? []), ...(payload.day ? [payload.day] : [])];
  if (days.some((d) => !d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Array.isArray(d.detections))) {
    return Response.json({ error: "each day needs date and detections[]" }, { status: 400 });
  }
  const index = days.length ? await storeDays(days, { demo: !!payload.demo, station: payload.station }) : null;

  let notified = 0;
  if (payload.events?.length) {
    const origin = new URL(req.url).origin;
    notified = await notifyEvents(payload.events.slice(0, 50), process.env.PUBLIC_ORIGIN || origin);
  }
  return Response.json({
    ok: true,
    days: days.map((d) => ({ date: d.date, n: d.detections.length })),
    species: index ? Object.keys(index.species).length : undefined,
    notified,
  });
}

/** Wipe every day, clip and the index (admin token). Subscriptions are kept. */
export async function DELETE(req: Request) {
  if (!hasToken(req, "ADMIN_TOKEN")) return unauthorized();
  const removed = await wipeAll();
  return Response.json({ ok: true, removed });
}
