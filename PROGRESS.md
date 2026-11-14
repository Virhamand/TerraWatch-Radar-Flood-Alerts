# Progress log

Resume point for any new session. Full plan: see "Plan summary" below.

## Done
- Repo scaffold, `.gitignore`, `.env.example`, CREDITS.md
- `pipeline/01_discover.py` (EONET + CMR pair search), `pipeline/02_inspect.py` (HDF5 structure dump).
  Written without network access to NASA hosts: NOT yet run against real data.
- `web/src/shared/tier.ts` tier engine + 19 passing tests (`npm test` in `web/`)
- `pipeline/make_fixtures.py`: synthetic placeholder data in `web/public/data/` (app shows a PLACEHOLDER banner)
- Web app v1 (`web/`): swipe map, flood overlay + opacity, legend, tier card with 5 signals and freshness
  badges, demo pins, simulate storm / sensor toggles, bell + banner + browser notifications, AI briefing
  card with audience switch, stats, world feed, How it works, Data & credits. Builds clean; tier walk
  verified in headless Chromium on fixtures (GREEN -> YELLOW -> RED, ORANGE near flood, RED inside).
- `web/server/tier.ts` -> bundled to `web/api/tier.js` (`npm run build:api`): the endpoint the ESP32 polls.
  Called locally against the built site: GREEN / ORANGE / RED for the three demo pins. Not yet run on Vercel.

## Not verified yet
- Basemap tiles (CARTO) and the NASA GIBS comparison layer: hosts are blocked in the cloud session,
  so they have only been coded, never seen rendering. Check on the laptop with `npm run dev`.
- Live Open-Meteo call and Firebase sensor polling (same reason).

## Next
1. User: `git pull`, run `01_discover.py --regions`, paste output; lock event (Checkpoint A)
2. User: run `02_inspect.py` on one granule, paste output
3. `03_fetch.py`, `04_detect.py`, `05_export.py` fitted to the real HDF5 layout
4. Deploy to Vercel (project root directory = `web`), then check `/api/tier` on the public URL
5. `06_briefings.py`, then firmware

## Design notes
- Ground signals 1-2 are a grid of cells in `signals.json` (per location, not one value per AOI), and the
  grid may cover more of the NISAR frame than the detailed flood map, so a pin can be >25 km from flooding
  and still have ground data. Needed for a GREEN -> YELLOW demo step.
- Flooding within 25 km (not inside) is ORANGE, including the 0-5 km band.
- YELLOW = exactly one ground sign + rain; any other pair is ORANGE; three or more is RED.

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
