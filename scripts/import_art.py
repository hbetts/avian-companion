"""Build the web-sized bird artwork and species table for the companion app.

Reads the Uganda species list and every cut-out painting it can find, trims
each bird to its outline, shrinks it to web size and writes:
  public/birds/<slug>.webp      perched pose
  public/birds/<slug>-2.webp    flight pose
  src/data/species.json         every Uganda species, its rank, and which art exists
  public/icons/*.png            app icons built from the Common Bulbul

Safe to re-run: unchanged sources are skipped. Run it again whenever more
paintings have been cut out.

  python scripts/import_art.py            (from avian-companion; uses ../ paths)
"""
from __future__ import annotations
import json, os, re, sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent.parent          # avian-companion
ROOT = HERE.parent                                     # jona-present
ILLUS = ROOT / "avian-art" / "avian" / "assets" / "illustrations"
SOURCES = [                                            # best first
    ILLUS / "Uganda",
    ROOT / "emulator" / "cache" / "cutouts",
    ROOT / "cutwork",
    ILLUS,
]
SPECIES = ROOT / "uganda_species.txt"
OUT = HERE / "public" / "birds"
ICONS = HERE / "public" / "icons"
DATA = HERE / "src" / "data" / "species.json"
MAX_SIDE = 640

slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def is_cut(p: Path) -> bool:
    try:
        with Image.open(p) as im:
            return im.mode == "RGBA" and im.getchannel("A").getextrema()[0] == 0
    except Exception:
        return False


def find(stem: str) -> Path | None:
    for d in SOURCES:
        p = d / f"{stem}.png"
        if p.exists() and is_cut(p):
            return p
    return None


def convert(src: Path, dst: Path) -> tuple[int, int]:
    with Image.open(src) as im:
        im = im.convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        if bbox:
            im = im.crop(bbox)
        scale = min(1.0, MAX_SIDE / max(im.size))
        if scale < 1.0:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_suffix(".tmp.webp")
        im.save(tmp, "WEBP", quality=84, method=6)
        os.replace(tmp, dst)
        return im.size


def icons(bird: Path | None):
    ICONS.mkdir(parents=True, exist_ok=True)
    for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (512, "maskable-512.png")):
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        r = size * (0 if name.startswith("maskable") else 0.22)
        d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=(246, 241, 231, 255))
        if bird:
            with Image.open(bird) as b:
                b = b.convert("RGBA")
                bbox = b.getchannel("A").getbbox()
                if bbox:
                    b = b.crop(bbox)
                pad = size * (0.16 if name.startswith("maskable") else 0.12)
                box = size - 2 * pad
                sc = min(box / b.width, box / b.height)
                b = b.resize((max(1, round(b.width * sc)), max(1, round(b.height * sc))), Image.LANCZOS)
                im.alpha_composite(b, (round((size - b.width) / 2), round((size - b.height) / 2)))
        im.save(ICONS / name, "PNG")


def main() -> int:
    rows = []
    for line in SPECIES.read_text(encoding="utf-8").splitlines():
        if "|" in line:
            sci, com = (x.strip() for x in line.split("|", 1))
            rows.append((sci, com))
    OUT.mkdir(parents=True, exist_ok=True)
    species, made, kept, missing = [], 0, 0, 0
    for rank, (sci, com) in enumerate(rows, 1):
        s = slug(sci)
        art = {}
        for pose, suffix in (("perched", ""), ("flight", "-2")):
            src = find(s + suffix)
            if not src:
                continue
            dst = OUT / f"{s}{suffix}.webp"
            if dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
                with Image.open(dst) as im:
                    w, h = im.size
                kept += 1
            else:
                w, h = convert(src, dst)
                made += 1
            art[pose] = {"w": w, "h": h}
        if not art:
            missing += 1
        species.append({"sci": sci, "com": com, "slug": s, "rank": rank, "art": art})
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps({"tz": "Africa/Kampala", "species": species}, ensure_ascii=False, indent=0), encoding="utf-8")
    icons(find("pycnonotus-barbatus"))
    have = sum(1 for s in species if s["art"])
    print(f"{len(species)} species; art for {have} ({made} converted, {kept} unchanged); {missing} without a cut-out yet")
    return 0


if __name__ == "__main__":
    sys.exit(main())
