"""Shared pipeline settings. Edit EVENT / AOI here once an event is chosen."""
from pathlib import Path
import os

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.getenv("TERRAWATCH_DATA", ROOT / "pipeline" / "data"))
PUBLIC = Path(os.getenv("TERRAWATCH_PUBLIC", ROOT / "web" / "public" / "data"))
DATA.mkdir(parents=True, exist_ok=True)

CMR = "https://cmr.earthdata.nasa.gov/search"
EONET = "https://eonet.gsfc.nasa.gov/api/v3"

# Wildcard so we catch whatever maturity level is in the archive (BETA / PROVISIONAL / V1).
GCOV_SHORT_NAME_PATTERN = "NISAR_L2_GCOV*"
PREFERRED_COLLECTION = "NISAR_L2_GCOV_PROVISIONAL_V1"
NISAR_START = "2026-06-17"

# Seasonal flood regions used if no EONET-linked pair exists (fallback step 2).
FALLBACK_REGIONS = [
    {"id": "tonle_sap", "title": "Tonle Sap seasonal flood, Cambodia", "lat": 12.95, "lon": 104.05},
    {"id": "sylhet_haor", "title": "Sylhet haor monsoon flooding, Bangladesh", "lat": 24.80, "lon": 91.30},
    {"id": "sudd", "title": "Sudd wetland seasonal flood, South Sudan", "lat": 7.60, "lon": 30.60},
    {"id": "indus_sindh", "title": "Indus floodplain, Sindh, Pakistan", "lat": 27.10, "lon": 68.20},
    {"id": "amazon_manaus", "title": "Amazon floodplain near Manaus, Brazil", "lat": -3.30, "lon": -60.30},
    {"id": "mekong_delta", "title": "Mekong delta flood season, Vietnam", "lat": 10.70, "lon": 105.40},
    {"id": "niger_inner_delta", "title": "Inner Niger Delta flood, Mali", "lat": 15.10, "lon": -4.30},
]

EARTHDATA_USERNAME = os.getenv("EARTHDATA_USERNAME", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")

# ---------------------------------------------------------------------------------------------
# ANALYSED REGIONS - one entry per flood event. Add an entry, then run for that region:
#   python pipeline/03_fetch.py --region <id>   (then 04_detect, 05_export, 06_briefings)
# Working rasters go to pipeline/data/<id>/, exports to web/public/data/<id>/.
# ---------------------------------------------------------------------------------------------
REGIONS = {
    # "sylhet": {
    #     "title": "Sylhet monsoon flooding, Bangladesh",   # shown in panels
    #     "short": "Sylhet",                                # shown on the region switcher
    #     "event": {"id": "EONET_1234", "title": "Flooding in Bangladesh", "country": "Bangladesh",
    #               "date": "2026-08-30", "source_url": "https://eonet.gsfc.nasa.gov/..."},
    #     "aoi_bbox": [91.0, 24.6, 91.6, 25.1],             # west, south, east, north; ~40-80 km across
    #     "pre_granule": "NISAR_L2_PR_GCOV_...",            # granule names from the shortlist
    #     "post_granule": "NISAR_L2_PR_GCOV_...",
    # },
}


def region_from_args(description=""):
    """Parse --region and return (id, settings dict, working dir, export dir)."""
    import argparse
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--region", default=os.getenv("TERRAWATCH_REGION") or next(iter(REGIONS), None),
                    help=f"region id from config.REGIONS ({', '.join(REGIONS) or 'none defined yet'})")
    rid = ap.parse_args().region
    if rid not in REGIONS:
        raise SystemExit(f"Unknown region {rid!r}. Define it in REGIONS in pipeline/config.py first.")
    work, out = DATA / rid, PUBLIC / rid
    work.mkdir(parents=True, exist_ok=True)
    return rid, REGIONS[rid], work, out


POL = "HH"                 # polarization used for change detection
WETNESS_POL = "HV"         # used for the wetness proxy if present, else POL
TARGET_RES_M = 30          # working resolution; coarser = faster and less speckle

# Detection thresholds (all tunable; echoed into stats.json so the app can show them)
MEDIAN_FILTER_PX = 5
OTSU_RANGE_DB = (-8.0, -1.5)   # accept the Otsu threshold only inside this range...
FALLBACK_THRESHOLD_DB = -3.0   # ...otherwise use this fixed drop
WATER_CEILING_DB = -15.0       # post-event pixel must also be this dark to count as open water
JRC_PERMANENT_PCT = 80         # JRC occurrence >= this is permanent water
SLOPE_MAX_DEG = 5
MIN_PATCH_HA = 1.0
VEG_INCREASE_DB = 3.0          # HH increase flagged as possible flooded vegetation in tree cover
SIGNAL_CELL_DEG = 0.05
