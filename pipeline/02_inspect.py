"""Print the structure of one NISAR GCOV granule WITHOUT downloading it (HTTPS range reads).

Usage:
  python pipeline/02_inspect.py <https URL of .h5 | granule name | local .h5 path>
Paste the whole output back. It tells us the real HDF5 paths, grid, CRS and polarizations.
Needs EARTHDATA_USERNAME / EARTHDATA_PASSWORD in .env (or ~/.netrc).
"""
import sys

import h5py
import numpy as np
import requests

import config


def open_h5(target):
    """Return an open h5py.File for a URL, a granule name, or a local path."""
    if target.startswith("http"):
        url = target
    elif target.endswith(".h5") and "/" in target or target.startswith("."):
        return h5py.File(target, "r")
    else:
        r = requests.get(f"{config.CMR}/granules.umm_json",
                         {"short_name": config.GCOV_SHORT_NAME_PATTERN, "options[short_name][pattern]": "true",
                          "readable_granule_name": target.removesuffix(".h5") + "*",
                          "options[readable_granule_name][pattern]": "true"}, timeout=60).json()
        urls = [x["URL"] for it in r.get("items", []) for x in it["umm"].get("RelatedUrls", [])
                if x.get("Type") == "GET DATA" and x["URL"].startswith("https") and x["URL"].endswith(".h5")]
        if not urls:
            sys.exit(f"No download URL found in CMR for {target}")
        url = urls[0]
    print("URL:", url, flush=True)
    import os
    import earthaccess
    # Never fall back to an interactive prompt: with output redirected it would hang invisibly.
    if os.getenv("EARTHDATA_USERNAME") and os.getenv("EARTHDATA_PASSWORD"):
        print(f"Logging in to Earthdata as {os.getenv('EARTHDATA_USERNAME')} (from .env)...", flush=True)
        auth = earthaccess.login(strategy="environment")
    else:
        print("EARTHDATA_USERNAME / EARTHDATA_PASSWORD not found in .env; trying ~/.netrc...", flush=True)
        auth = earthaccess.login(strategy="netrc")
    if not getattr(auth, "authenticated", False):
        sys.exit("Earthdata login FAILED. Check that the file is named exactly .env (not .env.txt), sits in the repo "
                 "root, and holds EARTHDATA_USERNAME=... and EARTHDATA_PASSWORD=... with no quotes or spaces.")
    print("Login ok. Opening the remote file (first read can take a minute)...", flush=True)
    fs = earthaccess.get_fsspec_https_session()
    f = fs.open(url, mode="rb", block_size=8 * 1024 * 1024, cache_type="blockcache")
    h = h5py.File(f, "r")
    print("File open.", flush=True)
    return h


def walk(group, path="", depth=0, depth_limit=6):
    """Manual walk (cheaper than visititems over HTTP): metadata-heavy groups are listed, not expanded."""
    for key in group:
        name = f"{path}/{key}" if path else key
        obj = group.get(key)
        if obj is None:
            continue
        show(name, obj)
        if isinstance(obj, h5py.Group):
            heavy = key in ("metadata", "calibrationInformation", "processingInformation", "orbit", "attitude",
                            "sourceData", "ceosAnalysisReadyData", "radarGrid", "geolocationGrid")
            if heavy or depth + 1 >= depth_limit:
                print("  " * (depth + 2) + "children: " + ", ".join(list(obj.keys())[:40]), flush=True)
            else:
                walk(obj, name, depth + 1, depth_limit)


def show(name, obj):
    depth = name.count("/")
    pad = "  " * depth
    if isinstance(obj, h5py.Dataset):
        extra = ""
        if obj.size <= 8 and obj.dtype.kind in "iufSOU":
            try:
                v = obj[()]
                if isinstance(v, bytes):
                    v = v.decode(errors="replace")
                extra = f" = {v}"
            except Exception as e:  # noqa: BLE001
                extra = f" (unreadable: {e})"
        print(f"{pad}{name.split('/')[-1]}  shape={obj.shape} dtype={obj.dtype} chunks={obj.chunks} "
              f"comp={obj.compression}{extra}", flush=True)
    else:
        print(f"{pad}{name.split('/')[-1]}/", flush=True)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    h = open_h5(sys.argv[1])
    print("\n===== TREE =====", flush=True)
    walk(h)

    print("\n===== GRID SUMMARY =====", flush=True)

    def find_grids(name, obj):
        if isinstance(obj, h5py.Group) and "xCoordinates" in obj and "yCoordinates" in obj:
            x, y = obj["xCoordinates"][:], obj["yCoordinates"][:]
            print(f"\n/{name}")
            print(f"  x: n={x.size} {x[0]:.2f} -> {x[-1]:.2f} step={np.median(np.diff(x)):.4f}")
            print(f"  y: n={y.size} {y[0]:.2f} -> {y[-1]:.2f} step={np.median(np.diff(y)):.4f}")
            if "projection" in obj:
                p = obj["projection"]
                print("  projection value:", p[()] if p.shape == () else p[:])
                for k, v in p.attrs.items():
                    print(f"    @{k} = {v if not isinstance(v, bytes) else v.decode(errors='replace')}")
            for k, d in obj.items():
                if isinstance(d, h5py.Dataset) and d.ndim == 2:
                    r0, c0 = d.shape[0] // 2, d.shape[1] // 2
                    w = d[r0:r0 + 256, c0:c0 + 256]
                    w = np.abs(w) if np.iscomplexobj(w) else w.astype("float64")
                    ok = np.isfinite(w) & (w > 0)
                    stats = (f"centre-window median={np.median(w[ok]):.5f} "
                             f"({10 * np.log10(np.median(w[ok])):.1f} dB)") if ok.any() else "centre window empty"
                    attrs = {a: (v.decode(errors='replace') if isinstance(v, bytes) else v)
                             for a, v in d.attrs.items() if a in ("units", "_FillValue", "long_name", "description")}
                    print(f"  {k}: {d.shape} {d.dtype} {stats} {attrs}")

    def find(group, path="", depth=0):
        for key in group:
            obj = group.get(key)
            if isinstance(obj, h5py.Group) and key not in ("metadata", "radarGrid", "geolocationGrid") and depth < 6:
                name = f"{path}/{key}" if path else key
                find_grids(name, obj)
                find(obj, name, depth + 1)

    find(h)
    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
