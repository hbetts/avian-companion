# Connecting the station

The Raspberry Pi that runs BirdNET-Pi (with the AvianVisitors overlay) is the
source of truth. A small forwarder on the Pi posts each day's detections to the
web app once a minute, uploads a few recordings a day, and announces new birds
so the app can send notifications.

Nothing in BirdNET-Pi or AvianVisitors is changed: the forwarder only reads
`~/BirdNET-Pi/scripts/birds.db` and the extracted clips under `~/BirdSongs`.

## Install (on the Pi, over SSH)

```bash
curl -fsSL https://raw.githubusercontent.com/hbetts/avian-companion/main/station/forward.py -o ~/avian-forward.py
python3 ~/avian-forward.py          # writes ~/.avian-forward.json and stops
nano ~/.avian-forward.json          # set "url" and "token"
python3 ~/avian-forward.py --once   # sends everything once; check the app
```

`url` is the deployed app, for example `https://avian-companion.vercel.app`.
`token` is the app's `INGEST_TOKEN` (the same value set on Vercel).
Optional: `name`, `lat`, `lon` for the station, `clip_every_hours` (default 6).

Then run it as a service:

```bash
curl -fsSL https://raw.githubusercontent.com/hbetts/avian-companion/main/station/avian-forward.service \
  | sudo tee /etc/systemd/system/avian-forward@.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now avian-forward@$USER
journalctl -u avian-forward@$USER -f
```

## What it sends

- **Every minute:** today's detections, whole (`POST /api/ingest`, bearer token).
  Yesterday is re-sent for the first hour after midnight.
- **First run only:** every past day in the database, so the app's history and
  life list match the station's.
- **Recordings:** the most confident clip of each bird, at most once per
  `clip_every_hours` (`POST /api/ingest/clip`).
- **Events:** a bird heard for the first time ever, and each bird's first call
  of the day, within the last two hours. The app turns these into
  notifications according to each subscriber's preferences.

If the app held demo data, the first real post replaces it.

## Time zone

The Pi should be set to the station's zone (`sudo timedatectl set-timezone
Africa/Kampala`). The app reads `STATION_TZ` for the same zone.
