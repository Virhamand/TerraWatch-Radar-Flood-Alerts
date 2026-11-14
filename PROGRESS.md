# Progress log

Resume point for any new session. Full plan: see "Plan summary" below.

## Done
- Repo scaffold, `.gitignore`, `.env.example`, CREDITS.md
- `pipeline/01_discover.py` (EONET + CMR pair search), `pipeline/02_inspect.py` (HDF5 structure dump).
  Written without network access to NASA hosts: NOT yet run against real data.

## In progress
- Frontend scaffold with fixture data (`web/`)

## Next
1. User runs `01_discover.py` (+ `--regions`) and pastes the output; lock the event (Checkpoint A, Sat 1:30 PM PST)
2. User runs `02_inspect.py` on one granule and pastes the output
3. `03_fetch.py`, `04_detect.py`, `05_export.py` fitted to the real HDF5 layout
4. Tier engine + UI, briefings, firmware (see plan order)

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
