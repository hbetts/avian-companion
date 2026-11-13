#!/usr/bin/env python3
"""Forward BirdNET-Pi detections to the Visitors web app.

Runs on the Raspberry Pi next to BirdNET-Pi / AvianVisitors. Once a minute it
reads today's detections from BirdNET-Pi's SQLite database and posts the whole
day to the app, so the app always mirrors what the station knows. On the first
run it also sends every past day it finds. It uploads a short recording for
each bird a few times a day, and tells the app when a bird is heard for the
first time (ever, or today) so the app can send notifications.

Standard library only. Configure with ~/.avian-forward.json (see README.md).
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import mimetypes
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

HOME = Path.home()
CONFIG_PATH = Path(os.environ.get("AVIAN_FORWARD_CONFIG", HOME / ".avian-forward.json"))
STATE_PATH = Path(os.environ.get("AVIAN_FORWARD_STATE", HOME / ".avian-forward.state.json"))

DEFAULTS = {
    "url": "https://your-app.vercel.app",
    "token": "",
    "db": str(HOME / "BirdNET-Pi" / "scripts" / "birds.db"),
    "clips_dir": str(HOME / "BirdSongs" / "Extracted" / "By_Date"),
    "interval": 60,            # seconds between posts
    "clip_every_hours": 6,     # upload at most one clip per bird per this many hours
    "max_clips_per_cycle": 3,
    "name": "Kampala",
    "lat": None,
    "lon": None,
}


def log(msg: str) -> None:
    print(f"{dt.datetime.now():%H:%M:%S} {msg}", flush=True)


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    os.replace(tmp, path)


class Station:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.state = load_json(STATE_PATH, {"backfilled": False, "clips": {}, "notified_new": [], "notified_today": {}, "counts": {}})

    # ---------- database ----------
    def db(self):
        con = sqlite3.connect(f"file:{self.cfg['db']}?mode=ro", uri=True, timeout=10)
        con.row_factory = sqlite3.Row
        return con

    def dates(self) -> list[str]:
        with self.db() as con:
            return [r[0] for r in con.execute("SELECT DISTINCT Date FROM detections ORDER BY Date")]

    def day(self, date: str) -> list[dict]:
        with self.db() as con:
            rows = con.execute(
                "SELECT Time, Sci_Name, Com_Name, Confidence, File_Name FROM detections WHERE Date=? ORDER BY Time", (date,)
            ).fetchall()
        out = []
        for r in rows:
            d = {"t": r["Time"][:8], "sci": r["Sci_Name"], "com": r["Com_Name"], "conf": round(float(r["Confidence"] or 0), 3)}
            if r["File_Name"]:
                d["file"] = r["File_Name"]
            clip = self.state["clips"].get(r["Sci_Name"])
            if clip and clip.get("date") == date and clip.get("time") == d["t"]:
                d["clip"] = clip["url"]
            out.append(d)
        return out

    def first_seen(self) -> dict[str, str]:
        with self.db() as con:
            return {r[0]: r[1] for r in con.execute("SELECT Sci_Name, MIN(Date||' '||Time) FROM detections GROUP BY Sci_Name")}

    # ---------- http ----------
    def post(self, payload: dict) -> dict:
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"{self.cfg['url'].rstrip('/')}/api/ingest", data=body, method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.cfg['token']}"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")

    def upload_clip(self, path: Path, date: str, sci: str, t: str) -> str | None:
        boundary = uuid.uuid4().hex
        ctype = mimetypes.guess_type(path.name)[0] or "audio/mpeg"
        parts = []
        for k, v in (("date", date), ("sci", sci), ("time", t)):
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: {ctype}\r\n\r\n".encode()
            + path.read_bytes() + b"\r\n"
        )
        parts.append(f"--{boundary}--\r\n".encode())
        req = urllib.request.Request(
            f"{self.cfg['url'].rstrip('/')}/api/ingest/clip", data=b"".join(parts), method="POST",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Authorization": f"Bearer {self.cfg['token']}"},
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"{}").get("url")

    # ---------- the work ----------
    def clip_path(self, date: str, com: str, file_name: str) -> Path | None:
        base = Path(self.cfg["clips_dir"]) / date
        for folder in (com.replace(" ", "_"), com.replace(" ", "_").replace("'", ""), com):
            p = base / folder / file_name
            if p.exists():
                return p
        hits = glob.glob(str(base / "*" / glob.escape(file_name)))
        return Path(hits[0]) if hits else None

    def maybe_upload_clips(self, date: str, dets: list[dict]) -> int:
        now = time.time()
        max_age = float(self.cfg["clip_every_hours"]) * 3600
        uploaded = 0
        best: dict[str, dict] = {}
        for d in dets:
            if d.get("file") and (d["sci"] not in best or d["conf"] > best[d["sci"]]["conf"]):
                best[d["sci"]] = d
        for sci, d in sorted(best.items(), key=lambda kv: -kv[1]["conf"]):
            if uploaded >= int(self.cfg["max_clips_per_cycle"]):
                break
            prev = self.state["clips"].get(sci)
            if prev and now - prev.get("uploaded_at", 0) < max_age:
                continue
            path = self.clip_path(date, d["com"], d["file"])
            if not path:
                continue
            try:
                url = self.upload_clip(path, date, sci, d["t"])
            except (urllib.error.URLError, OSError) as e:
                log(f"clip upload failed for {d['com']}: {e}")
                continue
            if url:
                self.state["clips"][sci] = {"date": date, "time": d["t"], "url": url, "uploaded_at": now}
                d["clip"] = url
                uploaded += 1
                log(f"uploaded clip: {d['com']} {d['t']}")
        return uploaded

    def events_for(self, today: str, dets: list[dict]) -> list[dict]:
        """Birds heard for the first time ever / first time today, not yet announced."""
        events = []
        first = self.first_seen()
        seen_today = self.state["notified_today"].setdefault(today, [])
        # only announce recent calls, so a restart does not replay the whole morning
        now = dt.datetime.now()
        for d in dets:
            when = dt.datetime.strptime(f"{today} {d['t']}", "%Y-%m-%d %H:%M:%S")
            if (now - when).total_seconds() > 2 * 3600:
                continue
            stamp = f"{today} {d['t']}"
            if first.get(d["sci"]) == stamp and d["sci"] not in self.state["notified_new"]:
                events.append({"type": "new_species", "sci": d["sci"], "com": d["com"], "time": stamp, "conf": d["conf"]})
                self.state["notified_new"].append(d["sci"])
                seen_today.append(d["sci"])
            elif d["sci"] not in seen_today:
                events.append({"type": "first_today", "sci": d["sci"], "com": d["com"], "time": stamp, "conf": d["conf"]})
                seen_today.append(d["sci"])
        for k in [k for k in self.state["notified_today"] if k < today]:
            del self.state["notified_today"][k]
        return events

    def station(self) -> dict:
        s = {"name": self.cfg.get("name")}
        if self.cfg.get("lat") is not None:
            s["lat"], s["lon"] = self.cfg["lat"], self.cfg["lon"]
        return s

    def backfill(self) -> None:
        dates = self.dates()
        log(f"first run: sending {len(dates)} past days")
        for i in range(0, len(dates), 20):
            chunk = [{"date": d, "detections": self.day(d)} for d in dates[i:i + 20]]
            self.post({"station": self.station(), "days": chunk})
            log(f"  sent {chunk[0]['date']} .. {chunk[-1]['date']}")
        for d in self.first_seen():
            if d not in self.state["notified_new"]:
                self.state["notified_new"].append(d)  # history is not news
        self.state["backfilled"] = True
        save_json(STATE_PATH, self.state)

    def cycle(self) -> None:
        today = dt.date.today().isoformat()
        yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
        dets = self.day(today)
        self.maybe_upload_clips(today, dets)
        days = [{"date": today, "detections": dets}]
        # the day after midnight, keep yesterday in sync while late rows arrive
        if dt.datetime.now().hour < 1 or self.state["counts"].get(yesterday, -1) != len(self.day(yesterday)):
            ydets = self.day(yesterday)
            if ydets or yesterday in self.state["counts"]:
                days.append({"date": yesterday, "detections": ydets})
                self.state["counts"][yesterday] = len(ydets)
        events = self.events_for(today, dets)
        res = self.post({"station": self.station(), "days": days, "events": events})
        self.state["counts"][today] = len(dets)
        save_json(STATE_PATH, self.state)
        extra = f", {res.get('notified', 0)} notified" if events else ""
        log(f"sent {today}: {len(dets)} detections, {res.get('species', '?')} species all time{extra}")

    def run(self) -> None:
        while True:
            try:
                if not self.state["backfilled"]:
                    self.backfill()
                self.cycle()
            except urllib.error.HTTPError as e:
                log(f"server error {e.code}: {e.read()[:200]!r}")
            except (urllib.error.URLError, sqlite3.Error, OSError) as e:
                log(f"error: {e}")
            time.sleep(int(self.cfg["interval"]))


def main() -> int:
    cfg = {**DEFAULTS, **load_json(CONFIG_PATH, {})}
    if not cfg["token"] or "your-app" in cfg["url"]:
        print(f"Edit {CONFIG_PATH}: set url and token (see station/README.md)", file=sys.stderr)
        if not CONFIG_PATH.exists():
            save_json(CONFIG_PATH, DEFAULTS)
        return 2
    if "--once" in sys.argv:
        st = Station(cfg)
        if not st.state["backfilled"]:
            st.backfill()
        st.cycle()
        return 0
    Station(cfg).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
