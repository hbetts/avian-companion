/**
 * Small key/value + file store. On Vercel it uses Vercel Blob; locally it
 * writes to .data/. Every object is overwritten whole (the station is the
 * single source of truth), so staleness of up to a minute is acceptable and
 * there are no read-modify-write races to protect.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

type BlobModule = typeof import("@vercel/blob");
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL = path.join(process.cwd(), ".data");

let blobMod: BlobModule | null = null;
async function blob(): Promise<BlobModule> {
  if (!blobMod) blobMod = await import("@vercel/blob");
  return blobMod;
}

let baseUrl: string | null = null;
function baseFrom(url: string, pathname: string) {
  return url.slice(0, url.length - pathname.length).replace(/\/$/, "");
}
async function discoverBase(): Promise<string | null> {
  if (baseUrl) return baseUrl;
  const { list } = await blob();
  const res = await list({ limit: 1 });
  const first = res.blobs[0];
  if (first) baseUrl = baseFrom(first.url, first.pathname);
  return baseUrl;
}

const memo = new Map<string, { at: number; value: unknown }>();
const MEMO_MS = 15_000;

export async function getJSON<T>(key: string, { fresh = false } = {}): Promise<T | null> {
  const hit = memo.get(key);
  if (!fresh && hit && Date.now() - hit.at < MEMO_MS) return hit.value as T | null;
  let value: T | null = null;
  if (useBlob) {
    const base = await discoverBase();
    if (base) {
      const r = await fetch(`${base}/${key}`, { cache: "no-store" });
      if (r.ok) value = (await r.json()) as T;
      else if (r.status !== 404) throw new Error(`blob read ${key}: ${r.status}`);
    }
  } else {
    try {
      value = JSON.parse(await fs.readFile(path.join(LOCAL, key), "utf8")) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  memo.set(key, { at: Date.now(), value });
  return value;
}

export async function putJSON(key: string, value: unknown): Promise<void> {
  memo.set(key, { at: Date.now(), value });
  const body = JSON.stringify(value);
  if (useBlob) {
    const { put } = await blob();
    const res = await put(key, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
    if (!baseUrl) baseUrl = baseFrom(res.url, res.pathname);
  } else {
    const p = path.join(LOCAL, key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
}

/** Store a binary file; returns a URL the browser can play or load. */
export async function putFile(key: string, data: Uint8Array, contentType: string): Promise<string> {
  if (useBlob) {
    const { put } = await blob();
    const res = await put(key, Buffer.from(data), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return res.url;
  }
  const p = path.join(LOCAL, key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, Buffer.from(data));
  return `/api/file/${key}`;
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(LOCAL, key));
  } catch {
    return null;
  }
}

export async function listKeys(prefix: string): Promise<string[]> {
  if (useBlob) {
    const { list } = await blob();
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix, cursor, limit: 1000 });
      out.push(...res.blobs.map((b) => b.pathname));
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(LOCAL, prefix);
  const out: string[] = [];
  async function walk(d: string) {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(path.relative(LOCAL, full).split(path.sep).join("/"));
    }
  }
  await walk(dir);
  return out;
}

export async function deleteKeys(keys: string[]): Promise<void> {
  for (const k of keys) memo.delete(k);
  if (!keys.length) return;
  if (useBlob) {
    const { del } = await blob();
    const base = await discoverBase();
    if (base) await del(keys.map((k) => `${base}/${k}`));
  } else {
    await Promise.all(keys.map((k) => fs.rm(path.join(LOCAL, k), { force: true })));
  }
}

export function clearMemo() {
  memo.clear();
}
