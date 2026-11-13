import { detectionsFor } from "@/lib/detections";
import { RANGES, type Range } from "@/lib/model";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const range = (url.searchParams.get("range") || "today") as Range;
  if (!RANGES.includes(range)) return Response.json({ error: "bad range" }, { status: 400 });
  const data = await detectionsFor(range);
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
