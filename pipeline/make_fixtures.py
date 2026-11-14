"""Write SYNTHETIC placeholder data to web/public/data so the frontend can be built before the
real NISAR export exists. Every file is marked fixture=true and the app shows a banner.
05_export.py overwrites all of these with real results.

Usage: python pipeline/make_fixtures.py
"""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)
W, S, E, N = 103.80, 12.70, 104.30, 13.20
SIZE = 700
rng = np.random.default_rng(7)

yy, xx = np.mgrid[0:SIZE, 0:SIZE]
lon = W + (E - W) * xx / SIZE
lat = N - (N - S) * yy / SIZE

# (centre lon, centre lat, radius lon, radius lat)
RIVER = lambda lo, la: np.abs(la - (12.95 + 0.06 * np.sin((lo - W) * 14))) < 0.008  # noqa: E731
FLOODS = [(103.98, 12.93, 0.075, 0.045), (104.12, 12.99, 0.05, 0.03), (103.90, 12.90, 0.03, 0.02)]


def in_ellipse(lo, la, e):
    return ((lo - e[0]) / e[2]) ** 2 + ((la - e[1]) / e[3]) ** 2 <= 1


river = RIVER(lon, lat)
flood = np.zeros_like(river)
for e in FLOODS:
    flood |= in_ellipse(lon, lat, e)
flood &= ~river


def scene(water):
    base = -9 + 2.5 * np.sin(xx / 60) * np.cos(yy / 45) + rng.normal(0, 1.6, (SIZE, SIZE))
    db = np.where(water, -22 + rng.normal(0, 1.2, (SIZE, SIZE)), base)
    g = np.clip((db + 26) / 22, 0, 1) * 255
    return Image.fromarray(g.astype("uint8"), "L").convert("RGB")


scene(river).save(OUT / "pre.png")
scene(river | flood).save(OUT / "post.png")
rgba = np.zeros((SIZE, SIZE, 4), "uint8")
rgba[flood] = (0, 170, 255, 220)
Image.fromarray(rgba, "RGBA").save(OUT / "flood.png")


def km2(e):
    return math.pi * (e[2] * 111.32 * math.cos(math.radians(e[1]))) * (e[3] * 110.57)


features = []
for i, e in enumerate(FLOODS, 1):
    ring = [[round(e[0] + e[2] * math.cos(t), 5), round(e[1] + e[3] * math.sin(t), 5)]
            for t in np.linspace(0, 2 * math.pi, 49)]
    ring[-1] = ring[0]
    features.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [ring]},
                     "properties": {"id": i, "class": "open_water_flood", "area_km2": round(km2(e), 2),
                                    "mean_change_db": -7.5 + i}})
