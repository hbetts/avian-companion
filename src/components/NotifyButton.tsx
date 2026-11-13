"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type State = "loading" | "unsupported" | "install" | "off" | "on" | "denied" | "busy";
type Prefs = { newSpecies: boolean; firstToday: boolean };

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const PREFS_KEY = "visitors.notify.prefs";

export function NotifyButton() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>("loading");
  const [prefs, setPrefs] = useState<Prefs>({ newSpecies: true, firstToday: false });
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/push").then((r) => r.json()).catch(() => null);
      try {
        const p = localStorage.getItem(PREFS_KEY);
        if (p) setPrefs(JSON.parse(p));
      } catch {}
      setPublicKey(r?.publicKey ?? null);
      if (!r?.enabled) return setState("unsupported");
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches;
        return setState(iOS && !standalone ? "install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const savePrefs = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {}
  };

  const subscribe = async (p = prefs) => {
    if (!publicKey) return;
    setState("busy");
    setNote(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) }));
      const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON(), prefs: p }) });
      if (!r.ok) throw new Error("server said no");
      setState("on");
    } catch (e) {
      setNote(`Could not turn notifications on (${(e as Error).message}).`);
      setState("off");
    }
  };

  const unsubscribe = async () => {
    setState("busy");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
    setState("off");
  };

  const test = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test", endpoint: sub.endpoint }) }).then((r) => r.json());
    setNote(r.ok ? "Test sent. It should arrive in a moment." : "The test could not be sent.");
  };

  const toggle = (k: keyof Prefs) => {
    const p = { ...prefs, [k]: !prefs[k] };
    savePrefs(p);
    if (state === "on") subscribe(p);
  };

  const on = state === "on";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="pressable w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: open ? "var(--paper-3)" : "transparent", color: on ? "var(--ink)" : "var(--ink-2)" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
          {on && <circle cx="18" cy="6" r="3" fill="var(--seal)" stroke="none" />}
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notification settings"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.15 } }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 mt-2 w-[300px] max-w-[calc(100vw-32px)] sheet rounded-2xl p-4 z-50 text-sm"
          >
            <div className="display text-lg mb-1">Tell me about new birds</div>
            <p className="mb-3" style={{ color: "var(--ink-2)" }}>
              A short note on this device when the frame hears something.
            </p>
            {state === "unsupported" && <p style={{ color: "var(--ink-soft)" }}>This browser cannot receive notifications.</p>}
            {state === "install" && (
              <p style={{ color: "var(--ink-2)" }}>
                On iPhone, first add Visitors to your Home Screen (Share → Add to Home Screen), then open it from there and come back here.
              </p>
            )}
            {state === "denied" && <p style={{ color: "var(--ink-2)" }}>Notifications are blocked for this site in your browser settings.</p>}
            {(state === "off" || state === "on" || state === "busy") && (
              <>
                <label className="flex items-center justify-between py-2 gap-3">
                  <span>A bird never heard before</span>
                  <Switch checked={prefs.newSpecies} onChange={() => toggle("newSpecies")} />
                </label>
                <label className="flex items-center justify-between py-2 gap-3 border-t hairline">
                  <span>Each bird’s first call of the day</span>
                  <Switch checked={prefs.firstToday} onChange={() => toggle("firstToday")} />
                </label>
                <div className="flex gap-2 mt-3">
                  {on ? (
                    <>
                      <button type="button" onClick={unsubscribe} className="pressable flex-1 rounded-full py-2 font-medium" style={{ background: "var(--paper-3)" }}>
                        Turn off
                      </button>
                      <button type="button" onClick={test} className="pressable flex-1 rounded-full py-2 font-medium" style={{ background: "var(--paper-3)" }}>
                        Send a test
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={state === "busy"} onClick={() => subscribe()} className="pressable flex-1 rounded-full py-2 font-medium" style={{ background: "var(--ink)", color: "var(--paper)" }}>
                      {state === "busy" ? "One moment…" : "Turn on"}
                    </button>
                  )}
                </div>
              </>
            )}
            {note && <p className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>{note}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative shrink-0 w-11 h-7 rounded-full"
      style={{ background: checked ? "var(--ink)" : "var(--paper-3)", transition: "background 180ms ease" }}
    >
      <motion.span
        layout
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        className="absolute top-0.5 w-6 h-6 rounded-full"
        style={{ left: checked ? 18 : 2, background: checked ? "var(--paper)" : "var(--paper)", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
      />
    </button>
  );
}
