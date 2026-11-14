import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { AppData, WorldEvent } from '../data'
import Icon from './Icon'
import { fmtDate } from '../data'

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
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1220' } },
    { id: 'base', type: 'raster', source: 'base' },
  ],
}

const gibsTiles = (layer: string, date: string) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`

interface Props {
  data: AppData
  pin: { lat: number; lon: number }
  onPin: (lat: number, lon: number) => void
  tierColor: string
  focus: { lat: number; lon: number; zoom: number; n: number } | null
}

export default function MapView({ data, pin, onPin, tierColor, focus }: Props) {
  const { meta } = data
  const wrap = useRef<HTMLDivElement>(null)
  const leftEl = useRef<HTMLDivElement>(null)
  const rightEl = useRef<HTMLDivElement>(null)
  const maps = useRef<{ left: MlMap; right: MlMap } | null>(null)
  const marker = useRef<maplibregl.Marker[]>([])
  const [split, setSplit] = useState(50)
  const [opacity, setOpacity] = useState(0.75)
  const [compare, setCompare] = useState(false)
  const [ready, setReady] = useState(false)
  const onPinRef = useRef(onPin)
  onPinRef.current = onPin

  useEffect(() => {
    const [w, s, e, n] = meta.aoi_bbox
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

    const coords = meta.images.bounds as [[number, number], [number, number], [number, number], [number, number]]
    left.on('load', () => {
      left.addSource('pre', { type: 'image', url: `/data/${meta.images.pre}`, coordinates: coords })
      left.addLayer({ id: 'pre', type: 'raster', source: 'pre', paint: { 'raster-fade-duration': 0 } })
      if (meta.compare?.kind === 'gibs' && meta.compare.layer && meta.compare.date) {
        left.addSource('cmp', {
          type: 'raster', tileSize: 256, maxzoom: 9, tiles: [gibsTiles(meta.compare.layer, meta.compare.date)],
          attribution: 'NASA GIBS / EOSDIS',
        })
        left.addLayer({ id: 'cmp', type: 'raster', source: 'cmp', layout: { visibility: 'none' } })
      } else if (meta.compare?.kind === 'image' && meta.images.compare) {
        left.addSource('cmp', { type: 'image', url: `/data/${meta.images.compare}`, coordinates: coords })
        left.addLayer({ id: 'cmp', type: 'raster', source: 'cmp', layout: { visibility: 'none' } })
      }
    })
    right.on('load', () => {
      right.addSource('post', { type: 'image', url: `/data/${meta.images.post}`, coordinates: coords })
      right.addLayer({ id: 'post', type: 'raster', source: 'post', paint: { 'raster-fade-duration': 0 } })
      right.addSource('floodimg', { type: 'image', url: `/data/${meta.images.flood}`, coordinates: coords })
      right.addLayer({ id: 'floodimg', type: 'raster', source: 'floodimg', paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0 } })
      right.addSource('flood', { type: 'geojson', data: data.flood })
      right.addLayer({
        id: 'flood-line', type: 'line', source: 'flood',
        paint: { 'line-color': ['match', ['get', 'class'], 'flooded_vegetation', '#ffd166', '#7fdcff'], 'line-width': 1.2 },
      })
      right.addSource('aoi', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] } },
      })
      right.addLayer({ id: 'aoi', type: 'line', source: 'aoi', paint: { 'line-color': '#ffffff', 'line-opacity': 0.5, 'line-dasharray': [3, 3] } })
      right.addSource('events', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: data.events.map((ev: WorldEvent) => ({ type: 'Feature', properties: { title: ev.title }, geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] } })) },
      })
      right.addLayer({ id: 'events', type: 'circle', source: 'events', paint: { 'circle-radius': 6, 'circle-color': '#2b6cb0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
      setReady(true)
    })
    const click = (ev: maplibregl.MapMouseEvent) => onPinRef.current(ev.lngLat.lat, ev.lngLat.lng)
    left.on('click', click); right.on('click', click)
    return () => { left.remove(); right.remove(); maps.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // pin marker
  useEffect(() => {
    const m = maps.current
    if (!m) return
    marker.current.forEach((x) => x.remove())
    // one marker per map so the pin stays visible on both sides of the swipe
    marker.current = [m.left, m.right].map((map) => {
      const el = document.createElement('div')
      el.className = 'pin'
      el.style.background = tierColor
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([pin.lon, pin.lat]).addTo(map)
    })
  }, [pin.lat, pin.lon, tierColor, ready])

  useEffect(() => {
    if (ready) maps.current?.right.setPaintProperty('floodimg', 'raster-opacity', opacity)
    if (ready) maps.current?.right.setPaintProperty('flood-line', 'line-opacity', Math.min(1, opacity + 0.25))
  }, [opacity, ready])

  useEffect(() => {
    const l = maps.current?.left
    if (!l || !l.getLayer('cmp')) return
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
  const hasCompare = !!meta.compare

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
        {compare
          ? <><b>Independent check</b><br />{meta.compare!.label}{meta.compare!.date ? ` · ${fmtDate(meta.compare!.date)}` : ''}</>
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
          <button aria-pressed={compare} onClick={() => setCompare(!compare)}>
            Compare with independent NASA layer
          </button>
        )}
        <div className="src">{meta.collection} · {meta.provider}<br />Click the map to move the pin.</div>
      </div>
    </div>
  )
}
