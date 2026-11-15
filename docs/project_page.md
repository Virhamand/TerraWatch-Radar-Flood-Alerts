# Space Apps project page text

Copy each section into the matching field on the Space Apps submission form. Figures are from the
exports in `web/public/data/`; re-check them if a region is re-run.

## Project name

TerraWatch

## High-level summary (short)

TerraWatch turns radar data from the NASA–ISRO NISAR satellite into flood alerts people can act on.
It compares before and after L-band radar images to map new flooding, then combines that map with
a 48-hour rain forecast and a live ESP32 water sensor to give any location one of four alert levels,
from green to red. Every alert shows which signals triggered it and how old the data is, and a
plain-language briefing explains it for residents, emergency managers, farmers or students. An ESP32
with a light, screen and buzzer shows the same alert on a desk.

## Project demo

https://terra-watch-radar-flood-alerts.vercel.app

## Final project (repository)

https://github.com/Virhamand/TerraWatch-Radar-Flood-Alerts

## Project details

**The problem.** Flood maps from satellites are hard to read and are often days old by the time
anyone sees them. A person deciding whether to move livestock or a car does not need a backscatter
image; they need to know how worried to be, why, and how much to trust the answer.

**What TerraWatch does.**

- *Maps flooding with NISAR.* Smooth open water reflects radar away from the satellite and looks
  dark. TerraWatch subtracts a before image from an after image, finds the brightness drop that
  separates flooded from unflooded land automatically (Otsu's method), and removes permanent water,
  steep slopes and tiny patches. It also flags brightening under tree cover, the L-band
  double-bounce signature of flooded forest.
- *Analyses three regions on three continents:* Tonle Sap, Cambodia (494 km² newly flooded between
  19 June and 17 October 2026); the Inner Niger Delta, Mali (748 km², 24 June to 10 October); and a
  flood listed by NASA EONET in Paraguay (53 km², 18 to 30 June).
- *Combines five signals into four tiers.* Soil wetness and water-above-normal from NISAR, rain
  forecast, a ground sensor, and distance to mapped flooding. Red means the location is inside a
  mapped flood or three signals agree; orange means flooding within 25 km or two signals; yellow
  means wet ground plus heavy rain forecast.
- *Works for any point on Earth.* Outside the analysed regions it says so plainly, asks NASA's
  catalog when NISAR last imaged that point, and bases the alert on the forecast and sensor.
- *Is honest about freshness.* NISAR revisits about every 12 days, so each alert carries badges for
  the age of the satellite image, the forecast and the sensor reading.
- *Uses the ESP32 for real work.* The board reads the alert level from the deployed site and shows
  it on an RGB light, an LCD and a buzzer. Its water-level sensor posts readings that feed back in
  as one of the five signals, so pouring water into a cup can raise the alert on screen.

**How it was built.** A Python pipeline runs locally: it finds NISAR image pairs through NASA's
catalog, reads only the area of interest from each multi-gigabyte file over the network, processes
it, and exports small images and polygons. A static React and MapLibre site on Vercel displays them.
One tier engine, with unit tests, runs both in the browser and in the function the ESP32 calls.

**Limitations.** Flood maps exist only where the pipeline has been run. The map shows the date of
the after image, not today. Two of the three regions are seasonal floods chosen because they
reliably show change; two other EONET events were processed and dropped because NISAR showed almost
no flooding at the listed point. Nothing has been validated on the ground.

**What comes next.** Process NISAR automatically in the cloud after each pass, combine it with
other satellites such as Sentinel-1 to shorten the gap between images, and validate against
official flood extents.

## Use of artificial intelligence

- **Claude Code (Anthropic)** was used to plan the project and to write the pipeline, web app,
  firmware and documentation. All NISAR data access and processing was run by the team member.
- **A large language model served by Groq** writes the short briefings in the app. It is given a
  fixed JSON of computed facts and told to state nothing else; every number it writes is checked
  automatically against those facts. It does not detect floods and does not choose alert levels.
- AI-written text in the app is labelled as such beside each briefing.

## NASA data

- **NISAR Level-2 GCOV** (`NISAR_L2_GCOV_PROVISIONAL_V1`, DOI 10.5067/NIL2GCOV-P1), from the NASA
  Alaska Satellite Facility DAAC: HH and HV backscatter for six granules (three before/after pairs).
- **NASA CMR**: granule search, and the live "last imaged" lookup in the app.
- **NASA EONET v3**: flood and severe-storm events for discovery and the world feed.
- **NASA GIBS**: MODIS Terra corrected reflectance as an independent comparison layer.

## Space agency partner and other data

- JRC Global Surface Water (European Commission): permanent-water baseline.
- Copernicus DEM GLO-30 (ESA / European Union): slope mask.
- ESA WorldCover 2021: land cover.
- Open-Meteo: rainfall forecast.
- OpenStreetMap contributors and CARTO: basemap.

## References and tools

Full list with licences in `CREDITS.md`. Main tools: Python (earthaccess, h5py, rasterio, scipy,
scikit-image, shapely), React, TypeScript, MapLibre GL JS, Turf.js, Vite, Vercel, Firebase Realtime
Database, Arduino core for ESP32, ArduinoJson.
