"""Flood change detection on the co-registered rasters written by 03_fetch.py.

Usage: python pipeline/04_detect.py --region <id>

Inputs in pipeline/data/<id>/ (all on the SAME grid, any projected or geographic CRS):
  pre_<POL>.tif, post_<POL>.tif     gamma-0 backscatter, linear power           (required)
  pre_<WETNESS_POL>.tif, post_...   second polarization                         (optional)
  jrc_occurrence.tif                JRC Global Surface Water occurrence, 0-100  (optional)
  dem.tif                           Copernicus DEM, metres                      (optional)
  worldcover.tif                    ESA WorldCover class codes                  (optional)

Outputs: flood_mask.tif (0 none, 1 open-water flood, 2 possible flooded vegetation, 255 no data),
         pre_db.tif, post_db.tif, change_db.tif, detect.json
Method: dB -> median filter -> post minus pre -> Otsu threshold -> remove permanent water, steep
        slopes and tiny patches. Missing optional inputs are skipped and recorded in detect.json.
"""
import json

import numpy as np
import rasterio
from scipy import ndimage
from skimage.filters import threshold_otsu

import config

D = config.DATA  # replaced by the region's working folder in main()


def read(name):
    p = D / name
    if not p.exists():
        return None, None
    with rasterio.open(p) as src:
        return src.read(1), src.profile


def to_db(power):
    a = power.astype("float32")
    bad = ~np.isfinite(a) | (a <= 0)
    a[bad] = np.nan
    return 10 * np.log10(a)


def smooth(db, k):
    """Median filter that ignores NaN borders."""
    filled = np.where(np.isfinite(db), db, np.nanmedian(db))
    out = ndimage.median_filter(filled, size=k)
    out[~np.isfinite(db)] = np.nan
    return out


