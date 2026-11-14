"""Write SYNTHETIC placeholder data to web/public/data so the frontend can be built before the
real NISAR exports exist. Every region is marked fixture=true and the app shows a notice.

Layout written (same as 05_export.py):
  data/config.json  data/events.json  data/regions.json  data/briefings.json (unanalysed places)
  data/<region>/meta.json stats.json signals.json flood.geojson briefings.json forecast.json *.png

Usage: python pipeline/make_fixtures.py     (05_export.py removes fixture regions when it runs)
"""
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 700
now = datetime.now(timezone.utc).isoformat(timespec="seconds")
AUD = ["resident", "emergency_manager", "farmer", "student"]


def placeholder_briefings(where):
    b = {"fixture": True, "facts": {}}
    for t in ["GREEN", "YELLOW", "ORANGE", "RED", "BLUE"]:
        b[t] = {a: {"text": f"[Placeholder briefing: {t} / {a.replace('_', ' ')} / {where}. Real text is generated "
                            f"by pipeline/06_briefings.py from the computed facts.]", "model": "none", "generated": now}
                for a in AUD}
    return b


def make_region(rid, title, W, S, seed, post_date):
    """One synthetic 0.5 x 0.5 degree scene with a river and three flood patches."""
    E, N = W + 0.5, S + 0.5
    d = OUT / rid
    d.mkdir(exist_ok=True)
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    lon = W + (E - W) * xx / SIZE
    lat = N - (N - S) * yy / SIZE
    river = np.abs(lat - (S + 0.25 + 0.06 * np.sin((lon - W) * 14))) < 0.008
    floods = [(W + 0.18, S + 0.23, 0.075, 0.045), (W + 0.32, S + 0.29, 0.05, 0.03), (W + 0.10, S + 0.20, 0.03, 0.02)]
    flood = np.zeros_like(river)
    for e in floods:
        flood |= ((lon - e[0]) / e[2]) ** 2 + ((lat - e[1]) / e[3]) ** 2 <= 1
    flood &= ~river

    def scene(water):
        base = -9 + 2.5 * np.sin(xx / 60) * np.cos(yy / 45) + rng.normal(0, 1.6, (SIZE, SIZE))
        db = np.where(water, -22 + rng.normal(0, 1.2, (SIZE, SIZE)), base)
        return Image.fromarray((np.clip((db + 26) / 22, 0, 1) * 255).astype("uint8"), "L").convert("RGB")

    scene(river).save(d / "pre.png")
    scene(river | flood).save(d / "post.png")
    rgba = np.zeros((SIZE, SIZE, 4), "uint8")
    rgba[flood] = (0, 170, 255, 220)
    Image.fromarray(rgba, "RGBA").save(d / "flood.png")

    feats = []
    for i, e in enumerate(floods, 1):
        ring = [[round(e[0] + e[2] * math.cos(t), 5), round(e[1] + e[3] * math.sin(t), 5)] for t in np.linspace(0, 2 * math.pi, 49)]
        ring[-1] = ring[0]
        km2 = math.pi * (e[2] * 111.32 * math.cos(math.radians(e[1]))) * (e[3] * 110.57)
        feats.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                      "properties": {"id": i, "class": "open_water_flood", "area_km2": round(km2, 2)}})
    (d / "flood.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    total = round(sum(f["properties"]["area_km2"] for f in feats), 1)

    pins = [{"label": "Far from flood", "lat": round(S + 0.80, 3), "lon": round(W + 0.85, 3)},
            {"label": "Near flood", "lat": round(S + 0.38, 3), "lon": round(W + 0.42, 3)},
            {"label": "Inside flood", "lat": round(S + 0.29, 3), "lon": round(W + 0.32, 3)}]
    meta = {
        "fixture": True, "id": rid,
        "event": {"id": f"FIXTURE_{rid}", "title": title, "country": "n/a", "date": post_date, "source_url": ""},
        "aoi_bbox": [W, S, E, N],
        "pre": {"granule": "FIXTURE_PRE", "acquired": "2026-08-24T11:02:00Z", "track": "000", "frame": "000", "pols": ["HH", "HV"]},
        "post": {"granule": "FIXTURE_POST", "acquired": f"{post_date}T11:02:00Z", "track": "000", "frame": "000", "pols": ["HH", "HV"]},
        "collection": "NISAR_L2_GCOV_PROVISIONAL_V1", "provider": "ASF DAAC",
        "images": {"pre": "pre.png", "post": "post.png", "flood": "flood.png", "compare": None,
                   "bounds": [[W, N], [E, N], [E, S], [W, S]]},
        "compare": {"kind": "gibs", "layer": "MODIS_Terra_CorrectedReflectance_Bands721", "date": post_date,
                    "label": "NASA GIBS: MODIS Terra false colour (bands 7-2-1)"},
        "demo_pins": pins, "generated": now,
    }
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    stats = {"flooded_km2": total, "flooded_vegetation_km2": 0,
             "aoi_km2": round(0.5 * 111.32 * math.cos(math.radians(S)) * 0.5 * 110.57),
             "by_landcover": [{"class": "Cropland", "code": 40, "km2": round(total * .58, 1), "pct": 58},
                              {"class": "Grassland", "code": 30, "km2": round(total * .22, 1), "pct": 22},
                              {"class": "Tree cover", "code": 10, "km2": round(total * .12, 1), "pct": 12},
                              {"class": "Built-up", "code": 50, "km2": round(total * .08, 1), "pct": 8}],
             "method": {"pol": "HH", "otsu_threshold_db": -3.4, "min_patch_ha": 1, "slope_max_deg": 5,
                        "permanent_water": "JRC GSW occurrence >= 80%"}}
    (d / "stats.json").write_text(json.dumps(stats, indent=1))

    cells, step = [], 0.1
    for i in range(10):  # the signal grid is wider than the image: ground signals can cover the whole NISAR frame
        for j in range(9):
            w, s = round(W + i * step, 2), round(S + j * step, 2)
            cx, cy = w + step / 2, s + step / 2
            dist = min(math.hypot(cx - e[0], cy - e[1]) for e in floods)
            cells.append({"bbox": [w, s, round(w + step, 2), round(s + step, 2)],
                          "wetness": 0.86 if cy > S + 0.7 else round(max(0.2, min(0.98, 0.95 - 1.8 * dist)), 2),
                          "water_ratio": round(max(1.0, 3.2 - 22 * dist), 1)})
    (d / "signals.json").write_text(json.dumps(
        {"as_of": meta["post"]["acquired"], "wetness_source": "NISAR HV backscatter wetness proxy",
         "water_source": "NISAR water extent vs JRC Global Surface Water", "cell_deg": step, "cells": cells}, indent=1))
    (d / "forecast.json").write_text(json.dumps(
        {"lat": S + 0.25, "lon": W + 0.25, "rain_48h_mm": 6.4, "fetched": now, "source": "Open-Meteo"}))
    (d / "briefings.json").write_text(json.dumps(placeholder_briefings(rid), indent=1))
    return {"id": rid, "title": title, "short": "Test scene " + rid[-1].upper(), "bbox": [W, S, round(W + 1.0, 2), round(S + 0.9, 2)], "date": post_date,
            "lat": S + 0.25, "lon": W + 0.25, "fixture": True}, pins


for old in OUT.iterdir():  # clear old flat-layout fixture files
    if old.is_file() and old.name != "config.json":
        old.unlink()
regions, first_pins = [], None
for args in [("fixture_a", "Synthetic placeholder flood A (not real data)", 103.80, 12.70, 7, "2026-09-05"),
             ("fixture_b", "Synthetic placeholder flood B (not real data)", 91.00, 24.50, 11, "2026-10-12")]:
    idx, pins = make_region(*args)
    regions.append(idx)
    first_pins = first_pins or pins
(OUT / "regions.json").write_text(json.dumps(regions, indent=1))

cfg_path = OUT / "config.json"
old = json.loads(cfg_path.read_text()) if cfg_path.exists() else {}
config = {"wetness_percentile_high": 0.8, "water_ratio_high": 1.5, "rain_48h_mm_high": 50,
          "sensor_rise_high": 150, "sensor_rise_window_s": 20, "sensor_stale_s": 30, "near_km": 5, "far_km": 25,
          "sim": {"rain_48h_mm": 85}, "firebase_url": old.get("firebase_url", ""),
          "device_location": {"lat": first_pins[0]["lat"], "lon": first_pins[0]["lon"], "label": "Demo sensor site"}}
cfg_path.write_text(json.dumps(config, indent=1))

events = [{"id": f"FIXTURE_{r['id']}", "title": r["title"], "category": "floods", "date": r["date"], "lat": r["lat"],
           "lon": r["lon"], "source": "TerraWatch", "link": "", "analysed": True, "region": r["id"]} for r in regions]
events += [{"id": "FIXTURE_3", "title": "Placeholder severe storm C", "category": "severeStorms", "date": "2026-10-29",
            "lat": 18.2, "lon": -66.4, "source": "EONET", "link": "https://eonet.gsfc.nasa.gov/", "analysed": False}]
(OUT / "events.json").write_text(json.dumps(events, indent=1))
(OUT / "briefings.json").write_text(json.dumps(placeholder_briefings("no NISAR analysis at this location"), indent=1))
print("fixtures written:", [r["id"] for r in regions])
