import { readLocalFile } from "@/lib/store";

export const runtime = "nodejs";

const types: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", json: "application/json" };

/** Serves files from .data/ when running without Vercel Blob (local development). */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const key = path.join("/");
  if (key.includes("..")) return new Response("bad path", { status: 400 });
  const buf = await readLocalFile(key);
  if (!buf) return new Response("not found", { status: 404 });
  const ext = key.split(".").pop() || "";
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" } });
}
