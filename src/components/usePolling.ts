"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Fetch JSON now and again every `everyMs`, and whenever the tab comes back. */
export function usePolling<T>(url: string | null, everyMs = 60_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!url) return;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = (await r.json()) as T;
      if (alive.current) {
        setData(j);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(String((e as Error).message || e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    const first = setTimeout(load, 0);
    const id = setInterval(load, everyMs);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, everyMs]);

  return { data, error, loading, reload: load };
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}
