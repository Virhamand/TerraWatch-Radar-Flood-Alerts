import { booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type FloodCollection = FeatureCollection<Polygon | MultiPolygon>
type BBox = [number, number, number, number] // w, s, e, n

export const inBBox = (b: BBox, lat: number, lon: number) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]

/** The analysed region whose data extent contains the point, if any. */
export function regionAt<T extends { bbox: BBox }>(regions: T[], lat: number, lon: number): T | null {
  return regions.find((r) => inBBox(r.bbox, lat, lon)) ?? null
}

/** km from a point to the nearest flood polygon. 0 = inside. null = nothing within maxKm. */
export function floodDistanceKm(fc: FloodCollection | null, lat: number, lon: number, maxKm = 200): number | null {
  if (!fc || !fc.features.length) return null
  const p = point([lon, lat])
  let best = Infinity
  for (const f of fc.features as Feature<Polygon | MultiPolygon>[]) {
    if (booleanPointInPolygon(p, f)) return 0
    const d = pointToPolygonDistance(p, f, { units: 'kilometers' })
    if (d < best) best = d
  }
  return best <= maxKm ? Math.max(best, 0.01) : null
}

/** Nearest mapped flooding across every analysed region (skips regions more than ~3 degrees away). */
export function nearestFloodKm(regions: { bbox: BBox; flood: FloodCollection }[], lat: number, lon: number): number | null {
  let best: number | null = null
  for (const r of regions) {
    const pad = 3
    if (lon < r.bbox[0] - pad || lon > r.bbox[2] + pad || lat < r.bbox[1] - pad || lat > r.bbox[3] + pad) continue
    const d = floodDistanceKm(r.flood, lat, lon)
    if (d != null && (best == null || d < best)) best = d
  }
  return best
}
