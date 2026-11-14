import type { Config, GroundSignals, SensorReading, Tier } from './shared/tier'
import { sum48h } from './shared/tier'
import type { FloodCollection } from './shared/geo'

export interface Acquisition { granule: string; acquired: string; track: string | number; frame: string | number; pols: string[] }
export interface Meta {
  fixture?: boolean
  event: { id: string; title: string; country: string; date: string; source_url: string }
  aoi_bbox: [number, number, number, number]
  pre: Acquisition
  post: Acquisition
  collection: string
  provider: string
  images: { pre: string; post: string; flood: string; compare: string | null; bounds: [number, number][] }
  compare?: { kind: 'gibs' | 'image'; layer?: string; date?: string; label: string }
  generated: string
}
export interface Stats {
  flooded_km2: number
  flooded_vegetation_km2: number
  aoi_km2: number
  by_landcover: { class: string; code: number; km2: number; pct: number }[]
  method: { pol: string; otsu_threshold_db: number; min_patch_ha: number; slope_max_deg: number; permanent_water: string }
}
export interface WorldEvent {
  id: string; title: string; category: string; date: string; lat: number; lon: number
  source: 'EONET' | 'TerraWatch'; link: string; analysed: boolean
}
export type Audience = 'resident' | 'emergency_manager' | 'farmer' | 'student'
export interface Briefing { text: string; model: string; generated: string }
export type Briefings = { fixture?: boolean; facts?: unknown } & Partial<Record<Tier | 'BLUE', Record<Audience, Briefing>>>
export interface AppConfig extends Config {
  firebase_url?: string
  demo_pins?: { label: string; lat: number; lon: number }[]
}
export interface AppData {
  meta: Meta; stats: Stats; ground: GroundSignals; config: AppConfig; flood: FloodCollection
  events: WorldEvent[]; briefings: Briefings; forecast: { rain_48h_mm: number; fetched: string }
}

const j = async <T,>(name: string): Promise<T> => {
  const r = await fetch(`/data/${name}`, { cache: 'no-cache' })
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
  return r.json()
}

export async function loadData(): Promise<AppData> {
  const [meta, stats, ground, config, flood, events, briefings, forecast] = await Promise.all([
    j<Meta>('meta.json'), j<Stats>('stats.json'), j<GroundSignals>('signals.json'), j<AppConfig>('config.json'),
    j<FloodCollection>('flood.geojson'), j<WorldEvent[]>('events.json'), j<Briefings>('briefings.json'),
    j<AppData['forecast']>('forecast.json'),
  ])
  return { meta, stats, ground, config, flood, events, briefings, forecast }
}

/** Live 48 h rainfall total for a point from Open-Meteo (no key). Throws on failure. */
export async function fetchRain48(lat: number, lon: number): Promise<{ mm: number; asOf: string }> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=precipitation&forecast_days=3&timezone=UTC`
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`)
  const d = await r.json()
  return { mm: sum48h(d.hourly.precipitation as number[]), asOf: new Date().toISOString() }
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
