"""Export one region's detection results to web/public/data/<id>/ and refresh the shared index files.

Usage: python pipeline/05_export.py --region <id>

Reads pipeline/data/: pre_db.tif, post_db.tif, flood_mask.tif, detect.json, optional worldcover.tif,
jrc_occurrence.tif, pre_/post_<WETNESS_POL>.tif, shortlist.json, fetch.json (granule info from 03).
Writes: pre.png, post.png, flood.png, flood.geojson, stats.json, signals.json, meta.json,
        events.json, forecast.json, and config.json (thresholds kept if the file already exists).
"""
import json
import shutil
from datetime import datetime, timezone

import numpy as np
import rasterio
import requests
from PIL import Image
from pyproj import Geod
from rasterio import features
from rasterio.warp import Resampling, calculate_default_transform, reproject
from shapely.geometry import Point, mapping, shape
from shapely.ops import unary_union

import config

D, OUT = config.DATA, config.PUBLIC  # replaced by the region's folders in main()
GEOD = Geod(ellps="WGS84")
MAX_PX = 1600
WORLDCOVER = {10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland", 50: "Built-up",
              60: "Bare / sparse", 70: "Snow and ice", 80: "Permanent water", 90: "Herbaceous wetland",
              95: "Mangroves", 100: "Moss and lichen"}


def load_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def read(name):
    p = D / name
    if not p.exists():
        return None, None
    with rasterio.open(p) as src:
        return src.read(1), src.profile


def to_wgs84(arr, prof, resampling, dst_nodata):
    """Reproject one band to EPSG:4326, capped at MAX_PX on the long side."""
    h, w = arr.shape
    left, top = prof["transform"] * (0, 0)
    right, bottom = prof["transform"] * (w, h)
    t, dw, dh = calculate_default_transform(prof["crs"], "EPSG:4326", w, h, left=min(left, right), bottom=min(top, bottom),
                                            right=max(left, right), top=max(top, bottom))
    s = min(1.0, MAX_PX / max(dw, dh))
    if s < 1:
        t = t * t.scale(1 / s, 1 / s)
        dw, dh = int(dw * s), int(dh * s)
    dst = np.full((dh, dw), dst_nodata, arr.dtype)
    reproject(arr, dst, src_transform=prof["transform"], src_crs=prof["crs"], dst_transform=t, dst_crs="EPSG:4326",
              resampling=resampling, src_nodata=prof.get("nodata"), dst_nodata=dst_nodata)
    return dst, t


def gray_png(db, path, lo, hi):
    g = np.clip((db - lo) / (hi - lo), 0, 1)
    rgba = np.zeros((*db.shape, 4), "uint8")
    v = (np.nan_to_num(g) * 255).astype("uint8")
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = v
    rgba[..., 3] = np.where(np.isfinite(db), 255, 0)
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def km2_of(geom):
    return abs(GEOD.geometry_area_perimeter(geom)[0]) / 1e6


