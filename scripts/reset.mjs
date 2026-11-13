#!/usr/bin/env node
/** Remove every detection, clip and the index. Keeps notification subscriptions.
 *    node scripts/reset.mjs [https://your-app.vercel.app]      (ADMIN_TOKEN from env or .env.local) */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.argv.slice(2).find((a) => a.startsWith("http")) || "http://localhost:3000").replace(/\/$/, "");
let token = process.env.ADMIN_TOKEN;
if (!token) {
  try {
    token = readFileSync(path.join(here, "..", ".env.local"), "utf8").match(/^ADMIN_TOKEN=(.*)$/m)?.[1]?.trim();
  } catch {}
}
if (!token) {
  console.error("Need ADMIN_TOKEN");
  process.exit(1);
}
const r = await fetch(`${base}/api/ingest`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
console.log(r.status, await r.text());