(OUT / "flood.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}))

now = datetime.now(timezone.utc).isoformat(timespec="seconds")
total = round(sum(f["properties"]["area_km2"] for f in features), 1)
meta = {
    "fixture": True,
    "event": {"id": "FIXTURE", "title": "Synthetic placeholder flood (not real data)", "country": "n/a",
              "date": "2026-09-02", "source_url": ""},
    "aoi_bbox": [W, S, E, N],
    "pre": {"granule": "FIXTURE_PRE", "acquired": "2026-08-24T11:02:00Z", "track": "000", "frame": "000", "pols": ["HH", "HV"]},
    "post": {"granule": "FIXTURE_POST", "acquired": "2026-09-05T11:02:00Z", "track": "000", "frame": "000", "pols": ["HH", "HV"]},
    "collection": "NISAR_L2_GCOV_PROVISIONAL_V1", "provider": "ASF DAAC",
    "images": {"pre": "pre.png", "post": "post.png", "flood": "flood.png", "compare": None,
               "bounds": [[W, N], [E, N], [E, S], [W, S]]},
    "compare": {"kind": "gibs", "layer": "MODIS_Terra_CorrectedReflectance_Bands721", "date": "2026-09-05",
                "label": "NASA GIBS: MODIS Terra false colour (bands 7-2-1)"},
    "generated": now,
}
(OUT / "meta.json").write_text(json.dumps(meta, indent=1))

stats = {"flooded_km2": total, "flooded_vegetation_km2": 0, "aoi_km2": round((E - W) * 111.32 * math.cos(math.radians(13)) * (N - S) * 110.57),
         "by_landcover": [{"class": "Cropland", "code": 40, "km2": round(total * .58, 1), "pct": 58},
                          {"class": "Grassland", "code": 30, "km2": round(total * .22, 1), "pct": 22},
                          {"class": "Tree cover", "code": 10, "km2": round(total * .12, 1), "pct": 12},
                          {"class": "Built-up", "code": 50, "km2": round(total * .08, 1), "pct": 8}],
         "method": {"pol": "HH", "otsu_threshold_db": -3.4, "min_patch_ha": 1, "slope_max_deg": 5,
                    "permanent_water": "JRC GSW occurrence >= 80%"}}
(OUT / "stats.json").write_text(json.dumps(stats, indent=1))

cells, step = [], 0.1
for i in range(5):
    for j in range(5):
        w, s = round(W + i * step, 2), round(S + j * step, 2)
        cx, cy = w + step / 2, s + step / 2
        d = min(math.hypot(cx - e[0], cy - e[1]) for e in FLOODS)
        cells.append({"bbox": [w, s, round(w + step, 2), round(s + step, 2)],
                      "wetness": round(max(0.2, min(0.98, 0.95 - 1.8 * d + 0.15 * (cy > 13.05))), 2),
                      "water_ratio": round(max(1.0, 3.2 - 22 * d), 1)})
(OUT / "signals.json").write_text(json.dumps(
    {"as_of": meta["post"]["acquired"], "wetness_source": "NISAR HV backscatter wetness proxy",
     "water_source": "NISAR water extent vs JRC Global Surface Water", "cell_deg": step, "cells": cells}, indent=1))

(OUT / "forecast.json").write_text(json.dumps(
    {"lat": 12.95, "lon": 104.05, "rain_48h_mm": 6.4, "fetched": now, "source": "Open-Meteo"}))

config = {"wetness_percentile_high": 0.8, "water_ratio_high": 1.5, "rain_48h_mm_high": 50,
          "sensor_rise_high": 150, "sensor_rise_window_s": 60, "sensor_stale_s": 30, "near_km": 5, "far_km": 25,
          "device_location": {"lat": 13.15, "lon": 104.25, "label": "Demo sensor site"},
          "sim": {"rain_48h_mm": 85},
          "firebase_url": "",
          "demo_pins": [{"label": "Far from flood", "lat": 13.15, "lon": 104.25},
                        {"label": "Near flood", "lat": 13.02, "lon": 104.20},
                        {"label": "Inside flood", "lat": 12.93, "lon": 103.98}]}
cfg_path = OUT / "config.json"
if not cfg_path.exists():  # never clobber tuned thresholds
    cfg_path.write_text(json.dumps(config, indent=1))

events = [
    {"id": "FIXTURE", "title": meta["event"]["title"], "category": "floods", "date": "2026-09-02",
     "lat": 12.95, "lon": 104.05, "source": "TerraWatch", "link": "", "analysed": True},
    {"id": "FIXTURE_2", "title": "Placeholder flood event A", "category": "floods", "date": "2026-10-11",
     "lat": 24.8, "lon": 91.3, "source": "EONET", "link": "https://eonet.gsfc.nasa.gov/", "analysed": False},
    {"id": "FIXTURE_3", "title": "Placeholder severe storm B", "category": "severeStorms", "date": "2026-10-29",
     "lat": 18.2, "lon": -66.4, "source": "EONET", "link": "https://eonet.gsfc.nasa.gov/", "analysed": False},
]
(OUT / "events.json").write_text(json.dumps(events, indent=1))

aud = ["resident", "emergency_manager", "farmer", "student"]
briefings = {"fixture": True, "facts": {}}
for t in ["GREEN", "YELLOW", "ORANGE", "RED", "BLUE"]:
    briefings[t] = {a: {"text": f"[Placeholder briefing: {t} / {a.replace('_', ' ')}. Real text is generated by "
                                f"pipeline/06_briefings.py from the computed facts.]",
                        "model": "none", "generated": now} for a in aud}
(OUT / "briefings.json").write_text(json.dumps(briefings, indent=1))
print("fixtures written to", OUT, "flooded km2 =", total)
