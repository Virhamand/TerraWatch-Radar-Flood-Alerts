# TerraWatch: project context

Everything the planning and build chat covered, written so a new session or a teammate can pick up
without the conversation. Last updated 2026-11-15. For the short live checklist see `PROGRESS.md`.

## 1. The project

**TerraWatch** detects flooding from radar data from the NASA-ISRO **NISAR** satellite, combines it
with a 48-hour rain forecast and a live ESP32 ground sensor, and turns the result into a tiered alert
(GREEN, YELLOW, ORANGE, RED, plus BLUE for global reports) with plain-language AI briefings.

- Built **solo** for the NASA Space Apps Challenge 2026, challenge "Dancing with the SARs", Norwalk
  local event (Cerritos College). Hackathon Sat 14 to Sun 15 Nov 2026.
- **Only deadline:** submission Sunday 1:00 PM. Judging 2:00 PM (3-minute demo, 3-minute Q&A).
  Saturday times in the early plan were pacing checkpoints, not freezes.
- Free tools only, CPU-only laptop, English only, MIT licence, every source cited in `CREDITS.md`.
- Rubric (55 pts): relevance 10, works and facts believable 10, NASA data used with sources named 10,
  ESP32 doing real work 5, creativity 10, presentation 10. Judges include physics/maths professors,
  an engineering manager and a DevOps engineer.
- User's GitHub repo: `Virhamand/TerraWatch-Radar-Flood-Alerts`. Public site:
  https://terra-watch-radar-flood-alerts.vercel.app

## 2. Working arrangement and environment

- The cloud session (this assistant) writes and tests code and pushes to branch
  `claude/terrawatch-planning-ftxj87`. It **cannot reach** NASA CMR/EONET/ASF, Open-Meteo, CARTO
  tiles, NASA GIBS, Groq, Firebase or Vercel (egress proxy blocks them). It can reach the public
  Copernicus DEM, ESA WorldCover and JRC buckets and npm/PyPI.
- The user runs everything that needs NASA credentials or the network on their **Windows laptop,
  PowerShell, VS Code**, repo at `C:\Users\rolis\TerraWatch-Radar-Flood-Alerts`, local branch `main`.
  They push with `git push origin HEAD:claude/terrawatch-planning-ftxj87`, and merge to `main`
  (pull requests or local merges). Vercel **Production builds from `main`**; claude-branch pushes only
  make Preview deployments.
- Git history already contains early commits with `Claude-Session:` trailers. The user asked for **no
  `Co-Authored-By` line** in commits ("this won't be showcased anywhere"); leave it out.
- The user has **no soldering kit**: everything must be breadboard and jumper wires.
- Node.js was not installed on the laptop (npm unrecognised). Not needed for deployment; only for
  local `npm run dev`. Install with `winget install OpenJS.NodeJS.LTS`, then open a new PowerShell.
- Earthdata login works (username `virhamand`). `.env` holds Earthdata credentials. **Groq key not yet
  added**, so briefings are not generated.

## 3. Hardware

