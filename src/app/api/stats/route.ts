import { statsFor } from "@/lib/detections";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await statsFor(), { headers: { "Cache-Control": "no-store" } });
}
