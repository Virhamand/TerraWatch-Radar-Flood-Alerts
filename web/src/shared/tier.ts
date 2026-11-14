// TerraWatch tier engine. Pure functions, no DOM: shared by the React app and api/tier.ts.
// All thresholds come from public/data/config.json.

export type Tier = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED'
export type SignalId = 'wetness' | 'water' | 'rain' | 'sensor' | 'nearby'

export interface Config {
  wetness_percentile_high: number
  water_ratio_high: number
  rain_48h_mm_high: number
  sensor_rise_high: number // sensor units per minute
  sensor_stale_s: number
  near_km: number
  far_km: number
  device_location: { lat: number; lon: number; label: string }
  sim: { rain_48h_mm: number }
}

export interface GroundCell {
  bbox: [number, number, number, number] // w, s, e, n
  wetness: number | null // percentile 0..1
  water_ratio: number | null // NISAR water area / JRC baseline area
  water_km2?: number
  baseline_km2?: number
}

export interface GroundSignals {
  as_of: string // post-event NISAR acquisition time
  wetness_source: string
  water_source: string
  cells: GroundCell[]
}

export interface SensorReading {
  level: number
  rate: number // units per minute
  ts: number // unix seconds
  device?: string
}

export interface TierInputs {
  config: Config
  lat: number
  lon: number
  ground: GroundSignals | null
  rain48mm: number | null
  rainAsOf: string | null
  sensor: SensorReading | null
  /** km to nearest mapped flood polygon; 0 = inside; null = none mapped / unknown */
  floodDistanceKm: number | null
  sim: { storm: boolean; sensor_rise: boolean }
  nowMs: number
}

export interface SignalState {
  id: SignalId
  label: string
  high: boolean
  status: 'ok' | 'no_data' | 'offline'
  value: string
  source: string
  asOf: string | null
  simulated: boolean
}

export interface TierResult {
  tier: Tier
  code: 0 | 1 | 2 | 3
  title: string
  reason: string
  signals: SignalState[]
  signalsHigh: number
  insideFlood: boolean
  floodDistanceKm: number | null
  simulated: boolean
}

export const TIER_META: Record<Tier | 'BLUE', { code: number; title: string; color: string; emoji: string }> = {
  GREEN: { code: 0, title: 'No current concern', color: '#2e9e5b', emoji: '🟢' },
  YELLOW: { code: 1, title: 'Flood watch', color: '#e3b505', emoji: '🟡' },
  ORANGE: { code: 2, title: 'Flood warning', color: '#f07f1f', emoji: '🟠' },
  RED: { code: 3, title: 'Flood imminent or occurring', color: '#d7263d', emoji: '🔴' },
  BLUE: { code: -1, title: 'Global report', color: '#2f7fd8', emoji: '🔵' },
}

export function findCell(ground: GroundSignals | null, lat: number, lon: number): GroundCell | null {
  if (!ground) return null
  return ground.cells.find((c) => lon >= c.bbox[0] && lon < c.bbox[2] && lat >= c.bbox[1] && lat < c.bbox[3]) ?? null
}

export function sum48h(hourlyMm: number[]): number {
  return Math.round(hourlyMm.slice(0, 48).reduce((a, b) => a + (b || 0), 0) * 10) / 10
}

