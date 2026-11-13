import { speciesDetail } from "@/lib/detections";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const detail = await speciesDetail(slug);
  if (!detail) return Response.json({ error: "unknown bird" }, { status: 404 });
  return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
}
