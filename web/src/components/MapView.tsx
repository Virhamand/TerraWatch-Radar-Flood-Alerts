import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type ImageSource, type Map as MlMap, type RasterTileSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fmtDate, regionFile, type Region, type WorldEvent } from '../data'
import Icon from './Icon'

const BASE: StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster', tileSize: 256,
      tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`),
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#10161b' } },
    { id: 'base', type: 'raster', source: 'base' },
  ],
}

const gibsTiles = (layer: string, date: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
type Quad = [[number, number], [number, number], [number, number], [number, number]]
const quad = (r: Region) => r.meta.images.bounds as Quad
const outline = (regions: Region[]) => ({
  type: 'FeatureCollection' as const,
  features: regions.map((r) => {
    const [w, s, e, n] = r.meta.aoi_bbox
    return { type: 'Feature' as const, properties: { id: r.id }, geometry: { type: 'LineString' as const, coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] } }
  }),
})

interface Props {
  regions: Region[]
  /** the analysed region whose imagery is loaded */
  active: Region
  events: WorldEvent[]
  pin: { lat: number; lon: number }
  onPin: (lat: number, lon: number) => void
  tierColor: string
  focus: { lat: number; lon: number; zoom: number; n: number } | null
}

export default function MapView({ regions, active, events, pin, onPin, tierColor, focus }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const leftEl = useRef<HTMLDivElement>(null)
  const rightEl = useRef<HTMLDivElement>(null)
  const maps = useRef<{ left: MlMap; right: MlMap } | null>(null)
  const marker = useRef<maplibregl.Marker[]>([])
  const [split, setSplit] = useState(50)
  const [opacity, setOpacity] = useState(0.75)
  const [compare, setCompare] = useState(false)
  const [loaded, setLoaded] = useState(0) // 2 = both maps ready
  const ready = loaded >= 2
  const onPinRef = useRef(onPin)
  onPinRef.current = onPin
  const meta = active.meta

  useEffect(() => {
    const [w, s, e, n] = active.meta.aoi_bbox
    const mk = (el: HTMLDivElement) =>
      new maplibregl.Map({ container: el, style: BASE, bounds: [[w, s], [e, n]], fitBoundsOptions: { padding: 40 }, attributionControl: false })
    const left = mk(leftEl.current!)
    const right = mk(rightEl.current!)
    maps.current = { left, right }
    right.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    right.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    let syncing = false
    const sync = (a: MlMap, b: MlMap) => a.on('move', () => {
      if (syncing) return
      syncing = true
      b.jumpTo({ center: a.getCenter(), zoom: a.getZoom(), bearing: a.getBearing(), pitch: a.getPitch() })
      syncing = false
    })
    sync(left, right); sync(right, left)

    left.on('load', () => {
      left.addSource('pre', { type: 'image', url: regionFile(active, active.meta.images.pre), coordinates: quad(active) })
      left.addLayer({ id: 'pre', type: 'raster', source: 'pre', paint: { 'raster-fade-duration': 0 } })
      // comparison layer: NASA GIBS tiles; the date is swapped per region
      left.addSource('cmp', { type: 'raster', tileSize: 256, maxzoom: 9, tiles: [gibsTiles('MODIS_Terra_CorrectedReflectance_Bands721', '2026-01-01')], attribution: 'NASA GIBS / EOSDIS' })
      left.addLayer({ id: 'cmp', type: 'raster', source: 'cmp', layout: { visibility: 'none' } })
      setLoaded((v) => v + 1)
    })
    right.on('load', () => {
      right.addSource('post', { type: 'image', url: regionFile(active, active.meta.images.post), coordinates: quad(active) })
      right.addLayer({ id: 'post', type: 'raster', source: 'post', paint: { 'raster-fade-duration': 0 } })
      right.addSource('floodimg', { type: 'image', url: regionFile(active, active.meta.images.flood), coordinates: quad(active) })
      right.addLayer({ id: 'floodimg', type: 'raster', source: 'floodimg', paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0 } })
      right.addSource('flood', { type: 'geojson', data: active.flood })
      right.addLayer({
        id: 'flood-line', type: 'line', source: 'flood',
        paint: { 'line-color': ['match', ['get', 'class'], 'flooded_vegetation', '#ffd166', '#7fdcff'], 'line-width': 1.2 },
      })
      right.addSource('aoi', { type: 'geojson', data: outline(regions) })
      right.addLayer({ id: 'aoi', type: 'line', source: 'aoi', paint: { 'line-color': '#ffffff', 'line-opacity': 0.6, 'line-dasharray': [3, 3] } })
      right.addSource('events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: events.map((ev) => ({ type: 'Feature', properties: { title: ev.title }, geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] } })) },
      })
      right.addLayer({ id: 'events', type: 'circle', source: 'events', paint: { 'circle-radius': 6, 'circle-color': '#2b6cb0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
      setLoaded((v) => v + 1)
    })
    const click = (ev: maplibregl.MapMouseEvent) => onPinRef.current(ev.lngLat.lat, ev.lngLat.lng)
    left.on('click', click); right.on('click', click)
    return () => { left.remove(); right.remove(); maps.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // swap imagery when the active region changes
  const shownId = useRef(active.id)
  useEffect(() => {
    const m = maps.current
    if (!m || !ready) return
    if (shownId.current !== active.id) {
      shownId.current = active.id
      const img = (map: MlMap, id: string, file: string) =>
        (map.getSource(id) as ImageSource).updateImage({ url: regionFile(active, file), coordinates: quad(active) })
      img(m.left, 'pre', active.meta.images.pre)
      img(m.right, 'post', active.meta.images.post)
      img(m.right, 'floodimg', active.meta.images.flood)
      ;(m.right.getSource('flood') as GeoJSONSource).setData(active.flood)
    }
    const c = active.meta.compare
    if (c?.kind === 'gibs' && c.layer && c.date) (m.left.getSource('cmp') as RasterTileSource).setTiles([gibsTiles(c.layer, c.date)])
    else setCompare(false)
  }, [active, ready])

  // one marker per map so the pin stays visible on both sides of the swipe
  useEffect(() => {
    const m = maps.current
    if (!m) return
    marker.current.forEach((x) => x.remove())
    marker.current = [m.left, m.right].map((map) => {
      const el = document.createElement('div')
      el.className = 'pin'
      el.style.background = tierColor
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([pin.lon, pin.lat]).addTo(map)
    })
  }, [pin.lat, pin.lon, tierColor, ready])

  useEffect(() => {
    if (!ready) return
    maps.current?.right.setPaintProperty('floodimg', 'raster-opacity', opacity)
    maps.current?.right.setPaintProperty('flood-line', 'line-opacity', Math.min(1, opacity + 0.25))
  }, [opacity, ready])

  useEffect(() => {
    const l = maps.current?.left
    if (!l || !ready) return
    l.setLayoutProperty('cmp', 'visibility', compare ? 'visible' : 'none')
    l.setLayoutProperty('pre', 'visibility', compare ? 'none' : 'visible')
  }, [compare, ready])

  useEffect(() => {
    if (focus) maps.current?.right.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom })
  }, [focus])

  const drag = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    setSplit(Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100)))
  }
  const hasCompare = meta.compare?.kind === 'gibs'

  return (
    <div className="mapwrap" ref={wrap}>
      <div className="map" ref={rightEl} />
      <div className="map left" ref={leftEl} style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />
      <div
        className="handle" style={{ left: `${split}%` }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (e.buttons) drag(e) }}
        role="slider" aria-label="Before and after divider" aria-valuenow={Math.round(split)} aria-valuemin={0} aria-valuemax={100} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') setSplit((v) => Math.max(2, v - 4)); if (e.key === 'ArrowRight') setSplit((v) => Math.min(98, v + 4)) }}
      ><span><Icon name="drag" size={16} /></span></div>

      <div className="maptag tl">
        {compare && meta.compare
          ? <><b>Independent check</b><br />{meta.compare.label}{meta.compare.date ? ` · ${fmtDate(meta.compare.date)}` : ''}</>
          : <><b>Before</b> · NISAR L-band · {fmtDate(meta.pre.acquired)}</>}
      </div>
      <div className="maptag tr"><b>After</b> · NISAR L-band · {fmtDate(meta.post.acquired)} · flood mask</div>

      <div className="mapctl">
        <div className="legend">
          <span><i style={{ background: '#00aaff' }} /> Detected flooding</span>
          <span><i style={{ background: '#ffd166' }} /> Possible flooded vegetation</span>
          <span><i className="dash" /> Analysed area</span>
          <span><i style={{ background: '#2b6cb0', borderRadius: '50%' }} /> Flood event (EONET)</span>
          <span><i className="grad" /> Radar backscatter: dark = smooth water</span>
        </div>
        <label>Flood overlay opacity
          <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} />
        </label>
        {hasCompare && (
          <button aria-pressed={compare} onClick={() => setCompare(!compare)}>Compare with independent NASA layer</button>
        )}
        <div className="src">{meta.collection} · {meta.provider}<br />Click anywhere on the map to move the pin.</div>
      </div>
    </div>
  )
}
