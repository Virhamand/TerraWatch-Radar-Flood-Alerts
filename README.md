# TerraWatch-Radar-Flood-Alerts
Flood monitoring and tiered alerts using NASA–ISRO NISAR radar data, rainfall forecasts, an ESP32 ground sensor, and AI briefings. Built for NASA Space Apps 2026.

> Hackathon prototype. TerraWatch supplements, but does not replace, official emergency alerts.

## Run the pipeline (local)

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r pipeline/requirements.txt
cp .env.example .env                                 # then fill in Earthdata + LLM keys
python pipeline/01_discover.py --regions             # find events with pre/post NISAR pairs
python pipeline/02_inspect.py <granule name or URL>  # print the HDF5 layout of one granule
# define the region in REGIONS in pipeline/config.py, then for each region:
python pipeline/04_detect.py --region <id>           # flood change detection
python pipeline/05_export.py --region <id>           # write web/public/data/<id>/
python pipeline/06_briefings.py --region <id>        # cached AI briefings
```

TerraWatch gives an alert level for any point on Earth. NISAR flood maps exist only inside the regions that
have been analysed; elsewhere the app says so, shows when NISAR last imaged the point, and uses the rain
forecast and ground sensor alone.

See [CREDITS.md](CREDITS.md) for all data, libraries, APIs and AI tools. Status: [PROGRESS.md](PROGRESS.md).
