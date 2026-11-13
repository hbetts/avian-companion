"use client";
import { useEffect, useRef, useState } from "react";

function mmss(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function AudioPlayer({ src, title, credit, href }: { src: string; title: string; credit?: string; href?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onT = () => setT(a.currentTime);
    const onD = () => setDur(a.duration || 0);
    const onEnd = () => setPlaying(false);
    const onErr = () => setErr(true);
    a.addEventListener("timeupdate", onT);
    a.addEventListener("durationchange", onD);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onT);
      a.removeEventListener("durationchange", onD);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
    };
  }, [src]);

  const toggle = async () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      document.querySelectorAll("audio").forEach((o) => o !== a && o.pause());
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setErr(true);
      }
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="card p-3 flex items-center gap-3">
      <audio ref={ref} src={src} preload="metadata" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
        className="pressable shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M4 2.8v10.4c0 .8.9 1.3 1.6.9l8-5.2c.6-.4.6-1.3 0-1.7l-8-5.2C4.9 1.5 4 2 4 2.8z" /></svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-xs tabular-nums shrink-0" style={{ color: "var(--ink-soft)" }}>
            {mmss(t)} / {mmss(dur)}
          </div>
        </div>
        <input
          type="range"
          className="scrub"
          min={0}
          max={dur || 1}
          step={0.1}
          value={Math.min(t, dur || 1)}
          onChange={(e) => {
            const a = ref.current;
            if (a) a.currentTime = Number(e.target.value);
          }}
          aria-label={`Position in ${title}`}
        />
        {(credit || err) && (
          <div className="text-xs truncate" style={{ color: err ? "var(--seal)" : "var(--ink-soft)" }}>
            {err ? "This recording could not be played." : href ? <a href={href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{credit}</a> : credit}
          </div>
        )}
      </div>
    </div>
  );
}
