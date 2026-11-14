/*
  TerraWatch ESP32 node  (NASA Space Apps 2026)

  OUTPUT: polls <site>/api/tier and shows the alert level on an RGB LED, an LCD1602 and a buzzer
          (buzzer on RED only).
  INPUT:  reads the analog water-level sensor, computes how fast the level is rising and PUTs
          {level, rate, ts} to Firebase. That reading is TerraWatch signal 4 ("ground sensor rising").

  NOTE: written without hardware access - not yet compiled or run. Bring up in this order and
  check the Serial Monitor (115200) at each step: LED -> buzzer -> Wi-Fi -> LCD -> sensor.

  Board: "ESP32 Dev Module" (Arduino core for ESP32 2.0.x or 3.x)
  Libraries (Library Manager): ArduinoJson (v7), LiquidCrystal (Arduino built-in library)

  WIRING (ESP32 logic is 3.3 V)
    RGB LED (common cathode: longest leg -> GND)   R -> 220R -> GPIO25
                                                   G -> 220R -> GPIO26
                                                   B -> 220R -> GPIO27
    Active buzzer        + -> GPIO33, - -> GND
    Water level sensor   + -> 3V3, - -> GND, S -> GPIO34   (power from 3V3, NOT 5 V)
    LCD1602 (parallel)   VSS -> GND, VDD -> 5V (VIN), V0 -> middle pin of 10K pot (ends: 5V, GND)
                         RS -> GPIO22, RW -> GND (important), E -> GPIO21
                         D4 -> GPIO19, D5 -> GPIO18, D6 -> GPIO17, D7 -> GPIO16
                         A -> 220R -> 5V, K -> GND
  If the LCD shows nothing, turn the pot: the contrast is almost always the problem.

  Copy secrets.example.h to secrets.h and fill it in (secrets.h is gitignored).
  If Wi-Fi is unusable, run firmware/serial_bridge.py on the laptop: the sketch always prints
  "SENSOR {...}" lines and accepts "TIER {...}" lines over USB serial.
*/
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal.h>
#include <time.h>
#include "secrets.h"

// ---------- pins ----------
const int PIN_R = 25, PIN_G = 26, PIN_B = 27;
const int PIN_BUZZ = 33;
const int PIN_WATER = 34;              // ADC1 only: ADC2 pins do not work while Wi-Fi is on
const bool COMMON_ANODE = false;       // set true if the LED's long leg goes to 3V3
LiquidCrystal lcd(22, 21, 19, 18, 17, 16);

// ---------- timing ----------
const unsigned long CYCLE_MS = 2500;   // sensor post + tier fetch
const int RATE_WINDOW_S = 20;          // rise is measured over this many seconds
const int HIST = 16;                   // ring buffer of recent readings

struct Sample { unsigned long ms; float level; };
Sample hist[HIST];
int histN = 0, histI = 0;

int tierCode = -1;                     // -1 = unknown / offline
String tierName = "----", tierLine = "starting...";
int satAgeD = -1;
unsigned long lastCycle = 0, lastTierOk = 0;
String serialBuf;

void setColor(int r, int g, int b) {
  if (COMMON_ANODE) { r = 255 - r; g = 255 - g; b = 255 - b; }
  analogWrite(PIN_R, r); analogWrite(PIN_G, g); analogWrite(PIN_B, b);
}

void showTier() {
  switch (tierCode) {
    case 0: setColor(0, 255, 0); break;      // GREEN
    case 1: setColor(255, 140, 0); break;    // YELLOW
    case 2: setColor(255, 35, 0); break;     // ORANGE
    case 3: setColor(255, 0, 0); break;      // RED
    default: setColor(0, 0, 255); break;     // blue = no data
  }
  char top[17];
  if (satAgeD >= 0) snprintf(top, sizeof(top), "%-7s sat %dd", tierName.c_str(), satAgeD);
  else snprintf(top, sizeof(top), "%-16s", tierName.c_str());
  lcd.setCursor(0, 0); lcd.print(top);
  for (int i = strlen(top); i < 16; i++) lcd.print(' ');
  lcd.setCursor(0, 1); lcd.print(tierLine.substring(0, 16));
  for (int i = tierLine.length(); i < 16; i++) lcd.print(' ');
}

