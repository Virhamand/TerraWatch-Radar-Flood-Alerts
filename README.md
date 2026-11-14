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
```

See [CREDITS.md](CREDITS.md) for all data, libraries, APIs and AI tools. Status: [PROGRESS.md](PROGRESS.md).