export function computeSignals(inp: TierInputs): SignalState[] {
  const { config: c } = inp
  const cell = findCell(inp.ground, inp.lat, inp.lon)
  const satAsOf = inp.ground?.as_of ?? null

  const wet: SignalState = {
    id: 'wetness', label: 'Soil wetness', high: false, status: 'no_data',
    value: 'No NISAR analysis here', source: inp.ground?.wetness_source ?? 'NISAR', asOf: satAsOf, simulated: false,
  }
  if (cell && cell.wetness != null) {
    wet.status = 'ok'
    wet.high = cell.wetness >= c.wetness_percentile_high
    wet.value = `${Math.round(cell.wetness * 100)}th percentile (high at ≥ ${Math.round(c.wetness_percentile_high * 100)}th)`
  }

  const water: SignalState = {
    id: 'water', label: 'Water above normal', high: false, status: 'no_data',
    value: 'No NISAR analysis here', source: inp.ground?.water_source ?? 'NISAR vs JRC', asOf: satAsOf, simulated: false,
  }
  if (cell && cell.water_ratio != null) {
    water.status = 'ok'
    water.high = cell.water_ratio >= c.water_ratio_high
    water.value = `${cell.water_ratio.toFixed(1)}× normal extent (high at ≥ ${c.water_ratio_high}×)`
  }

  const rainMm = inp.sim.storm ? c.sim.rain_48h_mm : inp.rain48mm
  const rain: SignalState = {
    id: 'rain', label: 'Rain forecast, next 48 h', high: false, status: rainMm == null ? 'no_data' : 'ok',
    value: rainMm == null ? 'Forecast unavailable' : `${rainMm} mm (high at ≥ ${c.rain_48h_mm_high} mm)`,
    source: inp.sim.storm ? 'Simulated storm' : 'Open-Meteo', asOf: inp.sim.storm ? new Date(inp.nowMs).toISOString() : inp.rainAsOf,
    simulated: inp.sim.storm,
  }
  if (rainMm != null) rain.high = rainMm >= c.rain_48h_mm_high

  const sensor: SignalState = {
    id: 'sensor', label: 'Ground sensor rising', high: false, status: 'offline',
    value: 'Sensor offline', source: 'ESP32 water-level sensor', asOf: null, simulated: false,
  }
  if (inp.sim.sensor_rise) {
    sensor.status = 'ok'; sensor.high = true; sensor.simulated = true
    sensor.value = `Rising fast (simulated)`; sensor.source = 'Simulated sensor'
    sensor.asOf = new Date(inp.nowMs).toISOString()
  } else if (inp.sensor) {
    const age = inp.nowMs / 1000 - inp.sensor.ts
    sensor.asOf = new Date(inp.sensor.ts * 1000).toISOString()
    if (age <= c.sensor_stale_s) {
      sensor.status = 'ok'
      sensor.high = inp.sensor.rate >= c.sensor_rise_high
      sensor.value = `Level ${Math.round(inp.sensor.level)}, ${inp.sensor.rate >= 0 ? '+' : ''}${Math.round(inp.sensor.rate)}/min (high at ≥ +${c.sensor_rise_high}/min)`
    } else {
      sensor.value = `Sensor offline (last heard ${Math.round(age)} s ago)`
    }
  }

  const d = inp.floodDistanceKm
  const nearby: SignalState = {
    id: 'nearby', label: `Mapped flooding within ${c.near_km} km`, high: d != null && d <= c.near_km,
    status: d == null ? 'no_data' : 'ok',
    value: d == null ? 'No mapped flooding in range' : d === 0 ? 'Location is inside a mapped flood area' : `Nearest mapped flooding ${d.toFixed(1)} km away`,
    source: 'NISAR flood polygons', asOf: satAsOf, simulated: false,
  }
  return [wet, water, rain, sensor, nearby]
}

export function computeTier(inp: TierInputs): TierResult {
  const signals = computeSignals(inp)
  const by = Object.fromEntries(signals.map((s) => [s.id, s])) as Record<SignalId, SignalState>
  const n = signals.filter((s) => s.high).length
  const d = inp.floodDistanceKm
  const inside = d === 0
  const ground = by.wetness.high || by.water.high

  let tier: Tier = 'GREEN'
  let reason = n === 1 ? 'One warning sign only; at least two must agree.' : 'No warning signs detected in your area.'
  if (inside) {
    tier = 'RED'; reason = 'Satellite data shows flooding at this location.'
  } else if (n >= 3) {
    tier = 'RED'; reason = `${n} independent warning signs agree.`
  } else if (d != null && d <= inp.config.far_km) {
    tier = 'ORANGE'; reason = `Flooding detected ${d.toFixed(1)} km away.`
  } else if (n === 2 && ground && by.rain.high && !(by.wetness.high && by.water.high)) {
    // exactly: one ground-condition sign + heavy rain forecast
    tier = 'YELLOW'; reason = 'Ground conditions are wet and significant rain is expected.'
  } else if (n === 2) {
    tier = 'ORANGE'; reason = 'Two warning signs agree.'
  }
  const meta = TIER_META[tier]
  return {
    tier, code: meta.code as 0 | 1 | 2 | 3, title: meta.title, reason, signals, signalsHigh: n,
    insideFlood: inside, floodDistanceKm: d, simulated: signals.some((s) => s.simulated && s.high),
  }
}

/** Notify only when the tier increases (no repeat alerts). */
export function shouldNotify(prev: Tier | null, next: Tier): boolean {
  if (next === 'GREEN') return false
  return prev == null ? true : TIER_META[next].code > TIER_META[prev].code
}

/** ≤16-character status line for the LCD1602. */
export function lcdLine(r: TierResult): string {
  let s: string
  if (r.insideFlood) s = 'Flood at site'
  else if (r.tier === 'RED') s = `${r.signalsHigh} signs agree`
  else if (r.floodDistanceKm != null && r.tier === 'ORANGE') s = `Flood ${Math.round(r.floodDistanceKm)}km away`
  else if (r.tier === 'ORANGE') s = '2 signs agree'
  else if (r.tier === 'YELLOW') s = 'Wet + rain due'
  else s = 'All clear'
  return s.slice(0, 16)
}

export function ageLabel(iso: string | null, nowMs: number): string {
  if (!iso) return 'unknown'
  const s = Math.max(0, (nowMs - Date.parse(iso)) / 1000)
  if (s < 90) return `${Math.round(s)} s ago`
  if (s < 5400) return `${Math.round(s / 60)} min ago`
  if (s < 172800) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}
