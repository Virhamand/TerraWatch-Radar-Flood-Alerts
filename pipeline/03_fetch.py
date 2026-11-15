"""Fetch one region's inputs: the AOI window of the pre/post NISAR GCOV granules, plus ancillary layers.

Usage: python pipeline/03_fetch.py --region <id> [--force]

NISAR: reads ONLY the AOI window of frequencyA HHHH / HVHV / mask over HTTPS (no full download).
Layout confirmed with 02_inspect.py on a real granule (product spec 1.5.0):
  /science/LSAR/GCOV/grids/frequencyA/{HHHH,HVHV,mask,xCoordinates,yCoordinates,projection}
  20 m posting, UTM, gamma-0 in linear power, float32, 512x512 gzip chunks, mask 255 = outside swath.
Ancillary (public cloud GeoTIFFs, read by window and warped onto the NISAR grid; each is optional):
  JRC Global Surface Water occurrence, Copernicus DEM GLO-30, ESA WorldCover 2021.

Writes pipeline/data/<id>/: pre_HH.tif post_HH.tif pre_HV.tif post_HV.tif jrc_occurrence.tif dem.tif
worldcover.tif fetch.json
"""
import json
import math
import os
import sys
from pathlib import Path

import h5py
import numpy as np
import rasterio
import requests
from pyproj import Transformer
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

import config

GRID = "science/LSAR/GCOV/grids/frequencyA"
LOOKS = 2  # average 2x2 pixels: 20 m -> 40 m, less speckle, 4x less data
_fs = None


def open_granule(name):
    """h5py.File for a granule name (remote, via Earthdata) or a local .h5 path."""
    global _fs
    if Path(name).exists():
        return h5py.File(name, "r"), name
    r = requests.get(f"{config.CMR}/granules.umm_json",
                     {"short_name": config.GCOV_SHORT_NAME_PATTERN, "options[short_name][pattern]": "true",
                      "readable_granule_name": name.removesuffix(".h5") + "*",
                      "options[readable_granule_name][pattern]": "true"}, timeout=60).json()
    urls = [x["URL"] for it in r.get("items", []) for x in it["umm"].get("RelatedUrls", [])
            if x.get("Type") == "GET DATA" and x["URL"].startswith("https") and x["URL"].endswith(".h5")]
    if not urls:
        sys.exit(f"No download URL in CMR for {name}")
    if _fs is None:
        import earthaccess
        if not (os.getenv("EARTHDATA_USERNAME") and os.getenv("EARTHDATA_PASSWORD")):
            sys.exit("EARTHDATA_USERNAME / EARTHDATA_PASSWORD missing in .env")
        auth = earthaccess.login(strategy="environment")
        if not getattr(auth, "authenticated", False):
            sys.exit("Earthdata login failed")
        _fs = earthaccess.get_fsspec_https_session()
    f = _fs.open(urls[0], mode="rb", block_size=8 * 1024 * 1024, cache_type="blockcache")
    return h5py.File(f, "r"), urls[0]


def txt(v):
    v = v[()] if hasattr(v, "shape") else v
    return v.decode() if isinstance(v, bytes) else str(v)


def describe(h, url):
    ident = h["science/LSAR/identification"]
    g = h[GRID]
    return {"granule": txt(ident["granuleId"]), "acquired": txt(ident["zeroDopplerStartTime"])[:19] + "Z",
            "track": int(ident["trackNumber"][()]), "frame": int(ident["frameNumber"][()]),
            "direction": txt(ident["orbitPassDirection"]), "pols": [p.decode() for p in g["listOfPolarizations"][:]],
            "epsg": int(g["projection"][()]), "spacing_m": float(g["xCoordinateSpacing"][()]),
            "product_version": txt(ident["productVersion"]), "doi": txt(ident["productDoi"]), "url": url}


def aoi_utm(bbox, epsg):
    """UTM bounding box (xmin, ymin, xmax, ymax) of a lon/lat bbox."""
    w, s, e, n = bbox
    t = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = t.transform([w, e, w, e, (w + e) / 2, (w + e) / 2], [s, s, n, n, s, n])
    return min(xs), min(ys), max(xs), max(ys)