bool applyTierJson(const String &body) {
  JsonDocument doc;
  if (deserializeJson(doc, body)) return false;
  if (doc["code"].isNull()) return false;
  tierCode = doc["code"].as<int>();
  tierName = doc["tier"] | "?";
  tierLine = doc["line"] | "";
  satAgeD = doc["sat_age_d"] | -1;
  lastTierOk = millis();
  showTier();
  return true;
}

float readLevel() {
  long sum = 0;
  for (int i = 0; i < 32; i++) { sum += analogRead(PIN_WATER); delay(2); }
  return sum / 32.0;                    // 0..4095, relative water level
}

// units per minute, from the oldest sample inside the window
float riseRate(float level) {
  unsigned long now = millis();
  float rate = 0;
  unsigned long bestAge = 0;
  for (int i = 0; i < histN; i++) {
    unsigned long age = now - hist[i].ms;
    if (age <= (unsigned long)RATE_WINDOW_S * 1000UL && age > bestAge && age >= 4000) {
      bestAge = age;
      rate = (level - hist[i].level) * 60000.0 / age;
    }
  }
  hist[histI] = { now, level };
  histI = (histI + 1) % HIST;
  if (histN < HIST) histN++;
  return rate;
}

bool httpsPut(const String &url, const String &body) {
  WiFiClientSecure client; client.setInsecure();   // prototype: no certificate pinning
  HTTPClient http; http.setTimeout(5000);
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(body);
  http.end();
  return code == 200;
}

bool httpsGet(const String &url, String &out) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http; http.setTimeout(6000);
  if (!http.begin(client, url)) return false;
  int code = http.GET();
  if (code == 200) out = http.getString();
  http.end();
  return code == 200;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lcd.setCursor(0, 1); lcd.print("WiFi connecting ");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
    setColor(0, 0, (millis() / 300) % 2 ? 255 : 0);
    delay(100);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi ok, IP "); Serial.println(WiFi.localIP());
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else {
    Serial.println("WiFi FAILED - serial bridge mode still works");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZ, OUTPUT); digitalWrite(PIN_BUZZ, LOW);
  pinMode(PIN_R, OUTPUT); pinMode(PIN_G, OUTPUT); pinMode(PIN_B, OUTPUT);
  analogReadResolution(12);
  lcd.begin(16, 2);
  lcd.print("TerraWatch");
  // self-test: red, green, blue, beep
  setColor(255, 0, 0); delay(300); setColor(0, 255, 0); delay(300); setColor(0, 0, 255); delay(300);
  digitalWrite(PIN_BUZZ, HIGH); delay(80); digitalWrite(PIN_BUZZ, LOW);
  connectWifi();
  showTier();
}

void loop() {
  // buzzer: short beeps while RED
  digitalWrite(PIN_BUZZ, (tierCode == 3 && (millis() % 600) < 150) ? HIGH : LOW);

  // serial bridge input: "TIER {json}"
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      if (serialBuf.startsWith("TIER ")) applyTierJson(serialBuf.substring(5));
      serialBuf = "";
    } else if (serialBuf.length() < 400) serialBuf += c;
  }

  if (millis() - lastCycle < CYCLE_MS) return;
  lastCycle = millis();

  float level = readLevel();
  float rate = riseRate(level);
  time_t now = time(nullptr);
  String body = "{\"level\":" + String(level, 0) + ",\"rate\":" + String(rate, 0) +
                ",\"ts\":" + String((unsigned long)now) + ",\"device\":\"esp32-01\"}";
  Serial.println("SENSOR " + body);

  if (WiFi.status() == WL_CONNECTED) {
    if (now > 1700000000) {                       // only post once NTP time is valid
      if (!httpsPut(String(FIREBASE_URL) + "/sensor/latest.json", body)) Serial.println("sensor PUT failed");
    } else Serial.println("waiting for NTP time");
    String out;
    if (httpsGet(String(SITE_URL) + "/api/tier", out)) {
      if (applyTierJson(out)) Serial.println("TIER " + out);
    } else Serial.println("tier GET failed");
  } else if (millis() % 20000 < CYCLE_MS) {
    WiFi.reconnect();
  }

  // no tier for 20 s -> show offline (blue)
  if (millis() - lastTierOk > 20000 && tierCode != -1) {
    tierCode = -1; tierName = "OFFLINE"; tierLine = "no tier data"; satAgeD = -1;
    showTier();
  }
}
