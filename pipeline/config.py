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
    # Chosen from the 2026-11-14 discovery run (pipeline/data/shortlist.json). All pairs are the same
    # track/frame, mode and polarization (DHDH = HH + HV), from NISAR_L2_GCOV_PROVISIONAL_V1.
    "tonle_sap": {
        "title": "Tonle Sap seasonal flood, Cambodia", "short": "Tonle Sap",
        "event": {"id": "tonle_sap_2026", "title": "Tonle Sap monsoon flood pulse", "country": "Cambodia",
                  "date": "2026-10-17", "source_url": ""},   # seasonal inundation, not an EONET event
        "aoi_bbox": [103.70, 12.95, 104.45, 13.55],   # north shore + Siem Reap + dry land to the north
        "pre_granule": "NISAR_L2_PR_GCOV_023_083_A_008_2005_DHDH_M_20260619T223637_20260619T223711_P05023_N_F_J_001",
        "post_granule": "NISAR_L2_PR_GCOV_033_083_A_008_2005_DHDH_M_20261017T223633_20261017T223708_P05023_N_F_J_001",
    },
    "costa_rica": {
        "title": "Flood in Costa Rica (EONET)", "short": "Costa Rica",
        "event": {"id": "EONET_20981", "title": "Flood in Costa Rica 1104003", "country": "Costa Rica",
                  "date": "2026-07-01", "source_url": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20981"},
        "aoi_bbox": [-83.80, 9.85, -83.20, 10.35],
        "pre_granule": "NISAR_L2_PR_GCOV_023_069_D_083_4005_DHDH_A_20260619T000051_20260619T000126_P05023_N_F_J_001",
        "post_granule": "NISAR_L2_PR_GCOV_024_069_D_083_4005_DHDH_A_20260701T000051_20260701T000125_P05023_N_F_J_001",
    },
    "paraguay": {
        "title": "Flood in Paraguay (EONET)", "short": "Paraguay",
        "event": {"id": "EONET_20898", "title": "Flood in Paraguay 1103999", "country": "Paraguay",
                  "date": "2026-06-28", "source_url": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20898"},
        "aoi_bbox": [-57.45, -26.65, -56.85, -26.15],
        "pre_granule": "NISAR_L2_PR_GCOV_023_060_A_164_2005_DHDH_A_20260618T094759_20260618T094834_P05023_N_F_J_001",
        "post_granule": "NISAR_L2_PR_GCOV_024_060_A_164_2005_DHDH_A_20260630T094759_20260630T094833_P05023_N_F_J_001",
    },
    "slovakia": {
        "title": "Flood in Slovakia (EONET)", "short": "Slovakia",
        "event": {"id": "EONET_20879", "title": "Flood in Slovakia 1103998", "country": "Slovakia",
                  "date": "2026-06-30", "source_url": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_20879"},
        "aoi_bbox": [17.40, 48.05, 18.05, 48.50],
        "pre_granule": "NISAR_L2_PR_GCOV_023_086_A_026_2005_DHDH_A_20260620T034623_20260620T034658_P05023_N_F_J_001",
        "post_granule": "NISAR_L2_PR_GCOV_024_086_A_026_2005_DHDH_A_20260702T034622_20260702T034657_P05023_N_F_J_001",
    },
}


def region_from_args(description=""):
    """Parse --region and return (id, settings dict, working dir, export dir)."""
    import argparse
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--region", default=os.getenv("TERRAWATCH_REGION") or next(iter(REGIONS), None),
                    help=f"region id from config.REGIONS ({', '.join(REGIONS) or 'none defined yet'})")
    ap.add_argument("--force", action="store_true", help="redo work even if outputs exist")
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
