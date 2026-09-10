'use client'

/**
 * A REAL MAP, showing exactly where the money goes.
 *
 * The version this replaces drew concentric rings labelled "Seattle". It was
 * honest about the numbers and useless about the place: it could not show
 * whether the restaurant's own street was inside the circle, or which
 * neighbouring towns were about to be paid for. A ring is a diagram of a radius.
 * An owner wants their neighbourhood with a circle on it -- ten miles from Alki
 * turns out to include Renton, Burien, White Center and Kirkland, and that is
 * the fact that decides whether ten miles is right.
 *
 * NO MAPPING LIBRARY. Leaflet and friends are tens of kilobytes and a permanent
 * dependency for something that is, at this size, thirty lines of Web Mercator.
 * Tiles are plain <img> tags on a grid and the circle is a div.
 *
 * NOT PANNABLE, deliberately. The centre is their own address and the circle is
 * the thing being decided; there is nothing to go looking for. A slippy map on a
 * phone mostly offers new ways to lose the thing you were looking at.
 *
 * EVERYTHING IS POSITIONED FROM THE CENTRE, never from a width. The first cut
 * assumed the box was 320px wide and laid the tiles out from its left edge while
 * the container was actually width:100% -- so the tiles were centred on one
 * point and the circle on another, and the pin sat somewhere that was not the
 * restaurant. calc(50% + …) has no opinion about how wide the box is.
 *
 * Tiles are OpenStreetMap's, whose licence asks for attribution, so it is on the
 * map and stays there.
 */

import { useMemo } from 'react'
import { C, DISPLAY } from './tokens'
import { hueOf, tint } from './hues'

const TILE = 256
const EARTH_C = 156543.03392804097 // metres per pixel at zoom 0 on the equator
const M_PER_MILE = 1609.344
/** Wide enough to cover any phone or the portal's own column. */
const COVER_W = 560

/** Web Mercator, the projection every slippy-map tile server uses. */
function project(lat: number, lng: number, z: number) {
  const n = 2 ** z
  const x = ((lng + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  return { x, y }
}

export default function RadiusMap({ lat, lng, miles, label, height = 220 }: {
  lat: number
  lng: number
  miles: number
  /** what sits at the centre, named */
  label: string
  height?: number
}) {
  const H = height

  const view = useMemo(() => {
    const metres = miles * M_PER_MILE
    /* The zoom that makes the circle fill a comfortable share of the frame, so
       3 miles and 25 miles both read as a decision rather than a dot or a wall
       of colour. Sized against the HEIGHT, which is the dimension we control. */
    const wantPx = H * 0.36
    const wantMpp = metres / wantPx
    const raw = Math.log2((EARTH_C * Math.cos((lat * Math.PI) / 180)) / wantMpp)
    const z = Math.max(3, Math.min(16, Math.round(raw)))
    const mpp = (EARTH_C * Math.cos((lat * Math.PI) / 180)) / 2 ** z
    return { z, mpp, rPx: metres / mpp }
  }, [lat, miles, H])

  const tiles = useMemo(() => {
    const { x, y } = project(lat, lng, view.z)
    /* Where the point sits inside its own tile. Offsetting by this puts the
       restaurant exactly on the centre of the frame. */
    const fx = (x % 1) * TILE
    const fy = (y % 1) * TILE
    const cols = Math.ceil(COVER_W / TILE) + 2
    const rows = Math.ceil(H / TILE) + 2
    const n = 2 ** view.z
    const out: Array<{ key: string; url: string; dx: number; dy: number }> = []
    for (let i = -Math.floor(cols / 2); i <= Math.floor(cols / 2); i++) {
      for (let j = -Math.floor(rows / 2); j <= Math.floor(rows / 2); j++) {
        const ty = Math.floor(y) + j
        if (ty < 0 || ty >= n) continue
        /* Wrap round the antimeridian rather than leaving a gap. */
        const wx = ((((Math.floor(x) + i) % n) + n) % n)
        out.push({
          key: `${wx}-${ty}`,
          url: `https://tile.openstreetmap.org/${view.z}/${wx}/${ty}.png`,
          dx: i * TILE - fx,
          dy: j * TILE - fy,
        })
      }
    }
    return out
  }, [lat, lng, view.z, H])

  const brand = hueOf('brand')
  const d = view.rPx * 2

  return (
    <div style={{ position: 'relative', width: '100%', height: H, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.line}`, background: '#e8eae6' }}>
      {tiles.map((t) => (
        <img key={t.key} src={t.url} alt="" width={TILE} height={TILE} loading="lazy"
          style={{ position: 'absolute', left: `calc(50% + ${t.dx}px)`, top: `calc(50% + ${t.dy}px)`, width: TILE, height: TILE, userSelect: 'none', pointerEvents: 'none' }} />
      ))}

      {/* THE CIRCLE IS A DIV, not an SVG. An SVG stretched to a responsive box
          with preserveAspectRatio="none" turns a circle into an ellipse, which
          on a map is a lie about distance. A border-radius never distorts, and
          the huge box-shadow spread dims everything outside it in one property
          so the paid-for area is the bright part rather than a ring to read. */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: d, height: d,
        marginLeft: -view.rPx, marginTop: -view.rPx,
        borderRadius: '50%', border: `2px solid ${brand[1]}`, background: tint('brand', .12),
        boxShadow: '0 0 0 9999px rgba(255,255,255,.62)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 11, height: 11, marginLeft: -5.5, marginTop: -5.5,
        borderRadius: '50%', background: brand[1], border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', pointerEvents: 'none',
      }} />

      <div style={{ position: 'absolute', left: 10, top: 10, padding: '5px 10px', borderRadius: 99, background: 'rgba(255,255,255,.94)', boxShadow: '0 1px 4px rgba(0,0,0,.14)', maxWidth: 'calc(100% - 20px)' }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          {miles} miles round {label}
        </span>
      </div>

      {/* OpenStreetMap's licence asks for this, so it is not optional. */}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
        style={{ position: 'absolute', right: 5, bottom: 4, fontSize: 9.5, color: '#4a4a4a', background: 'rgba(255,255,255,.82)', padding: '1px 5px', borderRadius: 4, textDecoration: 'none' }}>
        © OpenStreetMap
      </a>
    </div>
  )
}
