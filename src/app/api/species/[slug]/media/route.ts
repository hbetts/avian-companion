import { speciesBySlug } from "@/lib/species";
import { loadIndex } from "@/lib/detections";
import { describe } from "@/lib/species";
import { speciesMedia } from "@/lib/external";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  let info = speciesBySlug(slug);
  if (!info) {
    const index = await loadIndex();
    const hit = Object.entries(index.species).find(([sci, s]) => describe(sci, s.com).slug === slug);
    if (hit) info = { ...describe(hit[0], hit[1].com) };
  }
  if (!info) return Response.json({ error: "unknown bird" }, { status: 404 });
  const media = await speciesMedia(slug, info.sci, info.com);
  return Response.json(media, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
