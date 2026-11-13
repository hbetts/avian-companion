"use client";
import { useState } from "react";

/**
 * One map for every bird: the same window on Africa and its neighbours, the
 * same base map, the same colour scale, so species can be compared at a
 * glance. Occurrence density comes from GBIF's map tiles, which are drawn in a
 * fixed style for every taxon.
 *
 * Web-Mercator zoom 3: tiles x 3..5 (lon -45..90), y 3..4 (lat ±40.98).
 */
const Z = 3, X0 = 3, X1 = 5, Y0 = 3, Y1 = 4;
const COLS = X1 - X0 + 1, ROWS = Y1 - Y0 + 1;
const N = 2 ** Z;

function toFrac(lat: number, lon: number) {
  const x = ((lon + 180) / 360) * N - X0;
  const phi = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * N - Y0;
  return { x: x / COLS, y: y / ROWS };
}

const base = (x: number, y: number) => `https://tile.gbif.org/3857/omt/${Z}/${x}/${y}@1x.png?style=gbif-light`;
const density = (x: number, y: number, key: number) =>
  `https://api.gbif.org/v2/map/occurrence/density/${Z}/${x}/${y}@1x.png?taxonKey=${key}&bin=hex&hexPerTile=42&style=classic.poly&srs=EPSG%3A3857`;

export function RangeMap({ taxonKey, station, name }: { taxonKey: number; station?: { lat: number; lon: number; name?: string }; name: string }) {
  const [failed, setFailed] = useState(false);
  const cells: { x: number; y: number }[] = [];
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) cells.push({ x, y });
  const pin = station ? toFrac(station.lat, station.lon) : null;

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ aspectRatio: `${COLS} / ${ROWS}`, background: "#e8eef2", boxShadow: "inset 0 0 0 1px rgba(26,22,18,0.08)" }}
        role="img"
        aria-label={`Where ${name} has been recorded, on a map of Africa`}
      >
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {cells.map((c) => (
            <img key={`b${c.x}-${c.y}`} src={base(c.x, c.y)} alt="" className="block w-full h-full" draggable={false} loading="lazy" />
          ))}
        </div>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, mixBlendMode: "multiply" }}>
          {cells.map((c) => (
            <img key={`d${c.x}-${c.y}`} src={density(c.x, c.y, taxonKey)} alt="" className="block w-full h-full" draggable={false} loading="lazy" onError={() => setFailed(true)} />
          ))}
        </div>
        {pin && (
          <div className="absolute" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: "translate(-50%, -50%)" }} title={station?.name ?? "the frame"}>
            <span className="block w-3 h-3 rounded-full" style={{ background: "var(--seal)", boxShadow: "0 0 0 2.5px #fff, 0 1px 4px rgba(0,0,0,0.35)" }} />
          </div>
        )}
        {failed && (
          <div className="absolute inset-x-0 bottom-0 text-xs text-center py-1" style={{ background: "rgba(255,255,255,0.8)", color: "#4a3f31" }}>
            Sightings could not be loaded.
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5 text-xs" style={{ color: "var(--ink-soft)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-14 rounded-sm" style={{ background: "linear-gradient(90deg, #fff6c2, #ffcf5e, #f5862b, #d6361e, #8b1a1a)" }} aria-hidden />
          fewer → more sightings
          {pin && (
            <>
              <span className="inline-block w-2 h-2 rounded-full ml-2" style={{ background: "var(--seal)" }} aria-hidden /> the frame
            </>
          )}
        </span>
        <a href={`https://www.gbif.org/species/${taxonKey}`} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          GBIF ↗
        </a>
      </div>
    </div>
  );
}
