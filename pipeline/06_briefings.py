"""Generate and cache the plain-language briefings (5 alert levels x 4 audiences).

The LLM only EXPLAINS facts computed by the pipeline. It is given a compact JSON of facts and is
forbidden from adding anything else. Every number in its answer is checked against the facts; a
briefing with an unknown number is regenerated, then flagged if it still fails.

Usage:
  python pipeline/06_briefings.py            # needs LLM_API_KEY in .env
  python pipeline/06_briefings.py --dry-run  # print the facts and prompts, call nothing
Writes web/public/data/briefings.json. READ EVERY BRIEFING before committing.
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone

import config

AUDIENCES = {
    "resident": "a resident of the area with no technical background, who wants to know what this means for their household",
    "emergency_manager": "a local emergency manager deciding where to direct attention and what to verify on the ground",
    "farmer": "a farmer concerned about fields, livestock and access roads",
    "student": "a high-school student learning how satellites detect floods",
}

SYSTEM = """You write short flood-status briefings for TerraWatch, a hackathon prototype.
Rules, all mandatory:
- Use ONLY the facts in the JSON the user gives you. Never add place names, numbers, dates, causes,
  forecasts, casualties or advice that depend on facts not in the JSON. If something is not in the
  JSON, say it is unknown or leave it out.
- Copy numbers exactly as given. Do not compute new numbers.
- 100 to 120 words, one paragraph, plain English, no headings, no bullet points, no emojis.
- Cover, in this order: what the data shows, why it matters for this reader, how confident we can
  be and the limitations, and how old the data is.
- You are explaining an alert level that was already computed. Do not change or question the level.
- End with this exact sentence: TerraWatch supplements, but does not replace, official emergency alerts."""


def load(name):
    return json.loads((config.PUBLIC / name).read_text())


def days_ago(iso):
    return (datetime.now(timezone.utc) - datetime.fromisoformat(iso.replace("Z", "+00:00"))).days


def build_facts():
    meta, stats, cfg = load("meta.json"), load("stats.json"), load("config.json")
    common = {
        "satellite": "NASA-ISRO NISAR, L-band radar",
        "event": meta["event"]["title"],
        "radar_image_before_date": meta["pre"]["acquired"][:10],
        "radar_image_after_date": meta["post"]["acquired"][:10],
        "satellite_data_age_days": days_ago(meta["post"]["acquired"]),
        "satellite_revisit_days": 12,
        "newly_flooded_area_km2": stats["flooded_km2"],
        "area_analysed_km2": stats["aoi_km2"],
        "flooded_area_by_land_cover_km2": {l["class"]: l["km2"] for l in stats["by_landcover"]},
        "method": "change in radar brightness between the two images; open water looks dark to radar",
        "limitations": [
            "the flood map shows conditions on the after-image date, not today",
            "radar can miss flooding under dense buildings and can confuse wet smooth fields with water",
            "this is a 2-day prototype and has not been validated on the ground",
        ],
    }
    if stats.get("flooded_vegetation_km2"):
        common["possible_flooded_vegetation_km2"] = stats["flooded_vegetation_km2"]
    levels = {
        "GREEN": {"alert_level": "GREEN - No current concern",
                  "why_this_level": "no warning signs, or only one, at the reader's location",
                  "signals_high": []},
        "YELLOW": {"alert_level": "YELLOW - Flood watch",
                   "why_this_level": "ground conditions are wet and significant rain is expected",
                   "signals_high": ["wet ground or water above normal, from NISAR radar",
                                    f"rain forecast for the next 48 hours at or above {cfg['rain_48h_mm_high']} mm (Open-Meteo)"]},
        "ORANGE": {"alert_level": "ORANGE - Flood warning",
                   "why_this_level": f"flooding was mapped within {cfg['far_km']} km of the reader's location, or two warning signs agree",
                   "signals_high": ["mapped flooding nearby, from NISAR radar"]},
        "RED": {"alert_level": "RED - Flood imminent or occurring",
                "why_this_level": "the reader's location is inside an area mapped as flooded, or at least three independent warning signs agree",
                "signals_high": ["location inside a mapped flood area, from NISAR radar"]},
        "BLUE": {"alert_level": "BLUE - Global report",
                 "why_this_level": "a major flood was detected elsewhere in the world, not near the reader",
                 "signals_high": []},
    }
    return {k: {**v, **common} for k, v in levels.items()}


def numbers(text):
    return {m.replace(",", "") for m in re.findall(r"\d[\d,]*\.?\d*", text)}


def check(text, facts):
    """Return a list of problems: unknown numbers, wrong length, missing disclaimer."""
    allowed = numbers(json.dumps(facts)) | {"2"}  # "2-day prototype"
    allowed |= {n.rstrip("0").rstrip(".") for n in allowed if "." in n}
    allowed |= {n.lstrip("0") for n in allowed}  # dates: "05" may be written as "5"
    bad = sorted(n.rstrip(".") for n in numbers(text) if n.rstrip(".") not in allowed)
    problems = [f"numbers not in facts: {bad}"] if bad else []
    words = len(text.split())
    if not 85 <= words <= 140:
        problems.append(f"{words} words")
    if "does not replace" not in text:
        problems.append("missing disclaimer")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    facts = build_facts()
    if args.dry_run:
        print(SYSTEM, "\n")
        print(json.dumps(facts["RED"], indent=1))
        return
    if not config.LLM_API_KEY:
        sys.exit("LLM_API_KEY missing in .env")
    from openai import OpenAI
    client = OpenAI(api_key=config.LLM_API_KEY, base_url=config.LLM_BASE_URL)

    out = {"facts": facts, "model": config.LLM_MODEL, "provider": config.LLM_BASE_URL}
    flagged = 0
    for level, f in facts.items():
        out[level] = {}
        for aud, who in AUDIENCES.items():
            user = f"Reader: {who}.\nFacts (JSON):\n{json.dumps(f)}"
            text, problems = "", ["not generated"]
            for attempt in range(3):
                try:
                    r = client.chat.completions.create(
                        model=config.LLM_MODEL, temperature=0.3, max_tokens=400,
                        messages=[{"role": "system", "content": SYSTEM},
                                  {"role": "user", "content": user + (f"\nYour last answer had problems: {problems}. Fix them." if attempt else "")}])
                    text = r.choices[0].message.content.strip()
                    problems = check(text, f)
                except Exception as e:  # noqa: BLE001  (rate limit etc.)
                    problems = [f"API error: {e}"]
                    time.sleep(8)
                if not problems:
                    break
                time.sleep(2)
            flagged += bool(problems)
            out[level][aud] = {"text": text, "model": config.LLM_MODEL,
                               "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               **({"problems": problems} if problems else {})}
            print(f"\n[{level} / {aud}] {'!! ' + str(problems) if problems else 'ok'}\n{text}")
            time.sleep(2.5)  # stay under free-tier rate limits
    (config.PUBLIC / "briefings.json").write_text(json.dumps(out, indent=1))
    print(f"\nWrote briefings.json. {flagged} briefing(s) flagged - read them all before committing.")


if __name__ == "__main__":
    main()
