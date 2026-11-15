import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './components/Icon'
import MapView from './components/MapView'
import { fetchCoverage, fetchRain48, fetchSensor, fmtDate, loadData, pushDemoFlags, type AppData, type Audience, type Coverage, type Region } from './data'
import { nearestFloodKm, regionAt } from './shared/geo'
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
  const { config, regions } = data
  const [pin, setPin] = useState<{ lat: number; lon: number }>(() => regions[0].meta.demo_pins?.[0] ?? { lat: config.device_location.lat, lon: config.device_location.lon })
  // `here` = the analysed region the pin is in (null outside every region); `shown` = the region on the map
  const here = useMemo(() => regionAt(regions, pin.lat, pin.lon), [regions, pin.lat, pin.lon])
  const [shownId, setShownId] = useState(regions[0].id)
  useEffect(() => { if (here) setShownId(here.id) }, [here])
  const shown = regions.find((r) => r.id === shownId) ?? regions[0]
  const meta = shown.meta
  const pins = shown.meta.demo_pins ?? []
  const snapshot = (here ?? shown).forecast
  const [coverage, setCoverage] = useState<Coverage | 'loading' | 'error'>('loading')
  const [sim, setSim] = useState({ storm: false, sensor_rise: false })
  const [rain, setRain] = useState<{ mm: number | null; asOf: string | null; live: boolean }>({ mm: null, asOf: null, live: false })
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
      // the saved snapshot only applies inside the region it was taken for
      .catch(() => { if (!dead) setRain(here ? { mm: snapshot.rain_48h_mm, asOf: snapshot.fetched, live: false } : { mm: null, asOf: null, live: false }) })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.lat, pin.lon])

  // outside analysed regions: ask NASA's catalog whether NISAR has imaged this point at all
  useEffect(() => {
    if (here) return
    let dead = false
    setCoverage('loading')
    const t = setTimeout(() => {
      fetchCoverage(pin.lat, pin.lon).then((c) => { if (!dead) setCoverage(c) }).catch(() => { if (!dead) setCoverage('error') })
    }, 400)
    return () => { dead = true; clearTimeout(t) }
  }, [here, pin.lat, pin.lon])

  // ground sensor polling (Firebase)
  useEffect(() => {
    if (!config.firebase_url) return
    const tick = () => fetchSensor(config.firebase_url!).then(setSensor).catch(() => {})
    tick()
    const t = setInterval(tick, 2000)
    return () => clearInterval(t)
  }, [config.firebase_url])

  useEffect(() => { if (config.firebase_url) pushDemoFlags(config.firebase_url, sim) }, [sim, config.firebase_url])

  const dist = useMemo(() => nearestFloodKm(regions, pin.lat, pin.lon), [regions, pin.lat, pin.lon])
  const result: TierResult = useMemo(() => computeTier({
    config, lat: pin.lat, lon: pin.lon, ground: here?.ground ?? null, rain48mm: rain.mm, rainAsOf: rain.asOf,
    sensor, floodDistanceKm: dist, sim, nowMs: now,
  }), [config, pin.lat, pin.lon, here, rain, sensor, dist, sim, now])

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
    const others = data.events.filter((e) => !e.analysed).slice(0, 5)
    others.forEach((e) => addNote({ tier: 'BLUE', title: 'Global report', body: `${e.title} (${fmtDate(e.date)})` }, false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (shouldNotify(prevTier.current, result.tier)) {
      addNote({ tier: result.tier, title: result.title, body: result.reason + (result.simulated ? ' (includes simulated signals)' : '') }, true)
    } else if (prevTier.current && TIER_META[result.tier].code < TIER_META[prevTier.current].code) {
      setBanner(null)
    }
    prevTier.current = result.tier
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.tier])

  const tm = TIER_META[result.tier]
  const briefing = (here ? here.briefings : data.globalBriefings)[result.tier]?.[aud]
  const anyFixture = regions.some((r) => r.meta.fixture)
  const goTo = (r: Region) => {
    const p = r.meta.demo_pins?.[0] ?? { lat: (r.meta.aoi_bbox[1] + r.meta.aoi_bbox[3]) / 2, lon: (r.meta.aoi_bbox[0] + r.meta.aoi_bbox[2]) / 2 }
    setPin({ lat: p.lat, lon: p.lon }); setShownId(r.id)
    setFocus({ lat: (r.meta.aoi_bbox[1] + r.meta.aoi_bbox[3]) / 2, lon: (r.meta.aoi_bbox[0] + r.meta.aoi_bbox[2]) / 2, zoom: 8.6, n: Date.now() })
  }
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
          <button className="bell" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`} aria-expanded={bellOpen}
            onClick={() => { setBellOpen(!bellOpen); setUnread(0) }}>
            <Icon name="bell" size={18} />{unread > 0 && <b>{unread}</b>}
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
              <div key={n.id} className="note">
                <i className="chip" style={{ background: TIER_META[n.tier].color }} />
                <div><b>{n.title}</b><span>{n.body}</span><small>{new Date(n.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>
              </div>
            ))}
          </div>
        )}

        {anyFixture && <div className="fixture" role="note"><b>Placeholder data.</b> These are synthetic test scenes, not real NISAR analyses yet.</div>}

        <section className="tier" data-tier={result.tier} aria-live="polite">
          <div className="tierhead">
            <span className="lvl">{result.tier}</span>
            <h2>{result.title}</h2>
            {result.simulated && <em>Simulated</em>}
          </div>
          <p className="reason">{result.reason}</p>
          <ul className="signals">
            {result.signals.map((s, i) => (
              <li key={s.id} className={s.high ? 'high' : s.status !== 'ok' ? 'off' : ''}>
                <span className="dot" />
                <div>
                  <b>{s.label}{s.simulated && <em>Simulated</em>}</b>
                  <span>{s.value}</span>
                  <small>{s.source}{s.asOf ? ` · ${ageLabel(s.asOf, now)}` : ''}</small>
                </div>
                <strong>{s.high ? 'High' : s.status === 'ok' ? 'Normal' : s.status === 'offline' ? 'Offline' : 'No data'}</strong>
              </li>
            ))}
          </ul>
          {!here && (
            <p className="coverage">
              <b>No NISAR flood analysis here yet.</b>{' '}
              {coverage === 'loading' ? 'Checking NASA\u2019s catalog for NISAR coverage\u2026'
                : coverage === 'error' ? 'NISAR coverage lookup is unavailable right now.'
                : coverage.scenes === 0 || !coverage.latest ? 'NASA\u2019s catalog lists no NISAR scenes over this point.'
                : `NISAR last imaged this point on ${fmtDate(coverage.latest)} (${coverage.scenes.toLocaleString()} scenes in NASA\u2019s catalog).`}{' '}
              The alert level here uses the rain forecast and ground sensor only.
            </p>
          )}
          <div className="fresh">
            <span title={here?.meta.post.acquired}><Icon name="satellite" size={14} />Satellite {here ? ageLabel(here.meta.post.acquired, now) : typeof coverage === 'object' && coverage.latest ? `last pass ${ageLabel(coverage.latest, now)}` : 'no analysis here'}</span>
            <span><Icon name="rain" size={14} />Forecast {sim.storm ? 'simulated' : `${rain.asOf ? ageLabel(rain.asOf, now) : 'unavailable'}${rain.live || !rain.asOf ? '' : ' (saved)'}`}</span>
            <span><Icon name="sensor" size={14} />Sensor {sensorSig.simulated ? 'simulated' : sensorSig.status === 'ok' ? ageLabel(sensorSig.asOf, now) : 'offline'}</span>
          </div>
        </section>

        <section className="demo">
          <div className="row"><h3>Demo location</h3><small className="num">{pin.lat.toFixed(3)}, {pin.lon.toFixed(3)}</small></div>
          {regions.length > 1 && (
            <div className="seg regions" role="group" aria-label="Analysed regions">
              {regions.map((r) => <button key={r.id} aria-pressed={r.id === shown.id} title={r.title} onClick={() => goTo(r)}>{r.short ?? r.title}</button>)}
            </div>
          )}
          <div className="btns">
            {pins.map((p) => (
              <button key={p.label} aria-pressed={p.lat === pin.lat && p.lon === pin.lon}
                onClick={() => { setPin({ lat: p.lat, lon: p.lon }); setFocus({ lat: p.lat, lon: p.lon, zoom: 9.5, n: Date.now() }) }}><Icon name="pin" />{p.label}</button>
            ))}
            <button onClick={() => navigator.geolocation?.getCurrentPosition((g) => {
              setPin({ lat: g.coords.latitude, lon: g.coords.longitude })
              setFocus({ lat: g.coords.latitude, lon: g.coords.longitude, zoom: 8, n: Date.now() })
            })}><Icon name="locate" />My location</button>
          </div>
          <div className="switches">
            <button role="switch" aria-checked={sim.storm} onClick={() => setSim({ ...sim, storm: !sim.storm })}>
              <Icon name="rain" /><span>Simulate storm</span><i className="track" />
            </button>
            <button role="switch" aria-checked={sim.sensor_rise} onClick={() => setSim({ ...sim, sensor_rise: !sim.sensor_rise })}>
              <Icon name="wave" /><span>Simulate sensor rise</span><i className="track" />
            </button>
          </div>
        </section>

        <nav role="tablist" aria-label="Details">
          {([['briefing', 'Briefing'], ['stats', 'Stats'], ['world', `World${world.length ? ` (${world.length})` : ''}`], ['how', 'How it works'], ['credits', 'Credits']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        <section className="panel">
          {tab === 'briefing' && (
            <>
              <div className="seg" role="group" aria-label="Briefing audience">
                {AUDIENCES.map((a) => <button key={a.id} aria-pressed={aud === a.id} onClick={() => setAud(a.id)}>{a.label}</button>)}
              </div>
              <p className="brief">{briefing?.text ?? 'No briefing cached for this alert level.'}</p>
              <small className="muted">
                AI-written explanation of the computed results above{briefing && briefing.model !== 'none' ? ` (${briefing.model}, ${fmtDate(briefing.generated)})` : ''}.
                The AI does not detect floods or choose the alert level.
              </small>
            </>
          )}
          {tab === 'stats' && <StatsPanel region={shown} />}
          {tab === 'world' && (
            <>
              <h3>Around the world</h3>
              <p className="muted"><i className="chip" style={{ background: TIER_META.BLUE.color }} />Global report: floods and severe storms from NASA EONET, plus areas TerraWatch has analysed with NISAR.</p>
              {world.map((e) => (
                <button key={e.id} className="event" onClick={() => { const r = regions.find((x) => x.id === e.region); if (r) goTo(r); else setFocus({ lat: e.lat, lon: e.lon, zoom: 5, n: Date.now() }) }}>
                  <b>{e.title}</b>
                  <span>{fmtDate(e.date)} · {e.category === 'severeStorms' ? 'Severe storm' : 'Flood'} · {e.source}{e.analysed ? ' · NISAR analysis available' : ''}</span>
                </button>
              ))}
            </>
          )}
          {tab === 'how' && <HowPanel />}
          {tab === 'credits' && <CreditsPanel region={shown} />}
        </section>
        <footer>TerraWatch supplements, but does not replace, official emergency alerts.<br />Prototype built for NASA Space Apps 2026.</footer>
      </aside>

      <main>
        {banner && (
          <div className="banner" data-tier={banner.tier} role="alert">
            <span><b>{banner.title}.</b> {banner.body}</span>
            <button onClick={() => setBanner(null)} aria-label="Dismiss alert"><Icon name="close" size={14} /></button>
          </div>
        )}
        <MapView regions={regions} active={shown} events={data.events} pin={pin} onPin={(lat, lon) => setPin({ lat, lon })} tierColor={tm.color} focus={focus} />
      </main>
    </div>
  )
}

function StatsPanel({ region }: { region: Region }) {
  const { stats, meta } = region
  const max = Math.max(...stats.by_landcover.map((l) => l.km2), 0.001)
  return (
    <>
      <h3>{region.title}</h3>
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
        ({stats.method.permanent_water}) and {stats.method.slope_max_deg != null ? `slopes over ${stats.method.slope_max_deg}° ` : 'no slope mask; '}are removed; patches under {stats.method.min_patch_ha} ha are dropped.{stats.method.alert_min_patch_km2 ? ` Alerts use flooded patches of at least ${stats.method.alert_min_patch_km2} km²; smaller ones are shown on the map only.` : ''}
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
        <li><i className="chip" style={{ background: TIER_META.RED.color }} /><span><b>Red – Flood imminent or occurring:</b> satellite data shows flooding at your location, or at least three independent warning signs agree.</span></li>
        <li><i className="chip" style={{ background: TIER_META.ORANGE.color }} /><span><b>Orange – Flood warning:</b> flooding has been detected nearby, or two warning signs agree.</span></li>
        <li><i className="chip" style={{ background: TIER_META.YELLOW.color }} /><span><b>Yellow – Flood watch:</b> ground conditions are wet and significant rain is expected.</span></li>
        <li><i className="chip" style={{ background: TIER_META.GREEN.color }} /><span><b>Green – No current concern:</b> no warning signs detected in your area.</span></li>
        <li><i className="chip" style={{ background: TIER_META.BLUE.color }} /><span><b>Blue – Global report:</b> a major flood has been detected elsewhere in the world.</span></li>
      </ul>
      <p>Every alert shows which signals triggered it and how recent the data is. NISAR passes over each location about every 12 days, so TerraWatch adds forecasts and ground sensors between passes.</p>
      <p><b>TerraWatch supplements, but does not replace, official emergency alerts.</b></p>
    </>
  )
}

function CreditsPanel({ region }: { region: Region }) {
  const { meta } = region
  return (
    <>
      <h3>NASA data in this view: {region.title}</h3>
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
        <li>Basemap: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors</li>
        <li>NASA CMR catalog: live NISAR coverage lookup for any location</li>
        <li>ESP32 water-level sensor: live ground reading</li>
      </ul>
      <p className="muted">Processed {fmtDate(meta.generated)}. Full list of data, libraries, APIs and AI tools: CREDITS.md in the project repository.</p>
    </>
  )
}