def read_window(h, bounds, step):
    """Read HHHH/HVHV for UTM bounds. Returns dict of arrays, x0 (left edge), y0 (top edge)."""
    g = h[GRID]
    x, y = g["xCoordinates"][:], g["yCoordinates"][:]          # pixel centres; y descends
    c0, c1 = np.searchsorted(x, [bounds[0], bounds[2]])
    r0, r1 = np.searchsorted(-y, [-bounds[3], -bounds[1]])
    c0, r0 = max(0, c0), max(0, r0)
    c1, r1 = min(x.size, c1), min(y.size, r1)
    # multiples of LOOKS so the block average is exact
    c1 -= (c1 - c0) % LOOKS
    r1 -= (r1 - r0) % LOOKS
    if c1 - c0 < 50 or r1 - r0 < 50:
        sys.exit("The AOI does not overlap this granule (check aoi_bbox against the frame).")
    print(f"    window rows {r0}:{r1} cols {c0}:{c1} = {(r1 - r0)} x {(c1 - c0)} px "
          f"({(r1 - r0) * step / 1000:.0f} x {(c1 - c0) * step / 1000:.0f} km)", flush=True)
    out = {}
    valid = g["mask"][r0:r1, c0:c1]
    valid = (valid != 255) & (valid != 0)
    for term, pol in [("HHHH", "HH"), ("HVHV", "HV")]:
        if term not in g:
            continue
        print(f"    reading {term}...", flush=True)
        a = g[term][r0:r1, c0:c1].astype("float32")
        a[~valid | ~np.isfinite(a) | (a <= 0)] = np.nan
        out[pol] = a
    return out, float(x[c0]) - step / 2, float(y[r0]) + step / 2


