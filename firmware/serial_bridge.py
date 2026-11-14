"""USB fallback for when the ESP32 cannot join Wi-Fi.

Relays over the serial port:  ESP32 "SENSOR {...}" lines -> Firebase /sensor/latest
                              site /api/tier JSON        -> ESP32 "TIER {...}" lines
Usage: pip install pyserial requests
       python firmware/serial_bridge.py <PORT> <SITE_URL> <FIREBASE_URL>
       e.g. python firmware/serial_bridge.py COM5 https://x.vercel.app https://x-default-rtdb.firebaseio.com
"""
import json
import sys
import time

import requests
import serial

port, site, fb = sys.argv[1], sys.argv[2].rstrip("/"), sys.argv[3].rstrip("/")
ser = serial.Serial(port, 115200, timeout=0.2)
last_tier = 0.0
while True:
    line = ser.readline().decode(errors="replace").strip()
    if line.startswith("SENSOR "):
        try:
            d = json.loads(line[7:])
            d["ts"] = int(time.time())  # the ESP32 has no clock without Wi-Fi
            requests.put(f"{fb}/sensor/latest.json", json=d, timeout=4)
        except Exception as e:  # noqa: BLE001
            print("sensor relay failed:", e)
    elif line:
        print(line)
    if time.time() - last_tier > 2.5:
        last_tier = time.time()
        try:
            t = requests.get(f"{site}/api/tier", timeout=6).text.strip()
            ser.write(("TIER " + t + "\n").encode())
        except Exception as e:  # noqa: BLE001
            print("tier relay failed:", e)
