import type { Config, GroundSignals, SensorReading, Tier } from './shared/tier'
import { sum48h } from './shared/tier'
import type { FloodCollection } from './shared/geo'

export interface Acquisition { granule: string; acquired: string; track: string | number; frame: string | number; pols: string[] }
export interface DemoPin { label: string; lat: number; lon: number }
export interface Meta {
  fixture?: boolean
  id: string
  event: { id: string; title: string; country: string; date: string; source_url: string }
  aoi_bbox: [number, number, number, number]
  pre: Acquisition
  post: Acquisition
  collection: string
  provider: string
  images: { pre: string; post: string; flood: string; compare: string | null; bounds: [number, number][] }
  compare?: { kind: 'gibs' | 'image'; layer?: string; date?: string; label: string } | null
  demo_pins?: DemoPin[]
  generated: string
}
export interface Stats {
  flooded_km2: number
  flooded_vegetation_km2: number
  aoi_km2: number
  by_landcover: { class: string; code: number; km2: number; pct: number }[]
  method: { pol: string; otsu_threshold_db: number; min_patch_ha: number; slope_max_deg: number | null; permanent_water: string }
}
export interface WorldEvent {
  id: string; title: string; category: string; date: string; lat: number; lon: number
  source: 'EONET' | 'TerraWatch'; link: string; analysed: boolean; region?: string
}
export type Audience = 'resident' | 'emergency_manager' | 'farmer' | 'student'
export interface Briefing { text: string; model: string; generated: string }
export type Briefings = { fixture?: boolean; facts?: unknown } & Partial<Record<Tier | 'BLUE', Record<Audience, Briefing>>>
export interface AppConfig extends Config { firebase_url?: string }

/** One analysed area: a NISAR before/after pair turned into a flood map. */
export interface Region {
  id: string
  title: string
  /** short label for the region switcher */
  short?: string
  /** extent of the ground-signal grid (can be wider than the image) */
  bbox: [number, number, number, number]
  meta: Meta; stats: Stats; ground: GroundSignals; flood: FloodCollection
  briefings: Briefings; forecast: { rain_48h_mm: number; fetched: string }
}
export interface AppData { config: AppConfig; events: WorldEvent[]; regions: Region[]; globalBriefings: Briefings }

const j = async <T,>(name: string): Promise<T> => {
  const r = await fetch(`/data/${name}`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
  return r.json()
}

export const regionFile = (r: { id: string }, file: string) => `/data/${r.id}/${file}`

export async function loadData(): Promise<AppData> {
  const [config, events, index, globalBriefings] = await Promise.all([
    j<AppConfig>('config.json'), j<WorldEvent[]>('events.json'),
    j<{ id: string; title: string; short?: string; bbox: Region['bbox'] }[]>('regions.json'), j<Briefings>('briefings.json').catch(() => ({})),
  ])
  const regions = await Promise.all(index.map(async (r): Promise<Region> => {
    const [meta, stats, ground, flood, briefings, forecast] = await Promise.all([
      j<Meta>(`${r.id}/meta.json`), j<Stats>(`${r.id}/stats.json`), j<GroundSignals>(`${r.id}/signals.json`),
      j<FloodCollection>(`${r.id}/flood.geojson`), j<Briefings>(`${r.id}/briefings.json`).catch(() => ({})),
      j<Region['forecast']>(`${r.id}/forecast.json`),
    ])
    return { ...r, meta, stats, ground, flood, briefings, forecast }
  }))
  if (!regions.length) throw new Error('regions.json lists no analysed regions')
  return { config, events, regions, globalBriefings }
}

/** Live 48 h rainfall total for a point from Open-Meteo (no key). Throws on failure. */
export async function fetchRain48(lat: number, lon: number): Promise<{ mm: number; asOf: string }> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=precipitation&forecast_days=3&timezone=UTC`
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`)
  const d = await r.json()
  return { mm: sum48h(d.hourly.precipitation as number[]), asOf: new Date().toISOString() }
}

export interface Coverage { scenes: number; latest: string | null }
/** Live lookup in NASA's CMR catalog: has NISAR imaged this point, and when last? Throws on failure. */
export async function fetchCoverage(lat: number, lon: number): Promise<Coverage> {
  const q = new URLSearchParams({
    short_name: 'NISAR_L2_GCOV*', 'options[short_name][pattern]': 'true', point: `${lon.toFixed(4)},${lat.toFixed(4)}`,
    sort_key: '-start_date', page_size: '1',
  })
  const r = await fetch(`https://cmr.earthdata.nasa.gov/search/granules.umm_json?${q}`, { signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`CMR HTTP ${r.status}`)
  const d = await r.json()
  const latest = d.items?.[0]?.umm?.TemporalExtent?.RangeDateTime?.BeginningDateTime ?? null
  return { scenes: Number(d.hits ?? 0), latest }
}

const fb = (base: string, path: string) => `${base.replace(/\/$/, '')}/${path}.json`

export async function fetchSensor(base: string): Promise<SensorReading | null> {
  const r = await fetch(fb(base, 'sensor/latest'), { signal: AbortSignal.timeout(4000) })
  if (!r.ok) return null
  const d = await r.json()
  return d && typeof d.ts === 'number' ? (d as SensorReading) : null
}

export async function pushDemoFlags(base: string, flags: { storm: boolean; sensor_rise: boolean }) {
  try {
    await fetch(fb(base, 'demo'), { method: 'PUT', body: JSON.stringify({ ...flags, ts: Math.floor(Date.now() / 1000) }) })
  } catch { /* demo flags are best-effort */ }
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
