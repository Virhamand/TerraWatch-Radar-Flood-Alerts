# Demo script (3 minutes) and Q&A prep

## Before you start

- Site open on Tonle Sap, **Far from flood** pin, both simulate switches **off**. Tier reads GREEN.
- ESP32 powered and on the phone hotspot, LED green. Cup of water and the sensor within reach.
- Backup video open in another tab. A towel.
- If the ESP32 is not working: say so in one sentence and use the **Simulate sensor rise** switch.

## The walk-through

| Time | Do | Say |
|---|---|---|
| 0:00–0:20 | Show the whole screen. | "Flood maps from satellites are hard to read and often days old. TerraWatch turns radar from the NASA–ISRO NISAR satellite into an alert level a person can act on." |
| 0:20–0:50 | Drag the divider across the map, left then right. | "This is Tonle Sap in Cambodia. Left is NISAR on June 19, right is October 17. Smooth water reflects radar away, so it looks dark. Blue is land that turned dark between the two dates: 494 square kilometres. The permanent lake is excluded using a European surface-water baseline." |
| 0:50–1:15 | Point at the tier card. | "The pin is 30 km from mapped flooding. One signal is high: NISAR shows wet ground. One signal is not enough, so the level is green. Each line shows its source and its age. The satellite image is about a month old, and the app says so." |
| 1:15–1:35 | Flip **Simulate storm**. | "Now a heavy rain forecast arrives. Wet ground plus heavy rain is a flood watch: yellow. The light on the board follows, because the ESP32 reads the same alert from the live site." |
| 1:35–2:05 | Pour water so the sensor level rises. (Fallback: flip **Simulate sensor rise**.) | "This sensor is a stand-in for a river gauge. As the water rises, a third independent signal agrees, and three signals mean red: flood imminent. The buzzer only sounds on red." |
| 2:05–2:25 | Click **Inside flood**, then **Near flood**. | "If you are inside a mapped flood it is red on the satellite alone. Ten kilometres away it is an orange warning." |
| 2:25–2:45 | Click **Niger Delta**, then **Paraguay**. Click somewhere far away, such as Europe. | "Same method in Mali and at a NASA EONET flood event in Paraguay. Anywhere else, the app is honest: no NISAR analysis here yet, NISAR last passed on this date, and the alert uses forecast and sensor only." |
| 2:45–3:00 | Open the **Briefing** tab, switch audience once. Open **Credits**. | "An AI writes the explanation for different readers, but only from the computed facts, and it never decides the alert. Every NASA granule and data source is named here." |

## Likely questions

**How do you know the flood map is right?**
It has not been validated on the ground, and the app says so. Three things support it: the threshold
is chosen automatically from the data, not tuned by hand; the pipeline recovered a known flooded area
to within 1 % on synthetic scenes built in the real NISAR file layout; and the map can be compared
with an independent NASA optical layer. Two other events I processed showed almost no flooding, and
I dropped them instead of showing weak results.

**Why Otsu's method?**
The change image has two populations, land that stayed the same and land that went dark. Otsu picks
the threshold that best separates two populations by maximising between-class variance. The code
rejects the result and falls back to a fixed −3 dB if it lands outside −8 to −1.5 dB, which is what
happened on the two dropped regions.

**Why L-band? What does NISAR add over Sentinel-1?**
L-band has a longer wavelength (about 24 cm against 5.6 cm for C-band), so it penetrates vegetation.
That lets it see water under a forest canopy as a brightening, the double-bounce effect, which the
app flags in yellow.

**The satellite image is a month old. How is that an alert?**
On its own it is not, and that is the design point. NISAR gives the slow picture every 12 days. The
forecast and the ground sensor fill the gap between passes, and no single signal can raise the alert
above green.

**What exactly does the ESP32 do?**
Two jobs. It fetches the alert level from the deployed site every 2.5 seconds and drives the light,
screen and buzzer. And it measures water level, computes how fast it is rising, and posts that to a
database; the site reads it as one of the five signals. Unplug the sensor and the site shows
"sensor offline" within 30 seconds.

**Is the wetness signal real soil moisture?**
No. It is a proxy: how bright unflooded land is in HV compared with the rest of the scene. NISAR has
a dedicated soil-moisture product that would be the right replacement.

**Could the AI invent a number?**
The prompt forbids anything outside the supplied facts, and the script checks every number in each
briefing against those facts and regenerates or flags failures. Briefings are generated ahead of
time and I read each one.

**Why are two regions seasonal floods and not disasters?**
I needed image pairs that certainly contained flooding to prove the method in two days. They are
labelled as seasonal in the app. Paraguay is the event-driven example, tied to a NASA EONET listing.

**How would this scale to the whole world?**
Not on a laptop. Each region needs two multi-gigabyte files. Scaling means processing each NISAR
pass in the cloud as it arrives, and adding other satellites to shorten the revisit gap.

**What would you do with another week?**
Validate against an official flood extent, automate processing after each pass, replace the wetness
proxy with NISAR's soil-moisture product, and add Sentinel-1.

## Facts to have ready

- Tonle Sap: 494.3 km² flooded of 5,432 km² analysed; threshold −5.3 dB; 19 Jun → 17 Oct 2026.
- Niger Delta: 748.1 km²; threshold −3.7 dB; 24 Jun → 10 Oct 2026.
- Paraguay: 53.4 km²; threshold −4.6 dB; 18 Jun → 30 Jun 2026; EONET_20898.
- NISAR GCOV: 20 m posting, averaged to 40 m; HH for change detection, HV for wetness.
- Alert polygons are flooded patches of at least 1 km²; smaller patches show on the map only.
- 19 unit tests cover the tier rules.
