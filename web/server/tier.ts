// Source for the Vercel function the ESP32 polls: GET /api/tier
// Bundled into api/tier.js by `npm run build:api` (single self-contained file, committed).
// Uses the SAME tier engine as the browser. Reads the static pipeline exports from this site,
// the live sensor reading and demo flags from Firebase, and the rain forecast from Open-Meteo.
import { nearestFloodKm, regionAt, type FloodCollection } from '../src/shared/geo'
import { computeTier, lcdLine, sum48h, type Config, type GroundSignals, type SensorReading } from '../src/shared/tier'

interface RegionData {
  id: string
  bbox: [number, number, number, number]
  ground: GroundSignals
  flood: FloodCollection
  forecast: { rain_48h_mm: number; fetched: string }
  meta: { post: { acquired: string }; fixture?: boolean }
}
interface Static { config: Config & { firebase_url?: string }; regions: RegionData[] }
let cache: { at: number; origin: string; data: Static } | null = null

const getJson = async <T,>(url: string, ms = 4000): Promise<T> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
  return (await r.json()) as T
}

async function loadStatic(origin: string): Promise<Static> {
  if (cache && cache.origin === origin && Date.now() - cache.at < 60_000) return cache.data
  const f = <T,>(n: string) => getJson<T>(`${origin}/data/${n}`)
  const [config, index] = await Promise.all([
    f<Static['config']>('config.json'), f<{ id: string; bbox: RegionData['bbox'] }[]>('regions.json'),
  ])
  const regions = await Promise.all(index.map(async (r): Promise<RegionData> => {
    const [ground, flood, forecast, meta] = await Promise.all([
      f<GroundSignals>(`${r.id}/signals.json`), f<FloodCollection>(`${r.id}/flood.geojson`),
      f<RegionData['forecast']>(`${r.id}/forecast.json`), f<RegionData['meta']>(`${r.id}/meta.json`),
    ])
    return { ...r, ground, flood, forecast, meta }
  }))
  cache = { at: Date.now(), origin, data: { config, regions } }
  return cache.data
}

export async function buildTier(origin: string, query: URLSearchParams) {
  const s = await loadStatic(origin)
  const lat = Number(query.get('lat') ?? s.config.device_location.lat)
  const lon = Number(query.get('lon') ?? s.config.device_location.lon)
  const here = regionAt(s.regions, lat, lon)
  const fb = (s.config.firebase_url ?? '').replace(/\/$/, '')

  const [sensor, demo, rain] = await Promise.all([
    fb ? getJson<SensorReading | null>(`${fb}/sensor/latest.json`, 2500).catch(() => null) : null,
    fb ? getJson<{ storm?: boolean; sensor_rise?: boolean } | null>(`${fb}/demo.json`, 2500).catch(() => null) : null,
    getJson<{ hourly: { precipitation: number[] } }>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=precipitation&forecast_days=3&timezone=UTC`, 3000)
      .then((d) => ({ mm: sum48h(d.hourly.precipitation), asOf: new Date().toISOString() }))
      .catch(() => (here ? { mm: here.forecast.rain_48h_mm as number | null, asOf: here.forecast.fetched as string | null } : { mm: null, asOf: null })),
  ])

  const now = Date.now()
  const r = computeTier({
    config: s.config, lat, lon, ground: here?.ground ?? null, rain48mm: rain.mm, rainAsOf: rain.asOf,
    sensor: sensor && typeof sensor.ts === 'number' ? sensor : null,
    floodDistanceKm: nearestFloodKm(s.regions, lat, lon),
    sim: { storm: !!demo?.storm, sensor_rise: !!demo?.sensor_rise }, nowMs: now,
  })
  return {
    tier: r.tier, code: r.code, title: r.title, line: lcdLine(r), signals_high: r.signalsHigh,
    sat_age_d: here ? Math.round((now - Date.parse(here.meta.post.acquired)) / 86_400_000) : -1,
    region: here?.id ?? null,
    sensor: r.signals[3].simulated ? 'sim' : r.signals[3].status === 'ok' ? 'ok' : 'offline',
    simulated: r.simulated, fixture: s.regions.some((x) => x.meta.fixture), ts: Math.floor(now / 1000),
  }
}

// Vercel Node.js function entry point
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const proto = req.headers['x-forwarded-proto'] ?? 'https'
    const url = new URL(req.url ?? '/', `${proto}://${req.headers.host}`)
    res.statusCode = 200
    res.end(JSON.stringify(await buildTier(url.origin, url.searchParams)))
  } catch (e) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(e) }))
  }
}
