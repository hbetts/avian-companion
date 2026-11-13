# Visitors

A companion web app for the bird frame: the same collage of birds heard at the
window that the e-ink frame shows, with more range (today, 24 hours, week,
month, all time), a page for every bird (its calls, where it lives, when it
sings, links to Wikipedia, eBird and the Cornell Lab), stats, and notifications
when a new bird is heard.

Built with Next.js, Motion (springs, interruptible sheets, shared-element
transitions), Tailwind, Vercel Blob and Web Push. Artwork is the same
woodblock-style cut-outs the frame uses.

```
station/forward.py  (on the BirdNET-Pi)  --POST /api/ingest-->  Vercel  --push-->  phones
                                          --POST /api/ingest/clip-->
```

## Run it locally

```bash
npm install
cp .env.example .env.local     # fill in the tokens (see below)
npm run dev
node scripts/seed_demo.mjs     # example birds for the last 12 days
```

Open http://localhost:3000. Without `BLOB_READ_WRITE_TOKEN` the data lives in `.data/`.

## Environment variables

| Name | What it is |
|---|---|
| `INGEST_TOKEN` | Shared secret the station sends as `Authorization: Bearer …` |
| `ADMIN_TOKEN` | Secret for `DELETE /api/ingest` (wipe data; `scripts/reset.mjs`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push keys (`npx web-push generate-vapid-keys`) |
| `VAPID_SUBJECT` | `mailto:` or `https://` contact for the push service |
| `BLOB_READ_WRITE_TOKEN` | Set automatically when a Vercel Blob store is connected |
| `STATION_TZ` | Station time zone, default `Africa/Kampala` |
| `NEXT_PUBLIC_STATION_NAME` | Shown in the header, default `Kampala` |
| `XC_API_KEY` | Optional xeno-canto key for better reference recordings |

## Connect the frame's Raspberry Pi

See [station/README.md](station/README.md). The forwarder is one Python file
with no dependencies; it posts whole days, so the app always mirrors the
station's database. The first real post replaces any demo data.

## Artwork

`scripts/import_art.py` builds `public/birds/*.webp` and `src/data/species.json`
from the cut-out paintings in the sibling `jona-present` folders. Re-run it when
more birds have been painted and cut out, then commit.

## API

| Route | Purpose |
|---|---|
| `GET /api/detections?range=today\|24h\|week\|month\|all` | Species heard in the range, sized for the collage |
| `GET /api/species/:slug` | Counts, first/last heard, hourly rhythm, 30-day history, uploaded clips |
| `GET /api/species/:slug/media` | Wikipedia summary, range map, reference call, links (cached 30 days) |
| `GET /api/stats` | Tiles and charts for the Stats page |
| `POST /api/ingest` | Station posts `{ days: [{date, detections}], events }` |
| `POST /api/ingest/clip` | Station uploads a recording (multipart) |
| `GET/POST/DELETE /api/push` | Web Push subscription management |

## Credits

Collage idea, frame and woodblock bundles: [AvianVisitors](https://github.com/Twarner491/AvianVisitors)
by Teddy Warner. Handwritten labels: Caveat (OFL). Reference material from
Wikipedia, Wikidata/Wikimedia Commons and xeno-canto, credited in place.
