"""Shared pipeline settings. Edit EVENT / AOI here once an event is chosen."""
from pathlib import Path
import os

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "pipeline" / "data"
PUBLIC = ROOT / "web" / "public" / "data"
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
