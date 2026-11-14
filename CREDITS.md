# Credits and citations

TerraWatch is a 2-day hackathon prototype (NASA Space Apps Challenge 2026, "Dancing with the SARs").
Everything it uses is listed here. Entries marked *(planned)* are confirmed or removed before submission.

## NASA data
| Source | Used for | Access |
|---|---|---|
| NISAR Level-2 GCOV (NASA–ISRO SAR mission), provisional release | Before/after L-band backscatter, flood change detection | NASA Alaska Satellite Facility DAAC (ASF), via NASA Earthdata / CMR |
| NASA EONET v3 (Earth Observatory Natural Event Tracker) | Flood and severe-storm event discovery, global feed | https://eonet.gsfc.nasa.gov/api/v3/ |
| NASA GIBS or OPERA DSWx *(planned)* | Independent comparison layer | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api |

Granule IDs and acquisition dates are shown in the app's Data & Credits panel and in `web/public/data/meta.json`.

## Other data
| Source | Used for |
|---|---|
| Open-Meteo Forecast API (CC BY 4.0) | 48-hour rainfall forecast |
| JRC Global Surface Water (Pekel et al. 2016, Nature) *(planned)* | Permanent-water baseline |
| Copernicus DEM GLO-30 (ESA / Airbus) *(planned)* | Slope mask |
| ESA WorldCover 10 m (CC BY 4.0) *(planned)* | Land-cover statistics |
| OpenStreetMap contributors / basemap provider *(planned)* | Basemap |

## Software
Python: earthaccess, h5py, numpy, rasterio, scikit-image, scipy, shapely, pyproj, requests, python-dotenv, openai, Pillow.
Web *(planned)*: Vite, React, TypeScript, MapLibre GL JS, Turf.js, Vitest.
Firmware *(planned)*: Arduino core for ESP32, ArduinoJson, LiquidCrystal.
Services *(planned)*: Vercel (hosting), Firebase Realtime Database (sensor readings).

## AI tools
| Tool | Use |
|---|---|
| Claude Code (Anthropic) | Planning and writing code for the pipeline, web app and firmware |
| LLM via Groq free tier *(planned; model named in `briefings.json`)* | Plain-language briefings that explain already-computed results. The LLM does not detect floods or decide alert tiers |
