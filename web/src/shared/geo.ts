import { booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export type FloodCollection = FeatureCollection<Polygon | MultiPolygon>

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
