import { timingSafeEqual } from "node:crypto";

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function bearer(req: Request): string {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export function hasToken(req: Request, envName: "INGEST_TOKEN" | "ADMIN_TOKEN"): boolean {
  const expected = process.env[envName];
  if (!expected) return false;
  return same(bearer(req), expected);
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
