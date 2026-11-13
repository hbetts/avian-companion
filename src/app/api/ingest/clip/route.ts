import { hasToken, unauthorized } from "@/lib/auth";
import { putFile } from "@/lib/store";
import { slugify } from "@/lib/species";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * multipart/form-data: file (audio), date (YYYY-MM-DD), sci, time (HH:MM:SS).
 * Returns the public URL; the station then includes it as `clip` on that detection.
 */
export async function POST(req: Request) {
  if (!hasToken(req, "INGEST_TOKEN")) return unauthorized();
  const form = await req.formData();
  const file = form.get("file");
  const date = String(form.get("date") || "");
  const sci = String(form.get("sci") || "");
  const time = String(form.get("time") || "00:00:00");
  if (!(file instanceof File) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !sci) {
    return Response.json({ error: "need file, date, sci" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return Response.json({ error: "clip too large" }, { status: 413 });
  const ext = (file.name.split(".").pop() || "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  const key = `clips/${date}/${slugify(sci)}-${time.replace(/:/g, "")}.${ext}`;
  const type = file.type || (ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg");
  const url = await putFile(key, new Uint8Array(await file.arrayBuffer()), type);
  return Response.json({ ok: true, url });
}
