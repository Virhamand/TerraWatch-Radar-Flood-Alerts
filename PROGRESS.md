# Progress log

Resume point for any new session. Full plan: see "Plan summary" below.

## Done
- Repo scaffold, `.gitignore`, `.env.example`, CREDITS.md
- `pipeline/01_discover.py`: RUN BY USER on Windows; found 3 NISAR GCOV collections (BETA, PROVISIONAL, V1,
  data from 2025-10) and 213 EONET candidate points. Now parallel with progress output. Shortlist not yet seen.
- `pipeline/02_inspect.py`: RUN BY USER on the Tonle Sap post granule. Real layout confirmed:
  `/science/LSAR/GCOV/grids/frequencyA/{HHHH,HVHV,mask,xCoordinates,yCoordinates,projection}`, 20 m UTM,
  float32 linear gamma-0, 512 px gzip chunks, mask 255 = outside swath; frequencyB is 80 m.
- `pipeline/03_fetch.py`: windowed remote read of pre/post + 2x2 multilook to 40 m + JRC / Copernicus DEM /
  WorldCover warped to the same grid. TESTED on mock granules in the real layout (775 km2 detected vs 779 true)
  with the REAL ancillary tiles (those hosts are reachable from the cloud session). Not yet run on real NISAR.
- MULTI-REGION layout (decided with user): the app works for any pin on the globe; NISAR flood maps exist only
  inside analysed regions. `web/public/data/regions.json` indexes regions; each has `data/<id>/` with meta,
  stats, signals, flood.geojson, briefings, forecast, PNGs. Shared: config.json, events.json, briefings.json
  (briefings for unanalysed places). Regions are defined in `REGIONS` in `pipeline/config.py`; every pipeline
  script takes `--region <id>`.
- Outside analysed regions the app shows "No NISAR flood analysis here yet" plus a live NASA CMR lookup of when
  NISAR last imaged the point; tier there uses rain + sensor only. User will present this as a known limitation
  (future work: combine NISAR with other satellites).
- `pipeline/04_detect.py` + `pipeline/05_export.py`: TESTED on synthetic UTM rasters with a known flood:
  detected 104.97 km2 vs true 105.0; slope mask removed a false-positive hill; export loads in the app.
- `pipeline/06_briefings.py --region <id>` / `--global`: facts + number checker tested; LLM call untested.
- `web/src/shared/tier.ts` tier engine + 19 tests; `web/server/tier.ts` -> `web/api/tier.js` for the ESP32
  (tested locally, region-aware; not yet on Vercel).
- Web app: swipe map, region switcher, tier card, demo pins per region, simulate toggles, notifications,
  briefing/stats/world/how/credits tabs. Restyled per Impeccable guidance (applied by hand).
- Firmware `firmware/terrawatch_esp32/` + `firmware/serial_bridge.py`: written, NOT compiled or run.
- `pipeline/make_fixtures.py`: two synthetic placeholder regions (removed automatically by the first real export).

## Real data status
- tonle_sap: REAL NISAR export in the repo (pre 2026-06-19, post 2026-10-17, AOI north shore + Siem Reap).
  494.3 km2 flooded, Otsu -5.3 dB. Alert polygons = patches >= 1 km2 (42 polygons); the overlay PNG shows all.
  Demo walk verified on it: far pin GREEN -> storm YELLOW -> +sensor RED; near pin ORANGE; inside RED.
  The pin/polygon rule was applied to the exported files by hand in the cloud session; 05_export.py now does the same.
- costa_rica: processed, only 0.2 km2 detected (Otsu failed, fixed threshold) -> DROPPED from app and config.
- niger_delta (seasonal, pre 2026-06-24, post 2026-10-10, track 145A frame 009): added to config, not yet processed.
- paraguay (EONET_20898): REAL export in repo, KEPT: 53.4 km2, Otsu -4.6 dB, 8 alert polygons; walk far GREEN / near ORANGE / inside RED verified. The NISAR swath edge crosses the box (east part has no data).
- slovakia (EONET_20879): processed, 1.4 km2, Otsu failed -> DROPPED.
- Vercel: user says the site is deployed (URL not yet shared; /api/tier on Vercel not yet confirmed).
- Briefings: none yet (user has no Groq key in .env yet).
- User's laptop: Windows, PowerShell, works on local `main`, pushes with `git push origin HEAD:claude/terrawatch-planning-ftxj87`. Node.js not installed yet.

## Not verified yet (hosts blocked in the cloud session)
- Basemap tiles (CARTO), NASA GIBS comparison layer, live Open-Meteo, Firebase polling.
- The CMR coverage lookup from a browser (CORS not confirmed; tested only against a mocked response).
  If the browser blocks it, proxy it through the Vercel function.

## Next
2. User: `03_fetch.py --region tonle_sap`, then 04 -> 05 -> 06; send output + screenshots for threshold tuning
3. Repeat for costa_rica, paraguay, slovakia
5. User: deploy to Vercel (root directory `web`), create Firebase DB, wire and flash the ESP32

## Design notes
- Ground signals 1-2 are per grid cell in `signals.json`. A pin's region is found by `regions.json` bbox.
- Flooding within 25 km (not inside) is ORANGE, including the 0-5 km band.
- YELLOW = exactly one ground sign + rain; any other pair is ORANGE; three or more is RED.
- In a ~40 km region every pin is within 25 km of flooding, so the demo's GREEN -> YELLOW step needs either a
  larger AOI or a hand-placed far pin; decide once real data exists.

## Regions chosen (2026-11-14, from the user's shortlist: 73 event pairs, 23 of them floods)
- tonle_sap (seasonal, guaranteed large change; pre 2026-06-19, post 2026-10-17, track 083A frame 008) - do first
- costa_rica EONET_20981 (post image same day as event), paraguay EONET_20898 (+2.4 d), slovakia EONET_20879 (+2.2 d)
- EONET points are approximate; whether flooding is visible inside each AOI is unknown until processed.
- Granule sizes came back as 0 GB (size parsing bug in 01_discover, cosmetic).

## Open questions for the user
- None yet

## Plan summary
- Pipeline (Python, user's laptop) exports to `web/public/data/`; static Vite/React/MapLibre site on Vercel.
- One tier engine `web/src/shared/tier.ts` shared by the app and `web/api/tier.ts` (read by the ESP32).
- Firebase Realtime Database holds `/sensor/latest` and `/demo` simulate flags.
- Hardware: ESP32 + RGB LED + active buzzer + LCD1602; analog water-level module on GPIO 34.
- Checkpoints (PST): A Sat 1:30 PM event locked; B Sat 5 PM real polygons exported; C Sat 8 PM
  GREEN→RED walk on public URL (LightGBM cut here); D Sun 8:30 AM sensor loop or cut;
  E Sun 10 AM cut unfinished comparison/feed and the vegetation flag. Freeze Sun 1 PM.