def main():
    global D, OUT
    rid, rcfg, D, OUT = config.region_from_args(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    ROOT_OUT = config.PUBLIC
    det = load_json(D / "detect.json")
    fetch = load_json(D / "fetch.json", {})
    if det is None:
        raise SystemExit("Run 04_detect.py first")
    pre, prof = read("pre_db.tif")
    post, _ = read("post_db.tif")
    mask, mprof = read("flood_mask.tif")
    px_km2 = det["pixel_m"][0] * det["pixel_m"][1] / 1e6

    # ---------- display images (shared stretch so before/after are comparable)
    both = np.concatenate([pre[np.isfinite(pre)][::7], post[np.isfinite(post)][::7]])
    lo, hi = float(np.percentile(both, 1)), float(np.percentile(both, 99))
    pre4, t = to_wgs84(pre, prof, Resampling.bilinear, np.nan)
    post4, _ = to_wgs84(post, prof, Resampling.bilinear, np.nan)
    mask4, _ = to_wgs84(mask, mprof, Resampling.nearest, 255)
    h, w = mask4.shape
    west, north = t * (0, 0)
    east, south = t * (w, h)
    gray_png(pre4, OUT / "pre.png", lo, hi)
    gray_png(post4, OUT / "post.png", lo, hi)
    rgba = np.zeros((h, w, 4), "uint8")
    rgba[mask4 == 1] = (0, 170, 255, 230)
    rgba[mask4 == 2] = (255, 209, 102, 230)
    Image.fromarray(rgba, "RGBA").save(OUT / "flood.png", optimize=True)
    bbox = [round(west, 5), round(south, 5), round(east, 5), round(north, 5)]

    # ---------- polygons
    tol = abs(t.a) * 1.2
    feats = []
    for cls, name in [(1, "open_water_flood"), (2, "flooded_vegetation")]:
        m = mask4 == cls
        for geom, _v in features.shapes(m.astype("uint8"), mask=m, transform=t):
            g = shape(geom).simplify(tol).buffer(0)
            if g.is_empty:
                continue
            a = km2_of(g)
            if a * 100 >= config.MIN_PATCH_HA:
                feats.append((a, name, g))
    feats.sort(key=lambda f: -f[0])
    feats = feats[:500]
    change, _ = read("change_db.tif")
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": mapping(g),
         "properties": {"id": i + 1, "class": name, "area_km2": round(a, 3)}} for i, (a, name, g) in enumerate(feats)]}
    (OUT / "flood.geojson").write_text(json.dumps(fc, separators=(",", ":")))

    # ---------- stats (native grid, so areas are exact)
    flood = mask == 1
    wc, _ = read("worldcover.tif")
    by_lc = []
    if wc is not None and flood.any():
        codes, counts = np.unique(wc[flood], return_counts=True)
        tot = counts.sum()
        for c, n in sorted(zip(codes, counts), key=lambda x: -x[1]):
            if n / tot >= 0.01:
                by_lc.append({"class": WORLDCOVER.get(int(c), f"Class {int(c)}"), "code": int(c),
                              "km2": round(float(n) * px_km2, 1), "pct": round(100 * n / tot)})
    stats = {
        "flooded_km2": round(det["flooded_km2"], 1), "flooded_vegetation_km2": round(det["flooded_vegetation_km2"], 1),
        "aoi_km2": round(det["valid_km2"]), "by_landcover": by_lc,
        "mean_change_db": round(float(np.nanmean(change[flood])), 1) if flood.any() else None,
        "method": {"pol": det["pol"], "otsu_threshold_db": det["threshold_db"], "threshold_source": det["threshold_source"],
                   "min_patch_ha": det["min_patch_ha"], "slope_max_deg": det["slope_max_deg"],
                   "permanent_water": (f"JRC GSW occurrence >= {det['jrc_permanent_pct']}%" if det["jrc_permanent_pct"] else "not removed"),
                   "notes": det["notes"]},
    }
    (OUT / "stats.json").write_text(json.dumps(stats, indent=1))

    # ---------- ground signals per grid cell (signals 1 and 2)
    wpol = config.WETNESS_POL if (D / f"post_{config.WETNESS_POL}.tif").exists() else config.POL
    wpre_p, wprof = read(f"pre_{wpol}.tif")
    wpost_p, _ = read(f"post_{wpol}.tif")
    with np.errstate(divide="ignore", invalid="ignore"):
        wpre = 10 * np.log10(np.where(wpre_p > 0, wpre_p, np.nan))
        wpost = 10 * np.log10(np.where(wpost_p > 0, wpost_p, np.nan))
    jrc, _ = read("jrc_occurrence.tif")
    perm = (jrc >= config.JRC_PERMANENT_PCT) & (jrc <= 100) if jrc is not None else np.zeros(mask.shape, bool)
    land = (mask == 0) & ~perm  # wetness is measured on unflooded land only
    wpre4, _ = to_wgs84(np.where(land, wpre, np.nan).astype("float32"), wprof, Resampling.average, np.nan)
    wpost4, _ = to_wgs84(np.where(land, wpost, np.nan).astype("float32"), wprof, Resampling.average, np.nan)
    perm4, _ = to_wgs84(perm.astype("uint8"), mprof, Resampling.nearest, 255)  # 255 = outside; a 0 no-data value corrupts the mask
    step = config.SIGNAL_CELL_DEG
    cells, pre_meds, post_meds = [], [], []
    lat_mid = (south + north) / 2
    cell_px_km2 = abs(t.a) * 111.32 * np.cos(np.radians(lat_mid)) * abs(t.e) * 110.57
    x0 = np.floor(west / step) * step
    y0 = np.floor(south / step) * step
    for cx in np.arange(x0, east, step):
        for cy in np.arange(y0, north, step):
            c0, r0 = ~t * (cx, cy + step)
            c1, r1 = ~t * (cx + step, cy)
            r0, r1, c0, c1 = max(0, int(r0)), min(h, int(r1)), max(0, int(c0)), min(w, int(c1))
            if r1 - r0 < 4 or c1 - c0 < 4:
                continue
            sl = (slice(r0, r1), slice(c0, c1))
            good = (mask4[sl] != 255).mean()
            if good < 0.3:
                continue
            a, b = wpre4[sl], wpost4[sl]
            wet_ok = np.isfinite(b).sum() > 20
            water = ((mask4[sl] == 1) | (perm4[sl] == 1)).sum() * cell_px_km2
            base = max(float(perm4[sl].sum()) * cell_px_km2, 0.005 * (r1 - r0) * (c1 - c0) * cell_px_km2)
            cells.append({"bbox": [round(cx, 4), round(cy, 4), round(cx + step, 4), round(cy + step, 4)],
                          "_pre": float(np.nanmedian(a)) if np.isfinite(a).sum() > 20 else None,
                          "_post": float(np.nanmedian(b)) if wet_ok else None,
                          "water_ratio": round(min(99.0, water / base), 1),
                          "water_km2": round(float(water), 2), "baseline_km2": round(base, 2)})
    pool = np.array([c[k] for c in cells for k in ("_pre", "_post") if c[k] is not None])
    for c in cells:
        c["wetness"] = None if c["_post"] is None or pool.size < 4 else round(float((pool < c["_post"]).mean()), 2)
        del c["_pre"], c["_post"]
    post_time = fetch.get("post", {}).get("acquired", "")
    (OUT / "signals.json").write_text(json.dumps({
        "as_of": post_time, "cell_deg": step,
        "wetness_source": f"NISAR {wpol} backscatter wetness proxy (brighter unflooded land = wetter)",
        "water_source": "NISAR water extent vs JRC Global Surface Water", "cells": cells}, separators=(",", ":")))

    # ---------- meta
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    old_meta = load_json(OUT / "meta.json", {})
    meta = {"id": rid, "event": rcfg["event"], "aoi_bbox": bbox, "pre": fetch.get("pre", {}), "post": fetch.get("post", {}),
            "collection": fetch.get("collection", config.PREFERRED_COLLECTION), "provider": "ASF DAAC",
            "images": {"pre": "pre.png", "post": "post.png", "flood": "flood.png", "compare": None,
                       "bounds": [[bbox[0], bbox[3]], [bbox[2], bbox[3]], [bbox[2], bbox[1]], [bbox[0], bbox[1]]]},
            "compare": None if old_meta.get("fixture") else old_meta.get("compare"),
            "display_stretch_db": [round(lo, 1), round(hi, 1)], "generated": now}
    if not meta["compare"] and post_time:
        meta["compare"] = {"kind": "gibs", "layer": "MODIS_Terra_CorrectedReflectance_Bands721", "date": post_time[:10],
                           "label": "NASA GIBS: MODIS Terra false colour (bands 7-2-1; water appears dark blue/black)"}
    # ---------- demo pins for this region
    pins = old_meta.get("demo_pins") if old_meta.get("pins_locked") else None
    if not pins and feats:
        allflood = unary_union([g for _a, n, g in feats if n == "open_water_flood"][:200] or [feats[0][2]])
        inside = feats[0][2].representative_point()
        # candidate pin sites: centres of signal cells that are mostly dry land with a wetness value
        cell_km2 = (step * 111.32 * np.cos(np.radians(lat_mid))) * (step * 110.57)
        land = [Point((c["bbox"][0] + c["bbox"][2]) / 2, (c["bbox"][1] + c["bbox"][3]) / 2) for c in cells
                if c["wetness"] is not None and c["water_km2"] < 0.05 * cell_km2]
        if not land:
            land = [Point(bbox[0] + 0.02, bbox[1] + 0.02), Point(bbox[2] - 0.02, bbox[3] - 0.02)]
        far = max(land, key=lambda p: p.distance(allflood))
        near = min(land, key=lambda p: abs(p.distance(allflood) * 111 - 10))  # about 10 km from flooding
        pin = lambda label, p: {"label": label, "lat": round(p.y, 4), "lon": round(p.x, 4)}  # noqa: E731
        pins = [pin("Far from flood", far), pin("Near flood", near), pin("Inside flood", inside)]
        print(f"Demo pins set: far pin ~{far.distance(allflood) * 111:.0f} km and near pin ~{near.distance(allflood) * 111:.0f} km from mapped flooding. "
              f'Add "pins_locked": true to {rid}/meta.json to keep hand-edited pins.')
    meta["demo_pins"] = pins or []
    meta["pins_locked"] = bool(old_meta.get("pins_locked"))
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1))

    # ---------- shared index: regions.json (fixture regions are dropped once a real one exists)
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    index = [r for r in load_json(ROOT_OUT / "regions.json", []) if r["id"] != rid]
    for r in [r for r in index if r.get("fixture")]:
        shutil.rmtree(ROOT_OUT / r["id"], ignore_errors=True)
    index = [r for r in index if not r.get("fixture")]
    index.append({"id": rid, "title": rcfg["title"], "short": rcfg.get("short", rcfg["title"]), "bbox": bbox,
                  "date": post_time[:10], "lat": round(cy, 3), "lon": round(cx, 3), "event_id": rcfg["event"].get("id", ""),
                  "link": rcfg["event"].get("source_url", "")})
    (ROOT_OUT / "regions.json").write_text(json.dumps(index, indent=1))

    # ---------- shared events feed: analysed regions first, then recent EONET events
    events, seen = [], set()
    for r in index:
        events.append({"id": r.get("event_id") or r["id"], "title": r["title"], "category": "floods", "date": r["date"],
                       "lat": r["lat"], "lon": r["lon"], "source": "TerraWatch", "link": r.get("link", ""),
                       "analysed": True, "region": r["id"]})
        seen.add((r.get("event_id") or "").split("#")[0])
    sl = load_json(config.DATA / "shortlist.json", {})
    pool_ev = [r["event"] for r in sl.get("pairs", []) + sl.get("no_pair", []) if r["event"].get("source") == "EONET"]
    for ev in sorted(pool_ev, key=lambda e: e["date"], reverse=True):
        base = ev["id"].split("#")[0]
        if base in seen:
            continue
        seen.add(base)
        events.append({"id": base, "title": ev["title"], "category": ev["category"], "date": ev["date"],
                       "lat": ev["lat"], "lon": ev["lon"], "source": "EONET", "link": ev.get("link", ""), "analysed": False})
        if len(events) >= len(index) + 12:
            break
    (ROOT_OUT / "events.json").write_text(json.dumps(events, indent=1))

    # ---------- forecast snapshot
    try:
        r = requests.get("https://api.open-meteo.com/v1/forecast", timeout=20, params={
            "latitude": round(cy, 3), "longitude": round(cx, 3), "hourly": "precipitation", "forecast_days": 3, "timezone": "UTC"})
        mm = round(sum(x or 0 for x in r.json()["hourly"]["precipitation"][:48]), 1)
        (OUT / "forecast.json").write_text(json.dumps({"lat": cy, "lon": cx, "rain_48h_mm": mm, "fetched": now, "source": "Open-Meteo"}))
    except Exception as e:  # noqa: BLE001
        print("!! forecast snapshot failed (keeping the old one):", e)
        if load_json(OUT / "forecast.json") is None:
            (OUT / "forecast.json").write_text(json.dumps({"lat": cy, "lon": cx, "rain_48h_mm": 0, "fetched": now, "source": "unavailable"}))

    # ---------- shared config: keep tuned thresholds; default the ESP32 site to this region's far pin
    cfg = load_json(ROOT_OUT / "config.json", {})
    defaults = {"wetness_percentile_high": 0.8, "water_ratio_high": 1.5, "rain_48h_mm_high": 50, "sensor_rise_high": 150,
                "sensor_rise_window_s": 20, "sensor_stale_s": 30, "near_km": 5, "far_km": 25, "sim": {"rain_48h_mm": 85},
                "firebase_url": ""}
    cfg = {**defaults, **cfg}
    cfg.pop("demo_pins", None)
    dev = cfg.get("device_location")
    known = any(r["bbox"][0] <= dev["lon"] <= r["bbox"][2] and r["bbox"][1] <= dev["lat"] <= r["bbox"][3] for r in index) if dev else False
    if pins and not (known and cfg.get("device_locked")):
        if not known:
            cfg["device_location"] = {"lat": pins[0]["lat"], "lon": pins[0]["lon"], "label": f"Demo sensor site ({rcfg.get('short', rid)})"}
    (ROOT_OUT / "config.json").write_text(json.dumps(cfg, indent=1))
    if not (ROOT_OUT / "briefings.json").exists():
        (ROOT_OUT / "briefings.json").write_text("{}")
    if not (OUT / "briefings.json").exists():
        (OUT / "briefings.json").write_text("{}")

    print(f"\nExported to {OUT}: {len(feats)} polygons, {stats['flooded_km2']} km2 flooded, {len(cells)} signal cells, "
          f"{len(events)} events.")
    for n in ["pre.png", "post.png", "flood.png", "flood.geojson", "signals.json"]:
        print(f"  {n}: {(OUT / n).stat().st_size / 1024:.0f} KB")
    print(f"Next: python pipeline/06_briefings.py --region {rid}")


if __name__ == "__main__":
    main()
