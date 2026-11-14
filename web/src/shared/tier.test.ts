import { describe, expect, it } from 'vitest'
import { computeTier, lcdLine, shouldNotify, sum48h, type Config, type GroundSignals, type TierInputs } from './tier'

const config: Config = {
  wetness_percentile_high: 0.8, water_ratio_high: 1.5, rain_48h_mm_high: 50, sensor_rise_high: 150,
  sensor_stale_s: 30, near_km: 5, far_km: 25, device_location: { lat: 0.5, lon: 0.5, label: 'x' },
  sim: { rain_48h_mm: 85 },
}
const now = Date.parse('2026-11-14T20:00:00Z')
const ground = (wetness: number, water_ratio: number): GroundSignals => ({
  as_of: '2026-09-05T00:00:00Z', wetness_source: 'w', water_source: 'j',
  cells: [{ bbox: [0, 0, 1, 1], wetness, water_ratio }],
})
const base = (o: Partial<TierInputs> = {}): TierInputs => ({
  config, lat: 0.5, lon: 0.5, ground: ground(0.3, 1.0), rain48mm: 5, rainAsOf: null, sensor: null,
  floodDistanceKm: null, sim: { storm: false, sensor_rise: false }, nowMs: now, ...o,
})
const live = (rate: number, ageS = 5) => ({ level: 1000, rate, ts: now / 1000 - ageS })

describe('tiers', () => {
  it('GREEN with nothing high', () => expect(computeTier(base()).tier).toBe('GREEN'))
  it('GREEN with a single signal', () => expect(computeTier(base({ rain48mm: 80 })).tier).toBe('GREEN'))
  it('YELLOW: wet ground + rain', () =>
    expect(computeTier(base({ ground: ground(0.9, 1.0), rain48mm: 60 })).tier).toBe('YELLOW'))
  it('YELLOW: water above normal + simulated storm', () => {
    const r = computeTier(base({ ground: ground(0.1, 2.0), sim: { storm: true, sensor_rise: false } }))
    expect(r.tier).toBe('YELLOW'); expect(r.simulated).toBe(true)
  })
  it('ORANGE: two signals that are not the watch pattern', () =>
    expect(computeTier(base({ rain48mm: 60, sensor: live(300) })).tier).toBe('ORANGE'))
  it('ORANGE: flooding 5-25 km away', () => expect(computeTier(base({ floodDistanceKm: 12 })).tier).toBe('ORANGE'))
  it('ORANGE: flooding within 5 km but not inside', () =>
    expect(computeTier(base({ floodDistanceKm: 2 })).tier).toBe('ORANGE'))
  it('GREEN: flooding beyond 25 km', () => expect(computeTier(base({ floodDistanceKm: 40 })).tier).toBe('GREEN'))
  it('RED: inside polygon', () => expect(computeTier(base({ floodDistanceKm: 0 })).tier).toBe('RED'))
  it('RED: three signals', () =>
    expect(computeTier(base({ ground: ground(0.9, 1.0), rain48mm: 60, sensor: live(300) })).tier).toBe('RED'))
  it('RED: wet + water + rain', () =>
    expect(computeTier(base({ ground: ground(0.9, 2.0), rain48mm: 60 })).tier).toBe('RED'))
  it('ground signals are no_data outside analysed cells', () => {
    const r = computeTier(base({ lat: 5, lon: 5, ground: ground(0.99, 9) }))
    expect(r.tier).toBe('GREEN'); expect(r.signals[0].status).toBe('no_data')
  })
})

describe('sensor', () => {
  it('stale reading is offline and never high', () => {
    const r = computeTier(base({ rain48mm: 60, sensor: live(999, 120) }))
    expect(r.signals[3].status).toBe('offline'); expect(r.tier).toBe('GREEN')
  })
  it('missing reading is offline', () => expect(computeTier(base()).signals[3].status).toBe('offline'))
  it('slow rise is not high', () => expect(computeTier(base({ sensor: live(20) })).signals[3].high).toBe(false))
  it('simulated rise is flagged', () => {
    const s = computeTier(base({ sim: { storm: false, sensor_rise: true } })).signals[3]
    expect(s.high).toBe(true); expect(s.simulated).toBe(true)
  })
})

describe('helpers', () => {
  it('notifies only on increase', () => {
    expect(shouldNotify(null, 'GREEN')).toBe(false)
    expect(shouldNotify('GREEN', 'YELLOW')).toBe(true)
    expect(shouldNotify('YELLOW', 'YELLOW')).toBe(false)
    expect(shouldNotify('RED', 'ORANGE')).toBe(false)
    expect(shouldNotify('ORANGE', 'RED')).toBe(true)
  })
  it('lcd line fits 16 chars', () => {
    for (const d of [0, 3, 12.4, 24.9, null])
      expect(lcdLine(computeTier(base({ floodDistanceKm: d }))).length).toBeLessThanOrEqual(16)
  })
  it('sums 48 hours only', () => expect(sum48h(Array(72).fill(1))).toBe(48))
})