def multilook(a, k):
    """Mean of k x k blocks in linear power, ignoring NaN (all-NaN block -> NaN)."""
    if k == 1:
        return a
    h, w = a.shape[0] // k * k, a.shape[1] // k * k
    b = a[:h, :w].reshape(h // k, k, w // k, k)
    with np.errstate(invalid="ignore"), __import__("warnings").catch_warnings():
        __import__("warnings").simplefilter("ignore", RuntimeWarning)
        return np.nanmean(b, axis=(1, 3)).astype("float32")


def write(path, arr, transform, epsg, nodata):
    with rasterio.open(path, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1, dtype=arr.dtype,
                       crs=f"EPSG:{epsg}", transform=transform, nodata=nodata, compress="deflate") as d:
        d.write(arr, 1)


# ------------------------------------------------------------------ ancillary tiles
def dem_urls(w, s, e, n):
    for lat in range(math.floor(s), math.floor(n) + 1):
        for lon in range(math.floor(w), math.floor(e) + 1):
            ns, ew = ("N" if lat >= 0 else "S"), ("E" if lon >= 0 else "W")
            name = f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"
            yield f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


def worldcover_urls(w, s, e, n):
    for lat in range(math.floor(s / 3) * 3, math.floor(n / 3) * 3 + 1, 3):
        for lon in range(math.floor(w / 3) * 3, math.floor(e / 3) * 3 + 1, 3):
            ns, ew = ("N" if lat >= 0 else "S"), ("E" if lon >= 0 else "W")
            yield (f"https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
                   f"ESA_WorldCover_10m_2021_v200_{ns}{abs(lat):02d}{ew}{abs(lon):03d}_Map.tif")


def jrc_urls(w, s, e, n):
    # 10-degree tiles named by their top-left corner
    for top in range(math.ceil(s / 10) * 10 if s % 10 else int(s) + 10, math.ceil(n / 10) * 10 + 1, 10):
        for left in range(math.floor(w / 10) * 10, math.floor(e / 10) * 10 + 1, 10):
            ns, ew = ("N" if top >= 0 else "S"), ("E" if left >= 0 else "W")
            yield (f"https://storage.googleapis.com/global-surface-water/downloads2021/occurrence/"
                   f"occurrence_{abs(left)}{ew}_{abs(top)}{ns}v1_4_2021.tif")


def warp_tiles(urls, shape, transform, epsg, resampling, dtype, fill):
    """Mosaic remote tiles onto the NISAR grid. Returns None if no tile could be read."""
    out = np.full(shape, fill, dtype)
    got = False
    for url in urls:
        try:
            with rasterio.open(url) as src:
                tmp = np.full(shape, fill, dtype)
                reproject(rasterio.band(src, 1), tmp, dst_transform=transform, dst_crs=f"EPSG:{epsg}",
                          resampling=resampling, dst_nodata=fill)
                ok = tmp != fill
                out[ok] = tmp[ok]
                got = got or bool(ok.any())
                print(f"    ok   {url.rsplit('/', 1)[-1]}", flush=True)
        except Exception as e:  # noqa: BLE001  (missing ocean tile, network, etc.)
            print(f"    skip {url.rsplit('/', 1)[-1]}: {str(e)[:90]}", flush=True)
    return out if got else None


def main():
    rid, rcfg, work, _out = config.region_from_args(__doc__)
    force = "--force" in sys.argv
    bbox = rcfg["aoi_bbox"]
    info = {"collection": config.PREFERRED_COLLECTION, "aoi_bbox": bbox, "looks": LOOKS}

    grids = {}
    if force or not all((work / f"{k}_HH.tif").exists() for k in ("pre", "post")):
        handles = {}
        for k in ("pre", "post"):
            print(f"[{k}] opening {rcfg[f'{k}_granule']}", flush=True)
            h, url = open_granule(rcfg[f"{k}_granule"])
            handles[k] = h
            info[k] = describe(h, url)
            print(f"    {info[k]['acquired']} track {info[k]['track']} frame {info[k]['frame']} "
                  f"EPSG:{info[k]['epsg']} {info[k]['spacing_m']} m pols {info[k]['pols']}", flush=True)
        if info["pre"]["epsg"] != info["post"]["epsg"] or info["pre"]["spacing_m"] != info["post"]["spacing_m"]:
            sys.exit("pre and post are on different grids (EPSG or spacing differ): pick a pair with the same mode")
        epsg, step = info["pre"]["epsg"], info["pre"]["spacing_m"]
        # common footprint of both granules and the AOI, so both windows are pixel-identical
        b = list(aoi_utm(bbox, epsg))
        for h in handles.values():
            x, y = h[GRID]["xCoordinates"], h[GRID]["yCoordinates"]
            b = [max(b[0], float(x[0]) - step / 2), max(b[1], float(y[-1]) - step / 2),
                 min(b[2], float(x[-1]) + step / 2), min(b[3], float(y[0]) + step / 2)]
        for k, h in handles.items():
            print(f"[{k}] reading AOI window", flush=True)
            arrs, x0, y0 = read_window(h, b, step)
            grids[k] = (arrs, x0, y0)
        (a_pre, x0, y0), (a_post, x1, y1) = grids["pre"], grids["post"]
        if (x0, y0) != (x1, y1) or a_pre["HH"].shape != a_post["HH"].shape:
            sys.exit(f"pre/post windows differ: {(x0, y0, a_pre['HH'].shape)} vs {(x1, y1, a_post['HH'].shape)}")
        transform = from_origin(x0, y0, step * LOOKS, step * LOOKS)
        for k, (arrs, _x, _y) in grids.items():
            for pol, a in arrs.items():
                m = multilook(a, LOOKS)
                write(work / f"{k}_{pol}.tif", m, transform, epsg, np.nan)
                print(f"    wrote {k}_{pol}.tif {m.shape} median {10 * np.log10(np.nanmedian(m)):.1f} dB "
                      f"valid {np.isfinite(m).mean() * 100:.0f}%", flush=True)
        (work / "fetch.json").write_text(json.dumps(info, indent=1))
    else:
        print("NISAR windows already present (use --force to re-read)")

    with rasterio.open(work / "pre_HH.tif") as src:
        shape, transform, epsg = src.shape, src.transform, src.crs.to_epsg()
    w, s, e, n = bbox
    pad = 0.05
    env = rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                       GDAL_HTTP_TIMEOUT="60", GDAL_HTTP_MAX_RETRY="3")
    with env:
        for name, urls, res, dtype, fill in [
            ("jrc_occurrence.tif", jrc_urls(w - pad, s - pad, e + pad, n + pad), Resampling.nearest, "uint8", 255),
            ("dem.tif", dem_urls(w - pad, s - pad, e + pad, n + pad), Resampling.bilinear, "float32", -9999.0),
            ("worldcover.tif", worldcover_urls(w - pad, s - pad, e + pad, n + pad), Resampling.nearest, "uint8", 0),
        ]:
            if (work / name).exists() and not force:
                print(f"{name} already present")
                continue
            print(f"[{name}]", flush=True)
            arr = warp_tiles(list(urls), shape, transform, epsg, res, dtype, fill)
            if arr is None:
                print(f"    !! {name} unavailable: 04_detect.py will run without it")
                continue
            if name == "dem.tif":
                arr[arr == fill] = 0  # sea level where the DEM has no tile
            write(work / name, arr, transform, epsg, None)
    print(f"\nDone. Next: python pipeline/04_detect.py --region {rid}")


if __name__ == "__main__":
    main()
