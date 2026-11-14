"""Event discovery: find flood events that have NISAR GCOV acquisitions before AND after,
on the same track/frame.

Sources of candidate events:
  - NASA EONET v3 (floods, severeStorms) since NISAR_START
  - pipeline/candidates.json  (hand-added: [{"id","title","lat","lon","date","link"}])
  - config.FALLBACK_REGIONS   (seasonal flood regions; reported as time series, --regions)

Needs no login: CMR granule search is public.

Usage:
  python pipeline/01_discover.py                 # EONET + candidates.json
  python pipeline/01_discover.py --regions       # also list seasonal fallback regions
  python pipeline/01_discover.py --point 12.95 104.05 --date 2026-09-20
Outputs pipeline/data/shortlist.json and a printed table. Paste the table back.
"""
import argparse
import json
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import requests

import config

S = requests.Session()
S.headers["User-Agent"] = "terrawatch-hackathon"


def get(url, params=None, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            print(f"  HTTP {r.status_code} from {url}: {r.text[:200]}", file=sys.stderr)
        except requests.RequestException as e:
            print(f"  request failed ({e}); retry {i + 1}", file=sys.stderr)
        time.sleep(2 * (i + 1))
    return None


def list_collections():
    d = get(f"{config.CMR}/collections.json",
            {"short_name": config.GCOV_SHORT_NAME_PATTERN, "options[short_name][pattern]": "true",
             "page_size": 50})
    cols = (d or {}).get("feed", {}).get("entry", [])
    print("NISAR GCOV collections in CMR:")
    for c in cols:
        print(f"  {c['short_name']:40s} {c['id']:22s} {c.get('time_start', '')[:10]} -> "
              f"{(c.get('time_end') or 'ongoing')[:10]}  [{c.get('data_center')}]")
    if not cols:
        print("  NONE FOUND - check the short-name pattern in config.py")
    return cols


def parse_name(name):
    """NISAR_L2_PR_GCOV_<cycle>_<track>_<dir>_<frame>_<mode>_<pol>_... Defensive: returns {} on mismatch."""
    p = name.split("_")
    try:
        i = p.index("GCOV")
        return {"cycle": p[i + 1], "track": p[i + 2], "direction": p[i + 3], "frame": p[i + 4],
                "mode": p[i + 5], "pol": p[i + 6]}
    except (ValueError, IndexError):
        return {}


def granules_at(lat, lon, start=config.NISAR_START, end=None):
    """All GCOV granules covering a point, any maturity level."""
    end = end or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out, page = [], 1
    while True:
        d = get(f"{config.CMR}/granules.umm_json",
                {"short_name": config.GCOV_SHORT_NAME_PATTERN, "options[short_name][pattern]": "true",
                 "point": f"{lon},{lat}", "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z",
                 "page_size": 500, "page_num": page, "sort_key": "start_date"})
        items = (d or {}).get("items", [])
        for it in items:
            u, m = it["umm"], it["meta"]
            name = u.get("GranuleUR", "")
            t0 = u.get("TemporalExtent", {}).get("RangeDateTime", {}).get("BeginningDateTime", "")
            urls = [x["URL"] for x in u.get("RelatedUrls", [])
                    if x.get("Type") == "GET DATA" and x["URL"].startswith("https") and x["URL"].endswith(".h5")]
            size = 0
            for a in u.get("DataGranule", {}).get("ArchiveAndDistributionInformation", []):
                if str(a.get("Name", "")).endswith(".h5") or not size:
                    size = a.get("SizeInBytes") or (a.get("Size", 0) * 1e6 if a.get("SizeUnit") == "MB" else 0)
            g = {"name": name, "start": t0, "url": urls[0] if urls else "", "size_gb": round(size / 1e9, 2),
                 "collection": u.get("CollectionReference", {}).get("ShortName", ""),
                 "concept_id": m.get("concept-id")}
            g.update(parse_name(name))
            out.append(g)
        if len(items) < 500:
            break
        page += 1
    return out


def group(grans):
    by = defaultdict(list)
    for g in grans:
        by[(g.get("track"), g.get("direction"), g.get("frame"))].append(g)
    return by


def best_pair(grans, event_date, pre_days=40, post_days=16):
    """Latest granule before the event and earliest after, same track/dir/frame."""
    ev = datetime.fromisoformat(event_date[:10]).replace(tzinfo=timezone.utc)
    best = None
    for key, gs in group(grans).items():
        def dt(g):
            return datetime.fromisoformat(g["start"].replace("Z", "+00:00"))
        pre = [g for g in gs if ev - timedelta(days=pre_days) <= dt(g) < ev]
        post = [g for g in gs if ev <= dt(g) <= ev + timedelta(days=post_days)]
        if not pre or not post:
            continue
        a, b = max(pre, key=dt), min(post, key=dt)
        delay = (dt(b) - ev).total_seconds() / 86400
        cand = {"track": key[0], "direction": key[1], "frame": key[2], "pre": a, "post": b,
                "post_delay_days": round(delay, 1), "same_pol": a.get("pol") == b.get("pol"),
                "same_mode": a.get("mode") == b.get("mode")}
        score = delay + (0 if cand["same_pol"] else 50) + (0 if cand["same_mode"] else 5)
        if best is None or score < best[0]:
            best = (score, cand)
    return best[1] if best else None


def eonet_events():
    end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    d = get(f"{config.EONET}/events",
            {"category": "floods,severeStorms", "start": config.NISAR_START, "end": end, "status": "all"})
    evs = []
    for e in (d or {}).get("events", []):
        geoms = [g for g in e.get("geometry", []) if g.get("type") == "Point"]
        if not geoms:
            continue
        cat = e["categories"][0]["id"] if e.get("categories") else ""
        # storms: sample a few track points (landfall is usually late in the track)
        picks = geoms if len(geoms) <= 3 else [geoms[len(geoms) // 2], geoms[-2], geoms[-1]]
        for i, g in enumerate(picks):
            lon, lat = g["coordinates"]
            evs.append({"id": e["id"] + (f"#{i}" if len(picks) > 1 else ""), "title": e["title"],
                        "category": cat, "date": g["date"][:10], "lat": lat, "lon": lon,
                        "link": e.get("link", ""), "source": "EONET"})
    return evs


def fmt_pair(ev, p):
    a, b = p["pre"], p["post"]
    flag = "" if p["same_pol"] else "  !! polarization differs"
    return (f"\n* {ev['title']}  [{ev['id']}]  {ev['date']}  ({ev['lat']:.2f}, {ev['lon']:.2f})\n"
            f"    track {p['track']}{p['direction']} frame {p['frame']}  post is {p['post_delay_days']} d after event{flag}\n"
            f"    PRE  {a['start'][:10]}  {a.get('pol')}  {a['size_gb']} GB  {a['name']}\n"
            f"    POST {b['start'][:10]}  {b.get('pol')}  {b['size_gb']} GB  {b['name']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regions", action="store_true", help="also list seasonal fallback regions")
    ap.add_argument("--point", nargs=2, type=float, metavar=("LAT", "LON"))
    ap.add_argument("--date", help="event date for --point (YYYY-MM-DD)")
    ap.add_argument("--no-eonet", action="store_true")
    args = ap.parse_args()

    cols = list_collections()
    result = {"generated": datetime.now(timezone.utc).isoformat(), "collections": [c["short_name"] for c in cols],
              "pairs": [], "no_pair": [], "regions": []}

    events = []
    if args.point:
        events.append({"id": "manual", "title": "Manual point", "category": "manual",
                       "date": args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                       "lat": args.point[0], "lon": args.point[1], "link": "", "source": "manual"})
    else:
        if not args.no_eonet:
            ee = eonet_events()
            print(f"\nEONET flood/severe-storm candidate points since {config.NISAR_START}: {len(ee)}")
            events += ee
        try:
            with open(config.ROOT / "pipeline" / "candidates.json") as f:
                for c in json.load(f):
                    c.setdefault("source", "manual")
                    c.setdefault("category", "floods")
                    c.setdefault("link", "")
                    events.append(c)
        except FileNotFoundError:
            pass

    for ev in events:
        grans = granules_at(ev["lat"], ev["lon"])
        p = best_pair(grans, ev["date"])
        if p:
            result["pairs"].append({"event": ev, **p})
        else:
            dates = sorted({g["start"][:10] for g in grans})
            result["no_pair"].append({"event": ev, "n_granules": len(grans), "dates": dates})

    result["pairs"].sort(key=lambda r: (not r["same_pol"], r["event"]["category"] != "floods", r["post_delay_days"]))
    print(f"\n===== EVENTS WITH A PRE/POST NISAR PAIR: {len(result['pairs'])} =====")
    for r in result["pairs"]:
        print(fmt_pair(r["event"], r))
    print(f"\n===== events without a pair: {len(result['no_pair'])} =====")
    for r in result["no_pair"][:40]:
        ev = r["event"]
        print(f"  {ev['date']} {ev['title'][:50]:50s} granules={r['n_granules']} {' '.join(r['dates'][-6:])}")

    if args.regions or args.point:
        pts = config.FALLBACK_REGIONS if args.regions else []
        if args.point:
            pts = pts + [{"id": "manual", "title": "Manual point", "lat": args.point[0], "lon": args.point[1]}]
        print("\n===== ACQUISITION TIME SERIES (pick an early + late date on one track/frame) =====")
        for reg in pts:
            grans = granules_at(reg["lat"], reg["lon"])
            print(f"\n* {reg['title']} ({reg['lat']}, {reg['lon']}): {len(grans)} granules")
            series = []
            for key, gs in sorted(group(grans).items(), key=lambda kv: -len(kv[1])):
                line = ", ".join(f"{g['start'][:10]}/{g.get('pol')}" for g in gs)
                print(f"    track {key[0]}{key[1]} frame {key[2]} ({len(gs)}): {line}")
                series.append({"track": key[0], "direction": key[1], "frame": key[2], "granules": gs})
            result["regions"].append({"region": reg, "series": series})

    out = config.DATA / "shortlist.json"
    out.write_text(json.dumps(result, indent=1))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
