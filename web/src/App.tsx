import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import { fetchRain48, fetchSensor, fmtDate, loadData, pushDemoFlags, type AppData, type Audience } from './data'
import { floodDistanceKm } from './shared/geo'
import { ageLabel, computeTier, shouldNotify, TIER_META, type SensorReading, type Tier, type TierResult } from './shared/tier'

type Tab = 'briefing' | 'stats' | 'world' | 'how' | 'credits'
interface Note { id: number; tier: Tier | 'BLUE'; title: string; body: string; at: number }

const AUDIENCES: { id: Audience; label: string }[] = [
  { id: 'resident', label: 'Resident' }, { id: 'emergency_manager', label: 'Emergency manager' },
  { id: 'farmer', label: 'Farmer' }, { id: 'student', label: 'Student' },
]

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { loadData().then(setData).catch((e) => setErr(String(e))) }, [])
  if (err) return <div className="boot">Could not load data: {err}</div>
  if (!data) return <div className="boot">Loading TerraWatch…</div>
  return <Main data={data} />
}

function Main({ data }: { data: AppData }) {
  const { config, meta } = data
  const pins = config.demo_pins ?? []
  const [pin, setPin] = useState<{ lat: number; lon: number }>(() => pins[0] ?? { lat: config.device_location.lat, lon: config.device_location.lon })
  const [sim, setSim] = useState({ storm: false, sensor_rise: false })
  const [rain, setRain] = useState<{ mm: number; asOf: string; live: boolean }>({ mm: data.forecast.rain_48h_mm, asOf: data.forecast.fetched, live: false })
  const [sensor, setSensor] = useState<SensorReading | null>(null)
  const [now, setNow] = useState(Date.now())
  const [tab, setTab] = useState<Tab>('briefing')
  const [aud, setAud] = useState<Audience>('resident')
  const [notes, setNotes] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [bellOpen, setBellOpen] = useState(false)
  const [banner, setBanner] = useState<Note | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; n: number } | null>(null)
  const [notifPerm, setNotifPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  // live rain forecast for the pin; falls back to the pipeline snapshot
  useEffect(() => {
    let dead = false
    fetchRain48(pin.lat, pin.lon)
      .then((r) => { if (!dead) setRain({ ...r, live: true }) })
      .catch(() => { if (!dead) setRain({ mm: data.forecast.rain_48h_mm, asOf: data.forecast.fetched, live: false }) })
    return () => { dead = true }
  }, [pin.lat, pin.lon, data.forecast])

  // ground sensor polling (Firebase)
  useEffect(() => {
    if (!config.firebase_url) return
    const tick = () => fetchSensor(config.firebase_url!).then(setSensor).catch(() => {})
    tick()
    const t = setInterval(tick, 2000)
    return () => clearInterval(t)
  }, [config.firebase_url])

  useEffect(() => { if (config.firebase_url) pushDemoFlags(config.firebase_url, sim) }, [sim, config.firebase_url])

  const dist = useMemo(() => floodDistanceKm(data.flood, pin.lat, pin.lon), [data.flood, pin.lat, pin.lon])
  const result: TierResult = useMemo(() => computeTier({
    config, lat: pin.lat, lon: pin.lon, ground: data.ground, rain48mm: rain.mm, rainAsOf: rain.asOf,
    sensor, floodDistanceKm: dist, sim, nowMs: now,
  }), [config, pin.lat, pin.lon, data.ground, rain, sensor, dist, sim, now])

  // notifications: only when the tier increases, plus one BLUE note per world event at start
  const prevTier = useRef<Tier | null>(null)
  const noteId = useRef(1)
  const addNote = (n: Omit<Note, 'id' | 'at'>, loud: boolean) => {
    const note = { ...n, id: noteId.current++, at: Date.now() }
    setNotes((xs) => [note, ...xs].slice(0, 30))
    setUnread((u) => u + 1)
    if (loud) {
      setBanner(note)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(`TerraWatch: ${n.title}`, { body: n.body }) } catch { /* ignore */ }
      }
    }
  }
  useEffect(() => {
    const others = data.events.filter((e) => e.id !== meta.event.id).slice(0, 5)
    others.forEach((e) => addNote({ tier: 'BLUE', title: 'Global report', body: `${e.title} (${fmtDate(e.date)})` }, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (shouldNotify(prevTier.current, result.tier)) {
      addNote({ tier: result.tier, title: `${TIER_META[result.tier].emoji} ${result.title}`, body: result.reason + (result.simulated ? ' (includes simulated signals)' : '') }, true)
    } else if (prevTier.current && TIER_META[result.tier].code < TIER_META[prevTier.current].code) {
      setBanner(null)
    }
    prevTier.current = result.tier
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.tier])

  const tm = TIER_META[result.tier]
  const briefing = data.briefings[result.tier]?.[aud]
  const satAge = ageLabel(meta.post.acquired, now)
  const sensorSig = result.signals[3]
  const world = data.events

  return (
    <div className="app">
      <aside>
        <header>
          <div>
            <h1>TerraWatch</h1>
            <p>Flood alerts from NASA–ISRO NISAR radar</p>
          </div>
          <button className="bell" aria-label="Notifications" onClick={() => { setBellOpen(!bellOpen); setUnread(0) }}>
            🔔{unread > 0 && <b>{unread}</b>}
          </button>
        </header>

        {bellOpen && (
          <div className="notes">
            <div className="row">
              <strong>Notifications</strong>
              {notifPerm === 'default' && (
                <button onClick={() => Notification.requestPermission().then(setNotifPerm)}>Enable browser alerts</button>
              )}
            </div>
            {notes.length === 0 && <p className="muted">Nothing yet. You are notified only when the alert level rises or a new event appears.</p>}
            {notes.map((n) => (
              <div key={n.id} className="note" style={{ borderColor: TIER_META[n.tier].color }}>
                <b>{n.title}</b><span>{n.body}</span><small>{new Date(n.at).toLocaleTimeString()}</small>
              </div>
            ))}
          </div>
        )}

        {meta.fixture && <div className="fixture">PLACEHOLDER DATA — synthetic fixture, not a real NISAR analysis yet</div>}

        <section className="tier" style={{ borderColor: tm.color }}>
          <div className="tierhead" style={{ background: tm.color }}>
            <span className="lvl">{result.tier}</span>
            <span>{result.title}</span>
            {result.simulated && <em>SIMULATED</em>}
          </div>
          <p className="reason">{result.reason}</p>
          <ul className="signals">
            {result.signals.map((s, i) => (
              <li key={s.id} className={s.high ? 'high' : s.status !== 'ok' ? 'off' : ''}>
                <span className="dot" />
                <div>
                  <b>{i + 1}. {s.label}</b>{s.simulated && <em>SIM</em>}
                  <span>{s.value}</span>
                  <small>{s.source}{s.asOf ? ` · ${ageLabel(s.asOf, now)}` : ''}</small>
                </div>
                <strong>{s.high ? 'HIGH' : s.status === 'ok' ? 'normal' : s.status === 'offline' ? 'offline' : 'no data'}</strong>
              </li>
            ))}
          </ul>
          <div className="fresh">
            <span title={meta.post.acquired}>🛰 Satellite: {satAge}</span>
            <span>🌧 Forecast: {sim.storm ? 'simulated' : `${ageLabel(rain.asOf, now)}${rain.live ? '' : ' (saved)'}`}</span>
            <span>📟 Sensor: {sensorSig.simulated ? 'simulated' : sensorSig.status === 'ok' ? ageLabel(sensorSig.asOf, now) : 'offline'}</span>
          </div>
        </section>

        <section className="demo">
          <div className="row"><strong>Demo controls</strong><small>{pin.lat.toFixed(3)}, {pin.lon.toFixed(3)}</small></div>
          <div className="btns">
            {pins.map((p) => (
              <button key={p.label} className={p.lat === pin.lat && p.lon === pin.lon ? 'on' : ''}
                onClick={() => { setPin({ lat: p.lat, lon: p.lon }); setFocus({ lat: p.lat, lon: p.lon, zoom: 9.5, n: Date.now() }) }}>📍 {p.label}</button>
            ))}
            <button onClick={() => navigator.geolocation?.getCurrentPosition((g) => {
              setPin({ lat: g.coords.latitude, lon: g.coords.longitude })
              setFocus({ lat: g.coords.latitude, lon: g.coords.longitude, zoom: 8, n: Date.now() })
            })}>◎ My location</button>
          </div>
          <div className="btns">
            <button className={sim.storm ? 'on warn' : ''} onClick={() => setSim({ ...sim, storm: !sim.storm })}>⛈ Simulate storm</button>
            <button className={sim.sensor_rise ? 'on warn' : ''} onClick={() => setSim({ ...sim, sensor_rise: !sim.sensor_rise })}>🌊 Simulate sensor rise</button>
          </div>
        </section>

        <nav>
          {([['briefing', 'AI briefing'], ['stats', 'Flood stats'], ['world', `Around the world${world.length ? ` (${world.length})` : ''}`], ['how', 'How it works'], ['credits', 'Data & credits']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        <section className="panel">
          {tab === 'briefing' && (
            <>
              <div className="btns small">
                {AUDIENCES.map((a) => <button key={a.id} className={aud === a.id ? 'on' : ''} onClick={() => setAud(a.id)}>{a.label}</button>)}
              </div>
              <p className="brief">{briefing?.text ?? 'No briefing cached for this alert level.'}</p>
              <small className="muted">
                AI-written explanation of the computed results above{briefing && briefing.model !== 'none' ? ` (${briefing.model}, ${fmtDate(briefing.generated)})` : ''}.
                The AI does not detect floods or choose the alert level.
              </small>
            </>
          )}
          {tab === 'stats' && <StatsPanel data={data} />}
          {tab === 'world' && (
            <>
              <p className="muted">🔵 Global report: floods and severe storms from NASA EONET, plus areas TerraWatch has analysed with NISAR.</p>
              {world.map((e) => (
                <button key={e.id} className="event" onClick={() => setFocus({ lat: e.lat, lon: e.lon, zoom: e.analysed ? 9 : 5, n: Date.now() })}>
                  <b>{e.title}</b>
                  <span>{fmtDate(e.date)} · {e.category === 'severeStorms' ? 'Severe storm' : 'Flood'} · {e.source}{e.analysed ? ' · NISAR analysis available' : ''}</span>
                </button>
              ))}
            </>
          )}
          {tab === 'how' && <HowPanel />}
          {tab === 'credits' && <CreditsPanel data={data} />}
        </section>
        <footer>TerraWatch supplements, but does not replace, official emergency alerts. Hackathon prototype · NASA Space Apps 2026</footer>
      </aside>

      <main>
        {banner && (
          <div className="banner" style={{ background: TIER_META[banner.tier].color }}>
            <b>{banner.title}</b> {banner.body}
            <button onClick={() => setBanner(null)} aria-label="Dismiss">✕</button>
          </div>
        )}
        <MapView data={data} pin={pin} onPin={(lat, lon) => setPin({ lat, lon })} tierColor={tm.color} focus={focus} />
      </main>
    </div>
  )
}

function StatsPanel({ data }: { data: AppData }) {
  const { stats, meta } = data
  const max = Math.max(...stats.by_landcover.map((l) => l.km2), 0.001)
  return (
    <>
      <div className="big"><b>{stats.flooded_km2.toLocaleString()} km²</b><span>newly flooded, of {stats.aoi_km2.toLocaleString()} km² analysed</span></div>
      {stats.flooded_vegetation_km2 > 0 && <p>Plus {stats.flooded_vegetation_km2} km² of possible flooded vegetation.</p>}
      <h3>Flooded area by land cover</h3>
      {stats.by_landcover.map((l) => (
        <div className="bar" key={l.code}>
          <span>{l.class}</span>
          <div><i style={{ width: `${(l.km2 / max) * 100}%` }} /></div>
          <b>{l.km2} km²</b>
        </div>
      ))}
      <h3>Method</h3>
      <p className="muted">
        Change in {stats.method.pol} backscatter between {fmtDate(meta.pre.acquired)} and {fmtDate(meta.post.acquired)}; pixels that
        darkened by more than {Math.abs(stats.method.otsu_threshold_db).toFixed(1)} dB (Otsu threshold) are flagged. Permanent water
        ({stats.method.permanent_water}) and slopes over {stats.method.slope_max_deg}° are removed; patches under {stats.method.min_patch_ha} ha are dropped.
        Land cover: ESA WorldCover.
      </p>
    </>
  )
}

function HowPanel() {
  return (
    <>
      <h3>How radar sees floods</h3>
      <div className="radar">
        <div><div className="sw dark" /><b>Open water → dark</b><span>Smooth water acts like a mirror and reflects the radar pulse away from the satellite.</span></div>
        <div><div className="sw bright" /><b>Flooded forest → bright</b><span>NISAR's long L-band waves pass through leaves, then bounce off water and trunks straight back (double bounce).</span></div>
      </div>
      <p className="muted">Radar works at night and through cloud, so it can map floods during the storm itself.</p>
      <h3>How alerts work</h3>
      <p>TerraWatch combines radar data from the NASA–ISRO NISAR satellite, rainfall forecasts, and ground sensors to estimate flood risk where you are.</p>
      <ul className="tiers">
        <li>🔴 <b>Red – Flood imminent or occurring:</b> satellite data shows flooding at your location, or at least three independent warning signs agree.</li>
        <li>🟠 <b>Orange – Flood warning:</b> flooding has been detected nearby, or two warning signs agree.</li>
        <li>🟡 <b>Yellow – Flood watch:</b> ground conditions are wet and significant rain is expected.</li>
        <li>🟢 <b>Green – No current concern:</b> no warning signs detected in your area.</li>
        <li>🔵 <b>Blue – Global report:</b> a major flood has been detected elsewhere in the world.</li>
      </ul>
      <p>Every alert shows which signals triggered it and how recent the data is. NISAR passes over each location about every 12 days, so TerraWatch adds forecasts and ground sensors between passes.</p>
      <p><b>TerraWatch supplements, but does not replace, official emergency alerts.</b></p>
    </>
  )
}

function CreditsPanel({ data }: { data: AppData }) {
  const { meta } = data
  return (
    <>
      <h3>NASA data in this view</h3>
      <table>
        <tbody>
          <tr><th>Product</th><td>{meta.collection} (NISAR Level-2 geocoded polarimetric covariance, L-band)</td></tr>
          <tr><th>Archive</th><td>NASA {meta.provider} (Alaska Satellite Facility)</td></tr>
          <tr><th>Before</th><td>{fmtDate(meta.pre.acquired)} · track {meta.pre.track} frame {meta.pre.frame}<br /><code>{meta.pre.granule}</code></td></tr>
          <tr><th>After</th><td>{fmtDate(meta.post.acquired)} · track {meta.post.track} frame {meta.post.frame}<br /><code>{meta.post.granule}</code></td></tr>
          <tr><th>Event</th><td>{meta.event.title} · {fmtDate(meta.event.date)} · {meta.event.id}</td></tr>
          <tr><th>Events feed</th><td>NASA EONET v3 (Earth Observatory Natural Event Tracker)</td></tr>
          {meta.compare && <tr><th>Comparison</th><td>{meta.compare.label}</td></tr>}
        </tbody>
      </table>
      <h3>Other sources</h3>
      <ul className="plain">
        <li>Open-Meteo forecast API: 48-hour rainfall</li>
        <li>JRC Global Surface Water: permanent-water baseline</li>
        <li>Copernicus DEM GLO-30: slope mask</li>
        <li>ESA WorldCover 10 m: land cover</li>
        <li>Basemap: © OpenStreetMap contributors © CARTO</li>
        <li>ESP32 water-level sensor: live ground reading</li>
      </ul>
      <p className="muted">Processed {fmtDate(meta.generated)}. Full list of data, libraries, APIs and AI tools: CREDITS.md in the project repository.</p>
    </>
  )
}
