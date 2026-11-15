# Credits and citations

TerraWatch is a 2-day hackathon prototype built for the NASA Space Apps Challenge 2026
("Dancing with the SARs"). Everything it uses is listed here.

## NASA data and services

| Source | Used for | Access |
|---|---|---|
| **NISAR Level-2 GCOV** (NASA–ISRO Synthetic Aperture Radar mission), collection `NISAR_L2_GCOV_PROVISIONAL_V1`, DOI [10.5067/NIL2GCOV-P1](https://doi.org/10.5067/NIL2GCOV-P1) | Before/after L-band HH and HV backscatter; flood change detection; wetness and water-extent signals | NASA Alaska Satellite Facility DAAC (ASF), read with NASA Earthdata Login |
| **NASA CMR** (Common Metadata Repository) | Finding NISAR granule pairs; the in-app "when did NISAR last image this point" lookup | https://cmr.earthdata.nasa.gov |
| **NASA EONET v3** (Earth Observatory Natural Event Tracker) | Flood and severe-storm event discovery; the "World" feed | https://eonet.gsfc.nasa.gov/api/v3/ |
| **NASA GIBS**, layer `MODIS_Terra_CorrectedReflectance_Bands721` | Independent optical comparison layer on the map | https://gibs.earthdata.nasa.gov |

### NISAR granules analysed

| Region | Before | After |
|---|---|---|
| Tonle Sap, Cambodia (track 83, frame 8) | `NISAR_L2_PR_GCOV_023_083_A_008_2005_DHDH_M_20260619T223637_20260619T223711_P05023_N_F_J_001` | `NISAR_L2_PR_GCOV_033_083_A_008_2005_DHDH_M_20261017T223633_20261017T223708_P05023_N_F_J_001` |
| Paraguay, EONET_20898 (track 60, frame 164) | `NISAR_L2_PR_GCOV_023_060_A_164_2005_DHDH_A_20260618T094759_20260618T094834_P05023_N_F_J_001` | `NISAR_L2_PR_GCOV_024_060_A_164_2005_DHDH_A_20260630T094759_20260630T094833_P05023_N_F_J_001` |
| Inner Niger Delta, Mali (track 145, frame 9) | `NISAR_L2_PR_GCOV_023_145_A_009_2005_DHDH_A_20260624T055000_20260624T055035_P05023_N_F_J_001` | `NISAR_L2_PR_GCOV_032_145_A_009_2005_DHDH_A_20261010T054957_20261010T055031_P05023_N_F_J_001` |

The same IDs and acquisition dates are shown in the app's Credits tab and stored in
`web/public/data/<region>/meta.json`.

## Other data

| Source | Used for |
|---|---|
| **Open-Meteo** Forecast API (CC BY 4.0), https://open-meteo.com | 48-hour rainfall forecast |
| **JRC Global Surface Water** occurrence, v1.4 (Pekel, Cottam, Gorelick & Belward, 2016, *Nature* 540, 418–422) | Permanent-water baseline removed from the flood map |
| **Copernicus DEM GLO-30** (© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA) | Slope mask |
| **ESA WorldCover 10 m 2021 v200** (Zanaga et al., 2022; CC BY 4.0) | Land-cover breakdown of flooded area; tree cover for the flooded-vegetation flag |
| **OpenStreetMap** contributors, tiles by **CARTO** | Basemap |

## Software

- **Pipeline (Python):** earthaccess, h5py, numpy, rasterio (GDAL), scipy, scikit-image, shapely, pyproj,
  requests, python-dotenv, openai (client for the OpenAI-compatible briefing endpoint), Pillow.
- **Web:** Vite, React, TypeScript, MapLibre GL JS, Turf.js, Vitest, esbuild.
- **Firmware:** Arduino core for ESP32 (Espressif), ArduinoJson (Benoît Blanchon), LiquidCrystal.
- **Services:** Vercel (hosting and one serverless function), Firebase Realtime Database (sensor
  readings and demo flags), GitHub.
- **Design guidance:** the published "Impeccable" design skill by Paul Bakaus (Apache 2.0) was
  followed by hand when restyling the interface.

## AI tools

| Tool | Use |
|---|---|
| **Claude Code** (Anthropic) | Planning; writing the pipeline, web app, firmware and documentation; reviewing results. All NISAR processing was run by the team member on their own laptop. |
| **LLM via Groq** (OpenAI-compatible endpoint; the model name is recorded in each `briefings.json`) | Writing the plain-language briefings from a fixed set of computed facts. Every number in a briefing is checked automatically against those facts. The LLM does not detect floods and does not choose alert levels. |

If the briefing card in the app reads "No briefing cached", the briefings had not been generated at
the time of that build.

## Method references

- Otsu, N. (1979). A threshold selection method from gray-level histograms. *IEEE Trans. SMC* 9(1), 62–66.
- NISAR product documentation: https://nisar-docs.asf.alaska.edu