User has an UNO R3 kit plus an **ESP32 DevKit V1 (CP2102 USB chip, appears as COM7)**, three
breadboards (they are using **two 830-point boards** side by side), and: RGB LED (4 legs), red/yellow/
blue/green/white LEDs, 100 resistors, active and passive buzzers, LCD1602, 10K potentiometer, water
level detection sensor module, HC-SR04-style ultrasonic sensor, DHT11, jumper wires (65 M-M, 10 F-M)
and more. **No OLED** (the brief's OLED was replaced by the LCD1602).

Design used (pins in `firmware/terrawatch_esp32/terrawatch_esp32.ino`):

| Part | ESP32 pin |
|---|---|
| RGB LED red / green / blue (each via 220 ohm) | D25 / D26 / D27 (long leg to GND) |
| Active buzzer + | D33 |
| Water level sensor S (power from 3V3, not 5 V) | D34 (ADC1) |
| LCD1602 RS, E | D22, D21 |
| LCD1602 D4, D5, D6, D7 | D19, D18, TX2 (pin 17), RX2 (pin 16) |
| LCD VDD / backlight A (via 220 ohm) | 5 V (VIN); V0 from potentiometer middle leg; RW and VSS and K to GND |

Status: firmware **compiled and uploaded to the real board**. Serial Monitor (115200 baud) showed the
sensor loop running (`SENSOR {"level":0,...}`) and Wi-Fi failing as expected with placeholder
credentials. **Not yet wired or tested:** LED, buzzer, LCD, water sensor, Wi-Fi with the real hotspot,
the live tier loop. The user said they would return to the hardware later.

Wiring help: a published diagram artifact, https://claude.ai/artifact/YPxdzHZqGuo8RurVsow5Ym ("TerraWatch
Wiring"), shows both 830 boards hole by hole with a tick-off checklist. User-confirmed layout facts:
ESP32 is on column **j** of the left board and column **a** of the right board (the left board is
physically turned round relative to the right, so its columns read j..a left to right), starting at
the top, USB socket at the **far** end. In that orientation the VIN side is the left board: all parts
go on the left board, powered from its inner rails (5 V), and the water sensor plugs in beside the
ESP32's 3V3, GND and D34 pins. The diagram's row numbers count from the ESP32's first pin, not the
printed numbers. A fallback exists: `firmware/serial_bridge.py` relays over USB if Wi-Fi fails.

Known hardware cautions: 2.4 GHz hotspot only; iPhone hotspot names with curly apostrophes break
joins; LCD needs pre-soldered pins (not yet checked); RW must go to GND; never join 5 V and 3.3 V rails.

## 4. Data and pipeline

**Data sources:** NISAR L2 GCOV (`NISAR_L2_GCOV_PROVISIONAL_V1`, DOI 10.5067/NIL2GCOV-P1, via ASF DAAC),
NASA CMR, NASA EONET v3, NASA GIBS (MODIS Terra bands 7-2-1 as the comparison layer), Open-Meteo,
JRC Global Surface Water, Copernicus DEM GLO-30, ESA WorldCover 2021, CARTO/OSM basemap.

**Real GCOV layout** (confirmed with `02_inspect.py` on a real granule):
`/science/LSAR/GCOV/grids/frequencyA/{HHHH,HVHV,mask,xCoordinates,yCoordinates,projection}`, 20 m UTM,
float32 linear gamma-0, 512 px gzip chunks, `mask` 255 = outside swath. Granule size in the discovery
output shows 0 GB (a cosmetic parsing bug).

**Discovery result (user ran it):** 73 events with a pre/post pair on the same track and frame, 23 of
them floods (all EONET flood listings are 18 Jun to 1 Jul 2026), plus time series for seven seasonal
fallback regions.

**Pipeline scripts** (`pipeline/`, all take `--region <id>` except 01/02):

| Script | Job | Status |
|---|---|---|
| `01_discover.py` | EONET + CMR search for pre/post pairs | run by user |
| `02_inspect.py` | print a granule's HDF5 layout remotely | run by user |
| `03_fetch.py` | windowed remote read of pre/post, 2x2 multilook to 40 m, plus JRC/DEM/WorldCover on the same grid | run by user on all regions |
| `04_detect.py` | dB, 5x5 median, post-minus-pre, Otsu (fallback -3 dB if outside -8..-1.5), water ceiling -15 dB, remove JRC>=80%, slope>5 deg, patches<1 ha, flooded-vegetation flag | run by user |
| `05_export.py` | PNGs, `flood.geojson`, `stats.json`, `signals.json` (per 0.05 deg cell), `meta.json`, shared `regions.json`/`events.json`/`config.json`, demo pins | run by user |
| `06_briefings.py` | LLM briefings per tier and audience, with an automatic number-must-exist-in-facts check; `--global` for unanalysed places | **not run** (no Groq key) |
| `make_fixtures.py` | synthetic placeholder regions (auto-removed by the first real export) | dev only |

`config.py` holds `REGIONS` and all thresholds (`ALERT_MIN_PATCH_KM2 = 1.0`, etc.).

## 5. Regions

| Region | Pair | Result | Decision |
|---|---|---|---|
| **tonle_sap** (Cambodia, seasonal, AOI 103.70-104.45 E, 12.95-13.55 N) | 19 Jun to 17 Oct 2026, track 83A frame 8 | 494.3 km2, Otsu -5.3 dB, 42 alert polygons | Kept (showcase) |
| **paraguay** (EONET_20898) | 18 to 30 Jun 2026, track 60A frame 164 | 53.4 km2, Otsu -4.6 dB, 8 polygons | Kept (event-based example); NISAR swath edge crosses the box |
| **niger_delta** (Mali, seasonal) | 24 Jun to 10 Oct 2026, track 145A frame 9 | 748.1 km2, Otsu -3.7 dB, 100 polygons | Kept; no point in its box is more than 25 km from flooding |
| costa_rica (EONET_20981) | 19 Jun to 1 Jul | 0.2 km2, Otsu failed | Dropped |
| slovakia (EONET_20879) | 20 Jun to 2 Jul | 1.4 km2, Otsu failed | Dropped |

Both kept seasonal regions must be labelled seasonal inundation, not disasters. Tonle Sap's first
AOI was half open lake and made the GREEN demo start impossible; it was moved north and demo pins are
now chosen on dry land (far pin at least 28 km from alert flooding, preferably on wet ground).

Alert polygons are limited to patches of at least 1 km2 (hundreds of paddy-sized patches otherwise put
every pin within 25 km of flooding); the overlay image still shows everything.

## 6. Alert logic (`web/src/shared/tier.ts`, 19 passing tests)

Five signals: soil wetness (NISAR HV proxy, per-cell percentile, high at >=80th), water above normal
(NISAR water vs JRC baseline, high at >=1.5x), rain forecast (>=50 mm in 48 h, Open-Meteo), ground
sensor rising (ESP32, high at >=150 units per minute, offline after 30 s), mapped flooding within 5 km.

Tiers as implemented:
- **RED:** pin inside a mapped flood polygon, or three or more signals high.
- **ORANGE:** mapped flooding within 25 km (including 0-5 km), or two signals high.
- **YELLOW:** exactly one ground signal (wetness or water) plus the rain signal.
- **GREEN:** otherwise. BLUE is the global feed. Notifications only when the tier rises.

Deviations from the original brief, made on purpose: YELLOW is "exactly one ground sign plus rain"
(as literally specified it was unreachable); flooding within 5 km but not inside is ORANGE; signals 1
and 2 are per grid cell, not one value per area. The LLM only explains; it never decides tiers.

## 7. Web app (`web/`)

Vite + React + TypeScript + MapLibre + Turf. Light paper-toned control panel beside a dark map
(restyled following the published Impeccable design skill, applied by hand; the plugin itself was not
installed). Features: before/after swipe slider, flood overlay with opacity, legend, region switcher,
tier card with five signals and freshness badges, demo pins, **Simulate storm / Simulate sensor rise**
switches (also written to Firebase `/demo` so the ESP32 follows), bell and banner and browser
notifications, tabs (Briefing, Stats, World, How it works, Credits), the exact "How alerts work" copy,
GIBS comparison layer.

**Multi-region design (decided with the user):** the app gives a tier for any pin on Earth. NISAR flood
maps exist only inside analysed regions; elsewhere it shows "No NISAR flood analysis here yet", does a
live NASA CMR lookup of when NISAR last imaged that point, and uses rain plus sensor only. The user
will present this as a known limitation and future work (combine NISAR with other satellites). Whole-
Earth flood maps were advised against (data volume, needs event/date pairs, hosting).

Data layout: `web/public/data/{config,events,regions,briefings}.json` and one folder per region
(`meta, stats, signals, forecast, briefings` JSON, `flood.geojson`, `pre/post/flood.png`).

**ESP32 endpoint:** `web/server/tier.ts` bundles to committed `web/api/tier.js` (Vercel function) using
the same tier engine. `GET /api/tier` returns `{tier, code, title, line (<=16 chars), signals_high,
sat_age_d, region, sensor, simulated, fixture, ts}`. It reports the fixed demo sensor site (Tonle Sap
far pin), not the browser pin. **Verified on the live site.** The Vercel build no longer re-bundles
the function (`npm run build:all` does).

**Firebase Realtime Database** (test mode): `https://terrawatch-44097-default-rtdb.firebaseio.com`,
set in `config.json`. Stores `/sensor/latest` and `/demo`. The user confirmed the full chain: browser
toggle writes Firebase, Vercel endpoint reads it, returns YELLOW with `"simulated":true`.

## 8. Verified, and not

**Verified:** real NISAR pipeline on three regions; demo walk on real Tonle Sap data (far pin GREEN,
storm YELLOW, plus sensor RED; near ORANGE; inside RED); `/api/tier` live; Firebase write/read chain;
firmware compiles, uploads and runs; detection recovered a known flood to within 1% on synthetic
scenes in the real file layout.

**Not verified (cloud session blocked, needs the user's browser):** basemap rendering; the GIBS
comparison layer; the live CMR coverage lookup from a browser (CORS unconfirmed; if blocked, proxy it
through the Vercel function, ~20 minutes); the live Open-Meteo badge (shows "(saved)" in the sandbox);
"My location" and browser notifications; the Groq call in `06_briefings.py`.

## 9. Documents in the repo

`README.md` (overview, tiers, method, run steps, screenshot `docs/screenshot.png`), `CREDITS.md`
(finalised, no "planned" entries), `docs/project_page.md` (Space Apps submission text),
`docs/demo_script.md` (timed 3-minute walk-through, Q&A prep, key figures), `PROGRESS.md`, this file.

## 10. Remaining work

**User:**
1. Merge the claude branch into `main` so Vercel Production updates; test the public link in an
   incognito window and on a phone.
2. Check on the live site: basemap shows; "Compare with independent NASA layer" shows imagery; clicking
   far from any region shows "NISAR last imaged this point on..." (not "lookup unavailable"); forecast
   badge has no "(saved)"; "My location" and "Enable browser alerts" work.
3. Groq key in `.env`, then run `06_briefings.py --region <id>` for each of the three regions and
   `--global`, read every briefing, commit.
4. Hardware: stage-by-stage bring-up (RGB LED, buzzer, Wi-Fi with hotspot credentials in
   `firmware/.../secrets.h`, LCD, water sensor), then tune the rise threshold from the sensor's dry,
   half-dipped and fully dipped readings. Check the LCD has pins attached.
5. Record the backup demo video, rehearse twice, fill in the Space Apps form from
   `docs/project_page.md`, make slides.

**Assistant:** react to whatever the live-site check turns up; adjust the sensor threshold; update the
wiring page if the physical layout differs.

## 11. Commands the user needs

Push everything: `git add -A; git commit -m "message"; git push origin HEAD:claude/terrawatch-planning-ftxj87`
Pull my changes: `git pull origin claude/terrawatch-planning-ftxj87`
Merge to main: `git pull --no-edit origin main`, `git pull --no-edit origin claude/terrawatch-planning-ftxj87`,
`git push origin main` (or a GitHub pull request). Set the Git editor to Notepad once with
`git config --global core.editor "notepad"` to avoid Vim prompts. Run a region:
`python -u pipeline/03_fetch.py --region <id>`, then 04, 05, 06 with `--region <id>`.