def clean(mask, min_px):
    """Morphological opening, then drop connected patches smaller than min_px (scipy only)."""
    m = ndimage.binary_opening(mask, structure=np.ones((3, 3), bool))
    labels, n = ndimage.label(m)
    if n == 0:
        return m
    sizes = ndimage.sum_labels(m, labels, index=np.arange(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= min_px
    return keep[labels]


def pixel_size_m(profile):
    t, crs = profile["transform"], profile["crs"]
    if crs and crs.is_geographic:
        h = profile["height"]
        lat = t.f + t.e * h / 2
        return abs(t.a) * 111_320 * np.cos(np.radians(lat)), abs(t.e) * 110_570
    return abs(t.a), abs(t.e)


def main():
    global D
    _rid, _cfg, D, _out = config.region_from_args(__doc__)
    pre_p, prof = read(f"pre_{config.POL}.tif")
    post_p, prof2 = read(f"post_{config.POL}.tif")
    if pre_p is None or post_p is None:
        raise SystemExit(f"Need pre_{config.POL}.tif and post_{config.POL}.tif in {D} (run 03_fetch.py)")
    assert pre_p.shape == post_p.shape, "pre and post are not on the same grid"

    pre, post = smooth(to_db(pre_p), config.MEDIAN_FILTER_PX), smooth(to_db(post_p), config.MEDIAN_FILTER_PX)
    valid = np.isfinite(pre) & np.isfinite(post)
    change = np.where(valid, post - pre, np.nan)
    px, py = pixel_size_m(prof)
    px_ha = px * py / 10_000
    notes = []

    # --- threshold on the change image
    sample = np.clip(change[valid], -15, 15)
    otsu = float(threshold_otsu(sample[sample < 0])) if (sample < 0).sum() > 1000 else float("nan")
    lo, hi = config.OTSU_RANGE_DB
    if np.isfinite(otsu) and lo <= otsu <= hi:
        thr, thr_src = otsu, "otsu"
    else:
        thr, thr_src = config.FALLBACK_THRESHOLD_DB, "fixed"
        notes.append(f"Otsu gave {otsu:.2f} dB, outside {lo}..{hi}; used fixed {thr} dB")
    flood = valid & (change < thr) & (post < config.WATER_CEILING_DB)

    # --- permanent water
    jrc, _ = read("jrc_occurrence.tif")
    permanent = np.zeros_like(flood)
    if jrc is not None:
        permanent = (jrc >= config.JRC_PERMANENT_PCT) & (jrc <= 100)
        flood &= ~permanent
    else:
        notes.append("no JRC layer: permanent water not removed")

    # --- slope
    dem, _ = read("dem.tif")
    if dem is not None:
        gy, gx = np.gradient(dem.astype("float32"), py, px)
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        flood &= slope <= config.SLOPE_MAX_DEG
    else:
        notes.append("no DEM: steep slopes not masked")

    # --- cleanup
    min_px = max(4, int(round(config.MIN_PATCH_HA / px_ha)))
    flood = clean(flood, min_px)

    # --- possible flooded vegetation: brightness INCREASE under tree cover (L-band double bounce)
    veg = np.zeros_like(flood)
    wc, _ = read("worldcover.tif")
    if wc is not None:
        trees = np.isin(wc, [10, 95])  # tree cover, mangroves
        veg = valid & trees & (change > config.VEG_INCREASE_DB) & ~permanent
        veg = clean(veg, min_px * 2)
    else:
        notes.append("no WorldCover: flooded-vegetation flag and land-cover stats skipped")

    mask = np.zeros(flood.shape, "uint8")
    mask[veg] = 2
    mask[flood] = 1
    mask[~valid] = 255

    out = prof.copy()
    out.update(driver="GTiff", count=1, compress="deflate")
    with rasterio.open(D / "flood_mask.tif", "w", **{**out, "dtype": "uint8", "nodata": 255}) as dst:
        dst.write(mask, 1)
    for name, arr in [("pre_db.tif", pre), ("post_db.tif", post), ("change_db.tif", change)]:
        with rasterio.open(D / name, "w", **{**out, "dtype": "float32", "nodata": np.nan}) as dst:
            dst.write(arr.astype("float32"), 1)

    km2 = lambda m: round(float(m.sum()) * px_ha / 100, 2)  # noqa: E731
    info = {
        "pol": config.POL, "threshold_db": round(thr, 2), "threshold_source": thr_src,
        "otsu_db": None if not np.isfinite(otsu) else round(otsu, 2),
        "water_ceiling_db": config.WATER_CEILING_DB, "median_filter_px": config.MEDIAN_FILTER_PX,
        "min_patch_ha": config.MIN_PATCH_HA, "slope_max_deg": config.SLOPE_MAX_DEG if dem is not None else None,
        "jrc_permanent_pct": config.JRC_PERMANENT_PCT if jrc is not None else None,
        "pixel_m": [round(px, 2), round(py, 2)],
        "flooded_km2": km2(flood), "flooded_vegetation_km2": km2(veg), "permanent_water_km2": km2(permanent),
        "valid_km2": km2(valid), "notes": notes,
    }
    (D / "detect.json").write_text(json.dumps(info, indent=1))
    print(json.dumps(info, indent=1))
    pct = 100 * info["flooded_km2"] / max(info["valid_km2"], 1e-9)
    print(f"\nFlooded: {info['flooded_km2']} km2 = {pct:.1f}% of the valid area.")
    print(f"Pre median {np.nanmedian(pre):.1f} dB, post median {np.nanmedian(post):.1f} dB, "
          f"post 2nd percentile {np.nanpercentile(post, 2):.1f} dB (open water should sit below the ceiling).")
    if pct > 40:
        print("!! More than 40% flooded: check the pair (different mode/pol?) and the thresholds.")
    if pct < 0.05:
        print("!! Almost nothing detected: try raising WATER_CEILING_DB or FALLBACK_THRESHOLD_DB in config.py.")


if __name__ == "__main__":
    main()
