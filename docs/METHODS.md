# How Chernozem measures

This page explains every number the app shows: where it comes from, how it is worked out, how often it changes, and what it cannot see. It is written for farmers, partners and investors. Every rule named here lives in code with tests (see [Where the rules live](#where-the-rules-live)), so this page and the app describe the same thing.

**Ground rules**

- **Only measured numbers.** Every value on a page comes from a Google Earth Engine computation on public satellite data, from a weather service (Open-Meteo), or from what the user typed. Nothing is filled in by hand.
- **Sample data is labelled.** Until Earth Engine is connected, the app runs on a built-in sample source so it can be tried. Those pages carry a **Sample data** badge, and the AI says so too. Sample numbers are made up and are never shown as satellite measurements.
- **Honest words.** A satellite cannot name a pest, find a mine or prove that land is safe. Where that is the truth the app says "likely", "risk" or "check on the ground". Only certified deminers can declare land safe.
- **Works anywhere on Earth.** Seasons follow the place (see [Seasons](#seasons-by-place)), and war rules apply only where a known war covers the land (see [Wars](#wars-by-area)). Ukraine is the research case study, not a limit.

**Contents**

- [Shared foundations](#shared-foundations): normal years, clouds, seasons, wars
- [Field: a farmer's own fields](#field-a-farmers-own-fields), with [three example farms](#example-farms)
- [Atlas: a region or a country](#atlas-a-region-or-a-country)
- [Datasets](#datasets)
- [Where the rules live](#where-the-rules-live)

---

## Shared foundations

### The normal years: 2019 to 2021

Every reading is compared with the **same weeks of 2019, 2020 and 2021**. Three years instead of one keep a single wet or dry year from setting the bar. All three are before the wars the app knows about, so "normal" is never a war year. A "normal range" is the lowest and the highest of the three yearly values.

### Clouds

Optical images (Sentinel-2) are cleaned pixel by pixel with Google's **Cloud Score+** (a pixel counts as clear at a score of 0.6 or more). Snow is removed too. A satellite pass counts for a field only when **at least half of the field** was clear. Radar (Sentinel-1) sees through cloud and is used where optical images cannot be.

### Seasons by place

Crops grow at different times in different places, so no date window is fixed in the code. Each place gets its growing season from its own record: the month in which it is **greenest in 2019 to 2021** (MODIS NDVI, 1 km). The season is the 3 months before that peak, the peak month and the 2 months after it. Where that is not clear, the latitude decides:

| Where | Season |
| --- | --- |
| North (23.5° N and above) | April to September |
| South (23.5° S and below) | October to March, across the new year |
| Tropics (in between) | the last 12 months (crops can grow all year) |

### Wars by area

The app knows three wars (`src/config/conflicts.js`): the full-scale invasion of Ukraine (from 24 February 2022), the war in Sudan (from 15 April 2023) and the Gaza war (from 7 October 2023, the Gaza Strip only, not the West Bank). A war is matched by country, and where needed by a box inside the country.

- **Inside a known war**, damage is counted from the day the war started, the Data charts mark that day, and the AI and reports talk about demining. Damage found once stays counted: fire is read from the war's worst year and radar from the change that lasts over the complete war seasons (see [Damage over time](#damage-over-time)).
- **Everywhere else**, damage means unusual fire or ground change **from any cause** over the last two years, compared with the normal years. The app does not mention war or demining there, and stricter evidence is needed (see the damage rules below).

Fighting that spills over a border, or a war not on the list, counts as peace. That never means the land is safe.

---

## Field: a farmer's own fields

A farmer types a place, pastes coordinates or draws on the map. The app finds the fields, the farmer picks theirs, and every field is analysed from satellite data. The Fields page shows four tiles per field (Water, Plant health, Stress, Harvest readiness), one map layer (Field condition) and a status.

### At a glance

| Number | Source and resolution | How it is worked out | Updates |
| --- | --- | --- | --- |
| Field outlines | Sentinel-2, 10 m; ESA WorldCover, 10 m | Edges traced in two seasons of images; cropland in between becomes fields | When the farmer asks |
| Plant health (NDVI) | Sentinel-2 B8, B4, 10 m | (B8 − B4) / (B8 + B4), median of clear pixels, last 30 days | Daily check; a new pass every 2 to 5 days |
| Water (NDWI) | Sentinel-2 B8, B11, 20 m | (B8 − B11) / (B8 + B11), same window | Same |
| Stress | Sentinel-2 NDVI 10 m and red edge (NDRE) 20 m | Weaker than the rest of the field AND weaker than normal | Same |
| Likely cause | Sentinel-2 NDWI | Water anomaly over the stressed pixels | Same |
| Pest and disease risk | Open-Meteo hourly temperature and humidity | Wet hours and heat units over 14 days | Hourly cache |
| Harvest readiness | Sentinel-2 curve, Open-Meteo temperatures, Sentinel-1 VH radar | Dry-down, heat units, radar harvest | Daily check |
| Crop type | Sentinel-2 curve (18 months) and red edge, Sentinel-1 VH | Timing of green-up, peak and dry-down; red-edge gap; radar | Each analysis |
| Field condition | All of the above | 0.5 plant health + 0.3 water + 0.2 no stress | Daily check |
| Damage | Sentinel-1 VV, 10 m; FIRMS fire, 1 km | Radar change lasting over two complete war seasons, unusual fire in the worst war year | Daily check |
| Black soil | OpenLandMap USDA soil classes, 250 m | Share of the field on Mollisols | Each analysis |
| Weather | Open-Meteo | Forecast and the last days | Hourly cache |
| History | Sentinel-2, 10 m | Monthly field means since January 2019 | Every 30 days |

"Daily check": with **Update automatically** on, the server checks every 6 hours and re-analyses a field whose analysis is more than 24 hours old. Sentinel-2 passes over a place every 2 to 5 days (clouds permitting), so a new number needs a new clear pass.

### Finding the fields

1. **Cropland** = ESA WorldCover 2021 class 40 (10 m).
2. **Six image composites**: NDVI and NDWI medians for the early, middle and late thirds of the last two growing seasons.
3. **Edges**: a Canny edge detector on every composite. Roads, tree lines and the line between two crops show up as an edge in at least one window.
4. **Fields** = connected cropland between the edges (10 m), from 1.5 ha up, simplified to 10 m and cut to the farmer's boundary. Touching pieces whose NDVI and NDWI stay within 0.05 in every window are joined, because the same crop on both sides means one field. The 60 largest are offered.
5. When a pin lands in a town or a forest, the nearest farmland within 8 km is searched instead, and the app says so.

6. **Pieces of one big field** are joined too when their season NDVI curves match (correlated 0.95 or more, peaks at most 10 days apart) and the line between them is not a real edge (not straight, not a road or trees).

*Checked on real data:* the demo farm near Kupiansk, Ukraine, against 7 hand-drawn outlines (measured 2026-10-19): mean overlap (IoU) **0.805**. Six fields match well (0.83 to 0.96); one (Field 5) scores only 0.14: no detected outline matches it, so the farmer has to draw it. The same score with and without the join of touching pieces by their season curves (that join leaves the demo farm's fields apart).
*Known limit: very large fields come out in pieces.* In Mato Grosso, Brazil (soy near Sorriso, 2026-10-19), where real fields are hundreds of hectares, the edge detector cuts one field along wet hollows and soil changes. Joining the pieces by their season curves (step 6) halved the count (16 to 8 fields; median 16 to 49 ha, mean 49 to 97 ha), but the fields are still smaller than the real ones. On such farms, draw the fields or remove the extra pieces in Settings.
*Cannot see:* a boundary with no visible difference on the ground (the same crop, sown on the same day, on both sides of a property line). The farmer can draw or remove fields.

### Plant health (NDVI)

**Formula:** NDVI = (B8 − B4) / (B8 + B4), the standard vegetation index (near-infrared against red). Bare soil is about 0.2, a dense green crop 0.8 to 0.9.
**Window:** median of clear pixels over the last 30 days, or the 30 days up to the latest clear pass when that is 30 to 90 days old.
**Normal:** the same calendar window (±15 days) in 2019, 2020 and 2021. The tile shows the reading, "Below", "Normal" or "Above" the normal range (a margin of 0.02 stops a hair's difference from flipping the word), and the range. When the range is wider than 0.4 the tile says **"Usual range varies (crop rotation)"** instead of the numbers: those fields grew crops sown in different seasons in 2019 to 2021 (near Chivilcoy, Argentina: winter wheat one year, summer soybean the next), so the "usual" spans bare soil to full canopy (for example 0.19 to 0.89) and tells a reader nothing. The word ("Below", "Normal", "Above") still uses the full range.
**Score (for the condition):** 1 at or above normal, falling to 0 at 0.3 below normal.
**Cannot see:** the crop's yield or quality; why a field is lower (see Stress).

### Water (NDWI)

**Formula:** NDWI = (B8 − B11) / (B8 + B11), near-infrared against short-wave infrared (Gao's water index, also called NDMI). It tracks the water held in leaves.
**Normal, words and range:** as for plant health.
**Score:** 1 at or above normal, falling to 0 at 0.25 below normal.
**Cannot see:** soil moisture under the surface, or water in a field with no crop.

### Stress

A pixel is **stressed** when either rule holds:

| Rule | Weaker than the rest of the field | AND weaker than normal |
| --- | --- | --- |
| NDVI (10 m) | NDVI < field median − 0.10 | NDVI < normal − 0.08 |
| Red edge (20 m) | NDRE < field median − 0.06 | NDRE < normal − 0.05 |

NDRE = (B8A − B5) / (B8A + B5). The red edge reacts to chlorophyll loss **one to two weeks before NDVI does**, so it gives an early warning; the analysis records when the red-edge rule found stress (over at least 1 % of the field) that the NDVI rule missed.
Both halves of each rule are needed: "weaker than the field" alone flags natural soil patterns, "weaker than normal" alone flags a whole field that was simply sown late.

- **Stressed share** = the share of the field's pixels that are stressed. Level: high from 15 %, medium from 5 %, else low. The tile shows hectares when a patch is mapped and the share of the field otherwise, the same on every field.
- **Patches** = stressed blobs of 0.3 ha or more (the 3 largest per field), drawn as dashed circles on the map.
- **Likely cause**, for **medium or high** stress only: the mean NDWI anomaly (NDWI minus normal) over the stressed pixels. At −0.05 or lower: **"Dry patch"**. Otherwise: **"Not water: check for pests or disease"**. Low stress names no cause: a few weak pixels say nothing about water or pests (real data, near Chivilcoy, 2026-10-19: "Low · 1% · Dry patch" next to "Wetter than usual"). When stress is medium or high but no patch of 0.3 ha or more was mapped, weak plants are scattered over the field and the tile says **"Spread across the field"** instead of naming a cause for a place nobody could find.
- **No crop, no stress**: when the field is harvested or not sown (or reads as fallow or grass), the tile says **"No crop"**, and the field has no condition score (it is not "Poor").
- **Dried down, no stress**: once a crop is ready (dried down, standing dry or with its leaves down), or a field of unknown crop has dried down to the ready level, the tile says **"Dried down"** and stress is not read: leaves die back unevenly as a crop dries, and both rules would read that as stress. (Real data, Iowa, 2026-10-19: a dried-down field read "Stress high · Dry patch" while its water was normal and its condition "Very good".)

**Cannot see:** which pest or disease it is. A satellite sees that plants are weaker and whether water explains it, nothing more. Hail, herbicide drift, nutrient shortage and waterlogging can all look like "not water". The app says "check on the ground".

### Pest and disease risk (a forecast, not a detection)

Only while a crop is growing or ripening (not once it has dried down, and not on a field read as fallow or grass, or possibly so). From Open-Meteo hourly air temperature and relative humidity over **14 days: the last 7 and the next 7**.

| Risk | Rule | Low | Medium | High |
| --- | --- | --- | --- | --- |
| Fungal disease | Hours with humidity ≥ 90 % and 10 to 25 °C | under 8 | 8 to 23 | 24 or more |
| Insect activity | Growing degree-days, base 10 °C (daily mean − 10, never below 0) | under 30 | 30 to 69 | 70 or more |

Long leaf wetness at mild temperatures is the classic condition for fungal infection; warmth drives insect development. The Stress tile shows one line ("Disease risk high this week").
**Cannot see:** whether the pest or disease is actually present. This is weather risk for the area, the same for every field nearby.

### Harvest readiness

Three independent sources, combined:

**1. Dry-down (Sentinel-2).** The season's NDVI curve, one reading per clear pass, with cloud-shadow outliers removed (a pass more than 0.15 below both neighbours).
- *Not sown*: the season never got greener than 0.35.
- *Harvested*: after the peak, a fall of more than 0.15 within 20 days to below 0.3, or two passes in a row below 0.3.
- *Ready*: NDVI back down to the crop's ready level = 0.2 + share × (peak − 0.2), with a share of 0.25 for cereals and rapeseed and 0.35 for row crops. A field low for more than 30 days was harvested (or abandoned), not "ready".
- *Long after the peak*: a field whose peak is more than 60 days back and that sits below 0.6 × its peak with no new season growing is not "growing" any more, even if it never got quite down to the ready level: it is ready (if it got that low within the last 30 days) or harvested/left since it got that low. (Real data, the demo farm: fields that peaked in late June and sat flat at NDVI 0.30 to 0.37 from mid September read "Healthy, growing" with a pest risk.)
- *Ripening*: drying down. Days to ready = (current − ready level) ÷ the fall per day over the last 30 days. A fall so slow it would take more than 45 days is not a dry-down: the field stays "growing".

**2. Heat units (Open-Meteo).** A crop ripens after a fairly fixed amount of warmth. Green-up = the first day the curve passes base + 0.25 × (peak − base). From green-up to today the daily growing degree-days are added up from Open-Meteo daily maximum and minimum temperatures (the ERA5 archive, `archive-api.open-meteo.com`, for days up to 6 days ago; the forecast API for the last 6 days and the forecast):

GDD per day = (max + min) / 2 − base, never below 0. For corn, soybean and sunflower, max and min are first held between the base and 30 °C (the standard "86/50" method).

| Crop | Base | Heat units to maturity | Counted from | Ready share |
| --- | --- | --- | --- | --- |
| Winter cereal | 0 °C | ~1,400 | spring regrowth | 0.25 |
| Spring cereal | 0 °C | ~1,500 | emergence | 0.25 |
| Rapeseed | 5 °C | ~1,300 | spring regrowth | 0.25 |
| Sunflower | 6 °C | ~1,500 | emergence | 0.35 |
| Corn | 10 °C | ~1,450 | emergence | 0.35 |
| Soybean | 10 °C | ~1,300 | emergence | 0.35 |

Sources: Iowa State and Purdue corn guides, University of Nebraska and NDSU (soybean, sunflower, spring cereals), AHDB (wheat, oilseed rape), Canola Council of Canada. Real totals vary with the variety by about ±15 %.
Days to ready = heat units still needed ÷ the mean daily heat units of the last 14 days and the forecast. Used only when temperatures cover at least 90 % of the days, and only when the date fits the crop's usual months after its peak.

**3. Radar through cloud (Sentinel-1 VH).** For tall crops (corn, soybean, sunflower): the field's mean VH backscatter on every pass after the NDVI peak. A **harvest** is a drop of 3 dB or more between two passes at most 24 days apart (one missed acquisition allowed: Iowa passes are 12 days apart) that does not come back (the next pass stays at least 2 dB below; frost or a wet day comes back, a combine does not).

**Soybean leaf drop.** Soybeans drop their leaves when they mature, a week or more before the combine comes, and the canopy falling looks like a cut on radar (real data, Ames, Iowa, 2026: 20 of 23 soybean fields fell 4 to 8 dB between 27 September and 9 October while USDA had only 31 % of Iowa's soybeans harvested on 11 October). For a soybean the leaves are taken as down 7 days after the first clear pass at the ready level, and a radar drop counts as the cut only when the pass before it is on or after that day. With no such drop the field reads **"Ready · Leaves down · check if cut"** for up to 30 days after the leaves came down, then is taken as harvested.

**How they combine** (shown as the basis: "dry-down", "heat units", "both", "radar" or "satellite images"):
- Radar marks a field harvested when optical images agree, or when they are cloudy (no clear pass for 15 days).
- Harvested seen only in the optical record (the fall to bare soil): basis "satellite images".
- A tall crop that looks bare to NDVI but shows **no radar harvest** is still standing: **ready**, not harvested.
- Drying down: the dry-down days ("both" when the heat units agree within 10 days).
- Still green: the heat-unit estimate.
- **Harvest window**: 10 days from ready. "Harvest before the rain" when Open-Meteo shows a rainy day (chance ≥ 50 % and ≥ 1 mm) inside it.
- **Crop not known** (none picked, none detected for this season, or a detection whose dry-down did not fit its harvest months): no date and no window are given, because a date for a crop the app cannot name would be a guess. The tile says only what was measured: "Growing", **"Past peak"** (falling, not at the ready level yet) or **"Dried down"** (at the ready level), with "Crop unknown: pick it in Settings for a harvest estimate". "Harvested" and "Not sown" are measurements and stay. (Real data, 2026-10-19: a field of unknown crop near Kupiansk, probably grass, read "ready about Oct 22".)

**Cannot see:** grain moisture, lodging or the farmer's plans. The estimate is a guide for when to go and look.

### Crop type

If the farmer has not picked a crop, the app detects it from the field's own record ("Corn · detected"). It is a rule-based **phenology classifier**, a standard remote-sensing approach: each crop greens up, peaks and dries down at its own time of year, and gives its own radar return. The windows below were **calibrated on real fields** against the USDA Cropland Data Layer (see the validation).

| Crop | Pattern (northern days; moved by 6 months in the south) |
| --- | --- |
| Winter cereal | green over winter, peak early May to mid June, dried down mid June to mid July, low radar VH (−23 to −16 dB) |
| Winter rapeseed | green over winter, peak April to early June, yellow flowers before the peak (not in the US calibration: from the literature, never "likely") |
| Spring canola | bare over winter, green-up late May to mid June, peak mid June to late July, the highest radar VH (−14.6 to −9 dB) |
| Spring cereal | bare over winter, green-up early May to early June, peak early June to early July, dried down late June to July, low VH (−21 to −15.8 dB) |
| Sunflower | green-up late June to early July, peak late July to early August, dried down mid September to early October, VH −15 to −12.9 dB |
| Corn | green-up late May to June, peak early July to mid August, dried down September to mid October, VH −16.8 to −15.3 dB |
| Soybean | green-up June to early July, peak late July to late August, dried down mid to late September, VH −15.3 to −13.2 dB |

On real data **soybean gives a stronger radar return than corn** near its peak (Iowa 2025: soybean −15.6 to −13.2 dB, corn −16.6 to −14.5 dB), and canola the strongest of all; the textbook "corn has the highest VH" did not hold.

Inputs: monthly NDVI of the last 18 months, this season's passes (NDVI, NDYI) and the field-mean Sentinel-1 VH within 30 days of the NDVI peak (never the winter maximum: frozen ground reads brighter than any crop). Each feature scores 1 inside its window and fades to 0 ten days (0.6 dB) outside; the crop with the best weighted score is named when it reaches 0.65. "Yellow flowers" means NDYI = (B3 − B2) / (B3 + B2) at least 0.08 above what the field's own NDVI predicts (a robust line through its green passes) on two or more passes around the peak; NDYI rising with any green canopy is not flowering, and haze that lifts NDYI on many passes is ignored.

**This season or last season.** The crop is read from this season's passes once the season has peaked. Before that it is read from the last complete season in the monthly record and shown as **"Last season: Soybean"**: it is never written as the field's crop and never drives this season's harvest rules, because fields are rotated.
One exception: a **winter cereal growing now**. A field green through the winter (in the south: sown in June or July) that is at or near its highest NDVI in the cereal's peak months (north: March to May; south: September to November) and not harvested yet is read as **winter cereal, "possible"**, for this season, so the heat-unit harvest estimate runs. (Real data, near Chivilcoy, Argentina, 2026-10-19: wheat-like fields green from June, NDVI 0.78 to 0.94 on 2 October, were read as last summer's soybean before this rule.) Dates alone cannot tell wheat from barley, oats or a winter pasture, so it is never "likely".

**Red-edge gap.** Radar VH peaks shift by a decibel or more from one region to the next (North Dakota corn −15.1 dB against Iowa corn −16.2 dB, median), so VH alone could not tell corn from soybean or sunflower outside the calibration area. The classifier also reads the **red-edge gap**: the mean of NDVI − NDRE over this season's clear passes within 20 days of the NDVI peak (at least 2 passes), a property of the canopy. Calibration windows (10th to 90th percentile): **corn 0.111 to 0.155** (128 fields), **soybean 0.161 to 0.195** (71), **sunflower 0.193 to 0.267** (10); spring cereal 0.154 to 0.21, winter cereal 0.152 to 0.243, spring canola 0.178 to 0.26.

**Grass or hay.** A field cut and grown back two or more times in one season (a fall of 0.25 or more from NDVI 0.6 or higher within 21 days, then regrowth back to 0.6 within 45 days) is grass or hay, not a field crop the rules know (real alfalfa near Ames, cut three times in 2026, was read "winter cereal" before this rule). A cereal followed by a second crop is one cut, not two.

**Fallow or grass.** When no crop rule fits, a field that greens up in spring, peaks before early July (northern day 185), fades for 50 days or more without ever going back to bare soil (NDVI never under 0.25 after green-up) and has a red-edge gap above **0.27** (wider than any crop's window) reads **"Fallow or grass"**: mixed grasses and weeds, not a sown crop. It has no harvest, no crop stress, no pest risk and no condition, and its slow fade to dry grass is never called a harvest; a radar drop on it is a mowing or a cut for hay and reads **"Cut or mown"**, not "Harvested". It is the pattern of the Ukraine example farm near Kupiansk (peaks of 0.66 to 0.89 in late June, the same in 2025), a few kilometres from the front: 5 of its 7 fields read "Fallow or grass" and the other 2 "possibly" so. Fallow or abandoned cropland gone to grass. Checked against the CDL (below): not one of 528 crop fields is called fallow or grass, but neither is any of 60 CDL grassland, hay or summer-fallow fields in the Dakotas and Montana (prairie grass there has a narrower red-edge gap, and US "fallow" is bare tilled land, which this rule does not describe). Because the rule rests on one region it is only ever **"possible"**. A field that fades the same way but fails one test stays "Unknown", and the reason says what was seen ("Green from early May, greenest in late June, a slow fade over 110 days: not the pattern of a known crop; possibly fallow or grass"). Such a field shows **"Unknown · possibly grass"** and the status **"Crop unclear"** (counted "To watch", never "Growing well") until the farmer sets its crop. It is not sure enough to be read as fallow, so a radar drop on it stays "Harvested", with the note "Possibly grass: may be a hay cut".

**A double crop.** When a crop was harvested and another has grown since (a southern double crop: last summer's soybean, then wheat), the crop read is the one harvested, so it is **last season's** and never drives this season's harvest rules.

**Validation against the USDA Cropland Data Layer** (`USDA/NASS/CDL` 2025, 30 m, band `cropland`), run on 2025-10-19 conditions with this app's own Earth Engine provider (the 2025 season, the same code path as a live analysis; script and logs: the build scratchpad `cdl/` and `val/cdl/`). Each field's truth is its CDL majority class (fields with a majority under 60 % left out). The rules were calibrated on **176 fields near Ames, Iowa** (detected outlines: 113 corn, 61 soybean and 2 hay, so 174 of the six crops) and **95 sample fields in central South Dakota, north-west Minnesota and north Montana** (homogeneous 240 m squares sampled per CDL class), then frozen and measured on **248 held-out North Dakota fields** (detected outlines and 240 m squares in four areas: north-east, centre, south-east and south-centre; 245 of the six crops, plus 2 grass fields and 1 other crop).

Accuracy = the share of a crop's fields that were named as that crop; the totals count only fields of the six crops (hay, grass and other crops are left out). "Likely right" = of the fields named that crop with confidence "likely", how many were right.

| Crop | Iowa (calibration) | SD, MN, MT (calibration) | North Dakota (held out) | "Likely" right in ND | Highest confidence |
| --- | --- | --- | --- | --- | --- |
| Corn | 96 %, 113 fields | 67 %, 15 | **76 %**, 55 | 17 of 17 | likely |
| Soybean | 90 %, 61 | 70 %, 10 | **80 %**, 76 | 41 of 46 | likely |
| Sunflower | – | 90 %, 10 | **84 %**, 25 | 14 of 14 | likely |
| Spring cereal (wheat, barley) | – | 93 %, 30 | **58 %**, 52 | – | possible |
| Winter cereal | – | 60 %, 15 | **33 %**, 15 | – | possible |
| Rapeseed (canola) | – | 100 %, 15 | **77 %**, 22 | 59 % when allowed | possible |
| All six crops | **94 %**, 174 | **82 %**, 95 | **72 %**, 245 | | |

A crop may be called **"likely"** only when it reached 70 % on the held-out fields and its "likely" calls there were right at least 80 % of the time: **corn, soybean and sunflower**. The cereals stay **"possible"** (under 70 %), and so does canola: its accuracy is 77 %, but its "likely" calls were right only 59 % of the time (spring wheat read as canola, 20 of 52). See `CROP_CONFIDENCE_CAP` in `src/lib/field/crops.js`. The main confusions in North Dakota: spring cereals read as canola, winter wheat read as spring cereal (9 of 15), corn read as soybean (10 of 55). In the tropics no crop is ever more than "possible". Grassland and hay are often read as a cereal or canola ("possible": 31 of 60 CDL grassland, hay and summer-fallow fields in the Dakotas and Montana), so a "possible" cereal on land that is really pasture is a known error.

A crop whose dry-down ends outside its usual harvest months after the peak (for example a "spring cereal" still ripening four months after its peak) is treated as misread: its crop-specific harvest rules are dropped and the detection is marked uncertain.

**Cannot see:** the variety, a mixed or double crop, or a crop whose timing is unusual for the place. The farmer's own choice always replaces the detected crop.

### Field condition (the map layer) and status

**Condition** = 0.5 × plant health score + 0.3 × water score + 0.2 × (1 − stressed share), from 0 to 1. Missing parts are left out and the rest re-weighted. Classes: Poor under 0.40, Fair under 0.65, Good under 0.85, Very good above. Because health and water are compared with the normal for the **same weeks**, a crop drying down on time for harvest still scores well. A damaged field is never shown better than Fair, and a field with **high stress** (15 % or more) never better than Good (0.84).
**No crop, no condition.** A field that is harvested, not sown, fallow or grass, or "dried down" (a crop the app cannot name, dried to the ready level) has no condition score and no class: it is never "Poor", and never "Growing well" or "Very good" either. The map keeps its straw style.

**Status**, most urgent first: Needs recovery (damage) → Fallow or grass → Ready to harvest → Harvest soon (ready within 14 days) → Harvested / Not sown / Dried down → Crop unclear (an unknown crop on a field that is possibly fallow or grass) → Watch (condition below Fair, stress medium or high, or plant health below normal) → Growing well. "No clear image yet" when there is no clear pass.

| Overview group | Statuses |
| --- | --- |
| In crop | Growing well, Harvest soon, Ready to harvest |
| To watch | Watch, Crop unclear, No clear image yet |
| Needs recovery | Needs recovery (the tile is hidden when no field needs it and no war covers the farm) |
| No crop | Harvested, Not sown, Fallow or grass, Dried down |

The overview's stat row shows these four groups, the farm area and the weather, and the status sentence names the statuses inside them (for example "1 to watch · 15 ready to harvest · 1 growing well · 1 dried down" next to "In crop 16"), so "growing well" is only said of a field whose status is Growing well. A field with high stress is counted "to watch" even when its status is a harvest one.

### Damage

| Evidence | Source | Rule |
| --- | --- | --- |
| Radar change | Sentinel-1 VV, 10 m, one orbit direction | Per pixel and **per complete war growing season** (one per year): the season's median minus the same months of 2019 to 2021 (all their passes together, as in the Atlas), minus the field's own overall change that season. A pixel counts when it changed by 3 dB or more in **at least two** war seasons (with one season so far, that one). Crop rotation and soil moisture shift a whole field; craters, trenches and burnt patches change parts of it, and they last. |
| Unusual fire | NASA FIRMS (band T21), 1 km | The **worst war year**: per war year (from the war's start, 12 months each; the year not over yet up to today), fire days minus a normal year's (the 2019 to 2021 count ÷ 3), never below 0; the largest. Stubble burning that happens every year cancels out. |
| Health index | Sentinel-2 (see the Atlas) | Support only, never enough on its own. |

- **Inside a known war:** damaged when radar changed over 10 % of the field; or 3 or more unusual fires backed by radar change over 5 % (or a health-index drop of 0.1); or a health-index drop backed by radar change over 5 %.
- **At peace:** damaged only when 3 or more unusual fires AND radar change over 5 % are both found. Ploughing or a new crop alone can change radar over part of a field.
- **Damaged area** = the radar-changed share × the field's area. When only fire shows it, the area is left blank rather than guessed.
- The years, seasons and the two-season rule are the Atlas's (see [Damage over time](#damage-over-time)), so a field's damage does not fade as the war goes on. Two differences remain: a field's radar change is taken against the field's own overall change (the Atlas uses the whole square, without that), and every field of a farm uses the farm centre's season. The AI names the worst year ("8 fire detections above the 2019 to 2021 rate in the worst year since 2022-02-24").
- **Recovery cost** ranges are planning assumptions, not measurements (see [Recovery cost](#recovery-cost)).

**Cannot see:** mines or unexploded ordnance. A field with no damage found is **not** a safe field.

### Black soil

The share of the field on black soil, from OpenLandMap's USDA great-group map (250 m): the Mollisols ("…olls") except the cold (Cryolls) and bleached (Albolls) ones. At 0.5 or more the field is shown as chernozem. This is broader than the research's WRB Chernozem definition (it also counts Phaeozems and Kastanozems).
**Cannot see:** the soil on this particular farm at a finer scale than 250 m, or its current organic matter.

### Weather, history and downloads

- **Weather**: Open-Meteo (free, no key) at the farm's centre: now, 10 days of forecast, the next rainy spell. Kept for an hour.
- **History** (Data page): monthly field means of clear NDVI and NDWI since January 2019, refreshed every 30 days.
- **Downloads**: field outlines (GeoJSON), every reading (CSV), the history (CSV) and, with Earth Engine, a GeoTIFF of the latest NDVI, NDWI and condition clipped to the field.

### Example farms

The farm setup offers three example farms ("Try an example: Ukraine · Iowa · Argentina"). Each is a set of **real field outlines**; the fields are named Field 1 to Field N from north-west to south-east (as on every farm) and carry **no crop**: the first analysis detects each crop from the field's own record and runs on real data when Earth Engine is connected, like any farm.

| Example | Where | Fields | Outlines from |
| --- | --- | --- | --- |
| Ukraine (the default) | Near Kupiansk, Ukraine | 7 | Drawn by hand by the team (`scripts/fields.geojson`) |
| Iowa | Near Ames, Iowa, USA | 17 | This app's field detection on Earth Engine (`server/field/examples/iowa.geojson`) |
| Argentina | Near Chivilcoy, Argentina | 18 | The same (`server/field/examples/argentina.geojson`) |

---

## Atlas: a region or a country

The Atlas is for offices and funders who decide where restoration money goes first. It follows the owner's research paper (Chernozem Recovery Atlas, 2026; data and code on Harvard Dataverse, [doi:10.7910/DVN/IYXPVS](https://doi.org/10.7910/DVN/IYXPVS)).

An area (a drawn shape, a region, a country) is cut into a grid of squares: as small as possible while staying under 1,500 squares (0.25°, about 18 × 28 km, for all of Ukraine; a few hundred metres or less for a farm-sized area). Each square is measured for one month. Each reading becomes a 0-to-1 indicator on a **fixed scale**, so a score means the same thing in every month and every place. The indicators make three scores, and the scores make the priority.

### At a glance

| Number | Source and resolution | How it is worked out | Updates |
| --- | --- | --- | --- |
| Soil value | OpenLandMap USDA soil classes, 250 m; ESA WorldCover, 10 m | Mean of black-soil share and cropland share | Monthly |
| Damage | FIRMS fire, 1 km; Sentinel-1 VV radar, 10 m | In a war: mean of unusual fire (worst war year) and lasting radar change (two war seasons). At peace: heavily damaged share of the black soil, full at 20 % | Monthly |
| Heavily damaged hectares | Same | Black-soil cropland pixels with strong lasting radar change (or clear change with fire) | Monthly |
| Soil health index (CHI) | Sentinel-2, 10 to 20 m | Five-index blend, this season vs normal | Monthly, diagnostic only |
| Safe access | ACLED battles, or FIRMS unusual fire | Distance to fighting, full at 100 km. At peace without ACLED: full everywhere | Monthly |
| Priority, rank, tier | The three scores | Near term and Postwar formulas | Instantly when weights change |
| People, night lights | WorldPop 100 m (2020); VIIRS 500 m | Sum and median | Monthly, context only |
| Alerts | Sentinel-1 VV; FIRMS | This month vs the same month of 2019 to 2021 (radar alerts only in ranked squares) | Monthly |

**Monthly**: with "Analyze automatically each month" on, the server analyses each month once it is over (it checks every 6 hours). The damage radar uses the **complete** war growing seasons, and a new year's season joins for the whole area in one month (when the last part of the area has finished that season: in Ukraine October), so it changes once a year; fire evidence can only grow at war (the year not over yet gains fires, or a new worst year). See [Damage over time](#damage-over-time). The monthly run adds the new month only: months made with an older method stay as they are (marked "not comparable") until someone runs the area again.

### Soil value

Soil value = mean of two indicators:
- **Black-soil share** (0 to 1): the share of the square on black soil, from OpenLandMap's USDA great groups (Mollisols except Cryolls and Albolls), 250 m. Where that map has no data, SoilGrids soil organic carbon (0 to 5 cm) is used: (SOC g/kg − 10) / 50, held between 0 and 1.
- **Cropland share** (0 to 1): ESA WorldCover 2021, class 40, 10 m.

Our black-soil map is broader than the paper's WRB Chernozem ≥ 0.5 map, so national totals come out higher: Ukraine has 15.07 million ha of chernozem in the paper; a real 12-month Atlas run found 25.96 million ha of black soil (34.78 million ha of cropland).
**Cannot see:** soil degradation within a field, contamination, or ownership.

### Damage (the paper's definition)

Damage = mean of two indicators:
- **Unusual fire**: FIRMS fire detections (band T21, 1 km) in the square's **worst war year** above a normal 2019 to 2021 year, per 100 km² (see [Damage over time](#damage-over-time)). Scale: 0 to 1 at 25 per 100 km². The damage window starts the day a known war began, else two years back. Farm burning that comes every year cancels out.
- **Radar change**: Sentinel-1 VV backscatter (10 m, IW mode, one orbit direction), mean over the square's cropland of each pixel's **lasting** change: |each complete war season's median − the same season's median in 2019 to 2021|, the change reached in at least two seasons (with one season so far, that one). Scale: 0 at 0.5 dB, 1 at 3 dB. Ordinary year-to-year change stays under about 0.5 dB on average; 3 dB is the change of shelled or cratered land.

**At peace** (no known war covers the area) the damage **score** is not the mean of the two indicators but the share of the square's black-soil cropland that is heavily damaged (below), full at 20 % (`PEACE_DAMAGE` in `src/lib/atlas/method.js`). Savanna burning and seasonal radar change in dry land have everyday causes: on a real Kenya run (2026-10-19) the indicator mean gave damage 100 to arid squares with 0 ha damaged and put them at the top of the ranking.

**Heavily damaged hectares**: black-soil cropland pixels whose **lasting** radar change (in at least two war seasons) is **3 dB or more**, or **2 dB or more with an unusual fire within 1 km** (a pixel above a normal year in some war year). At peace a pixel needs both: 3 dB **and** an unusual fire within 1 km. On real data at peace, with the war rule, 0.75 % of Iowa's and 1.2 % of the Pampas' black-soil cropland came out "damaged" (rotation, tillage, new fields), which is why the stricter rule applies there.

**Soil health index (CHI), diagnostic only.** From a cloud-masked Sentinel-2 median: CHI = 0.30 NDVI + 0.25 NDMI + 0.20 NBR + 0.15 (1 − BSI) + 0.10 RVI, each first stretched to 0 to 1 over a fixed range. Its drop from 2019 to 2021 is stored for every square and shown in the CSV, but it is **not** part of the damage score: crop rotation and an early or late season move it as much as war does. This follows the paper.

**Cannot see:** mines, unexploded ordnance or contamination. Fire and radar find disturbed land, not its cause: at peace "damage" can be a burnt field, a new building or a flood.

### Damage over time

Soil damage persists (the owner's paper): land abandoned near the front is not burned again, and a crater does not heal in a year. So the evidence must not fade just because the window it is counted over grows.

*Why this changed (2026-10-19).* On the real 12-month Ukraine run, heavily damaged black soil fell from 2.96 million ha (October 2025) to 2.88 (July 2026), 1.93 (August) and 1.32 (September), with "new damage" 0 nearly every month. Fires were counted over the whole window since 24 February 2022 minus the 2019 to 2021 rate × the window's length: as the window grew and the front stopped burning, each pixel's excess shrank, so damage seemed to heal although nothing recovered. Then the radar switched from one season to the next and the total dropped again.

**Fire: the worst war year.** The damage window is cut into **war years** of 12 months that do not overlap: inside a war from the day it began (24 February 2022 to 24 February 2023, and so on), at peace two whole years back from the end of the analysed month. The last year is usually not over yet: it runs to the end of the analysed month and counts once it is at least **3 months** long. Per year:

excess = fire detections in the year − a normal year (the 2019 to 2021 count ÷ 3), never below 0

and the evidence is the **largest excess over the years**. The year not over yet is compared with a **whole** normal year, not a share of it: fire is seasonal (real FIRMS fire days 2019 to 2021 over central and eastern Ukraine: 24 February to 1 September holds 68 % of a year's, where a share by days gives 52 %), so a share by days counted ordinary spring burning as excess, and a share by calendar span would let the excess fall in a month that burns less than usual. Against a whole year the running year's excess only grows, and it is the full year's once the year is over. For a map square this is worked out for the square: each FIRMS pixel's (1 km) excess is smoothed over 5 km and averaged over the square, so a field burnt this year and one nearby burnt in 2019 to 2021 cancel out, and the square's worst year gives its *Unusual fire* indicator (per 100 km², scale as before). For heavy damage an *unusual fire* is a pixel that burned in a year its 5 km neighbourhood was above its normal. For a field it is the field's own pixels. At war every year of one month is also a year of every later month, or grows into it, so once a place has had an unusual fire year it stays counted. At peace fire years older than two years drop out.

*Checked on real data* (Ukraine, September 2026, share of the 1,176 squares with an unusual-fire indicator above 0): 22 % with the whole-window rule, 70 % with ~60 overlapping 12-month years and a share by days, **47 %** now (median 0). Lviv oblast, far from the front: 0.001 with the whole-window rule, 0.43 with overlapping years, **0.18** now. What remains is ordinary year-to-year swings of farm and grass burning: the worst of four or five years is above an average year. Comparing with the highest of the three normal years instead of their average would take more of it out; that is a choice for the method's owner.

**Radar: every complete war season, each on its own, and the change that lasts.** Each complete growing season inside the damage window (one per year, the place's own season) is compared with the same season in 2019 to 2021. A pixel's radar evidence is the change reached in **at least two** of these seasons (the second largest; while only one season exists, that one). So one season of rotation or weather is not damage, and later seasons that look ordinary never outvote a cratered one: from two seasons on the evidence only grows. A new year's season joins for the **whole area in one month**, when the last part of the area has finished that season (Ukraine: the squares greenest in May finish in July, those greenest in July in September, so 2026 joins in October 2026 for all of them). In the tropics without a clear season a "season" is a calendar year, so it too joins once a year.

*Why not one composite.* The first version of this change took the median VV over all war seasons. The median of N seasons is outvoted by later normal-looking seasons, so damage still healed, now once a year (real data: from August to September 2026, 371 squares lost 215,613 ha when the 2026 season joined), and the July total changed in August because one season group finished earlier. Counting a 2 dB change in **any one** season next to an unusual fire went the other way: 5.8 million ha, 22 % of Ukraine's black soil, because the largest of four or five noisy seasons reaches 2 dB almost everywhere fire was once unusual (on a sample of 147 squares: 22 % of cropland with the any-season rule, 9 % with the two-season rule, 2.7 % with the median).

**What that guarantees** (tested with the fake Earth Engine, whose image graph is evaluated pixel by pixel against `src/lib/atlas/method.js`, and in `src/lib/atlas/method.test.js`):

- Two months that share the same war seasons give the same heavy damage unless the fire evidence grows (the war year not over yet gains fires, or a new year begins).
- Heavy damage never falls from one month to the next once two war seasons exist (a war's first year has one; the step to two may lower it once). A pixel damaged in 2022 and ordinary in 2023 to 2026 stays heavy.
- **New damage** = the increase over the previous comparable month; it is never negative.
- A field's damage uses the same years, seasons and two-season rule.

Runs made before this change have an older method version (this one is `2026-10-19.3`) and are marked **"Not comparable: different method version"** next to new ones. An analysis someone starts again (without "redo") redoes those months, as it does sample months once Earth Engine is connected. The **monthly** run does not: it adds the new month only, so a method change never sets off a year of Earth Engine work by itself; the older months stay "not comparable" until someone runs the area again.

*Checked on real data* (Ukraine, the whole country, 1,176 squares, 2026-10-19, a separate server; heavily damaged black soil, million ha):

| Month | Before (whole-window fire, last season's radar) | Now | Time |
| --- | --- | --- | --- |
| May 2026 | 3.847 (an earlier run; the 12-month job's own May had failed: "memory capacity exceeded") | 1.671 (the chunk was asked again twice after "memory capacity exceeded" and passed) | 3 min 38 s |
| June 2026 | 2.860 | 1.672 | 2 min 37 s |
| July 2026 | 2.880 | 1.683 | 2 min 48 s |
| August 2026 | 1.931 | 1.757 | 3 min 28 s |
| September 2026 | 1.319 | 1.780 | 3 min 8 s |

All five months use the war seasons 2022 to 2025 (2026 joins in October). From month to month no square lost any hectare and every square's radar indicator stayed exactly the same; the growth (+1,662, +10,960, +73,814, +23,256 ha) is fire near clear radar change in the 2026 war year, mostly August harvest-season fires. Where it sits (September): Donetsk 18 %, Kharkiv 13 %, Zaporizhzhia 13 %, Dnipropetrovsk 12 %, Kherson 11 %, Luhansk 10 %, Mykolaiv 4 %: **80 %** in these seven eastern and southern oblasts, against the paper's 83.7 % in the east; 1.78 million ha against the paper's 2.23 million ha (our black-soil map is broader, see above). Lviv oblast: 1,960 ha. At peace (a 1° box around Ames, Iowa, September 2026, one season): 267 ha of 628,879 ha of black-soil cropland (0.04 %).

### Safe access

Safe access = distance to the nearest recorded fighting ÷ 100 km, held at 1 (100 km or more scores full access, 1.0; this does not make the land safe: a satellite cannot see mines or unexploded ordnance).
- With an **ACLED** export (optional): distance to battles of the last 12 months.
- Without it, **inside a known war**: distance to unusual fire, meaning a fire of the last 12 months where the fire density within 10 km is at least 3 times the same months of 2019 to 2021 and at least 1 per km².
- **At peace** without ACLED: not measured. Every square counts as safe to reach (full access), the run and the report say so, nothing is set aside, and access then changes no order: Near term and Long term rank the squares the same way (their top areas can still group differently, which is why each shows its size). A full score is not a safety check.

**Cannot see:** mines, checkpoints, roads or legal access. Far from fighting does not mean safe.

### Priority: Near term and Postwar

Weights default to soil value 30, damage 40, safe access 30 (they always add up to 100 and can be changed in the app).

- **Near term**: the least safe squares, holding **30 %** of the black soil, are set aside (counted by rank; squares 100 km or more from fighting are never set aside). Just above that line, scores fade in over a **0.2** ramp of safe access. The rest are ranked by a weighted power mean of soil value and damage.
- **Postwar** (called **Long term** where no war is recorded): all three scores blended with a weighted power mean, no set-aside.

Near term uses only soil value and damage, so its weights are their shares of 100 (30 and 40 become 43 and 57) and safe access is the cutoff. The report's "Settings used" and the Atlas AI give the weights this way, per time frame.

**Top areas** are groups of touching squares: the best square not yet used takes in neighbours (up to 3 squares away) that score at least 70 % of it. Each top area is named by its district, else by where it sits ("North-west"), with its starting point and its size ("12 squares") under the name. The Near term and Long term lists can start at the same square and still be different groups, so the size is always shown.

Weighted power mean = (Σ wᵢ · xᵢʳ)^(1/r) with the weights made to add up to 1. The default **r = 0.5** sits between a plain average (r = 1) and the paper's geometric mean (r = 0, Value^w × Damage^w × Access^w), so one weak score pulls a square down without zeroing it.

**Tiers** are cut by rank: the top 25 % "highest", the next 25 % "high", the next 20 % "medium", the rest "lower".

**No black soil, no rank.** A square where less than 0.5 % of its area is black-soil cropland (about 250 ha for a country-sized square of 50,000 ha; a fraction of a hectare for a farm-sized square; 100 ha when the square's size is unknown) has next to nothing for the method to restore. It is shown as "No black soil" and left out of the ranking, the top areas, the next steps and the budget (`BLACK_SOIL_MIN`).

### People, night lights and alerts

- **People**: WorldPop 2020 (100 m), people living in the square and on its heavily damaged black soil.
- **Night lights**: NASA VIIRS VNP46A2 (500 m), the month's median, for context.
- **Radar alerts**: squares whose VV changed by more than 2 dB this month against the same month of 2019 to 2021, after removing the neighbourhood's own shift (20 km), and at least twice as much as the area's typical square. Only squares with enough black-soil cropland to be ranked count (the 0.5 % rule above), so an alert never points at a town, a lake or arid land the ranking leaves out.
- **Fire alerts**: fires in the month above the same month's 2019 to 2021 count.

### Comparing months

Two months are compared (the change since the month before, new damage, the Compare card, the AI) only when they come from the **same data source** (Earth Engine or sample), the **same method version** (its version, indicators and scales are saved with every month; the version changed on 2026-10-19 with [damage over time](#damage-over-time)) and the **same squares**. Otherwise the app says **"Not comparable: different data source"** (or method, or squares) instead of a difference: a real month against sample months once read "Cropland −27,371,469 ha". The Data page's badge names the latest month's source and how many earlier months came from the other one ("Earth Engine · 11 earlier months are sample data").

### Same code, same answer?

Two real runs of Ukraine, September 2026, with the same code gave 1,318,634 ha and 1,257,117 ha of heavily damaged black soil (and 34.78 against 34.89 million ha of cropland, which never changes). The cause: in the second run Earth Engine ran short of memory on one group of 97 cells in the east, and the old rule measured that group again with pixels twice as coarse (1,850 m); the other 1,079 cells were identical to the hectare. Now:

- A group that runs out of memory or time is **split in two and measured again with the same pixels**, down to 4 cells; a cell's reading does not depend on which cells share its request, so the totals stay the same. Only a piece of 4 cells or fewer that still fails is measured with coarser pixels, and the run says how many cells.
- No reduction uses Earth Engine's "best effort" rescaling: every pixel size is fixed by the app (for a big area, worked out from its size).
- Date windows are fixed by the month and the place's season (the complete war seasons for damage), and the fire sample used for distance to fighting has a fixed seed.
- When Earth Engine's servers are full ("memory capacity exceeded") while checking which images exist or while measuring a group of cells, the same request is tried again after 5 s, then a lighter one after 20 s. When the request itself is too big ("User memory limit exceeded", "Computation timed out", or the app's own 5-minute limit) the same request is not sent again: the lighter one goes at once (each image count on its own, four at a time; the group split in two with the same pixels). A month that still fails is reported as missing and can be run again. The run's warnings and the server log say which step was asked again. (Real data, Ukraine May 2026: "Earth Engine memory capacity exceeded" in the season's image check had failed the whole month.)

Re-checked on real Earth Engine after the split change, **with the method before 2026-10-19.3** (2026-10-19, two runs one after the other, 161 s and 172 s): Ukraine, September 2026, both **1,318,634 ha** heavily damaged, 34,778,156 ha cropland, 25,964,070 ha black soil, 958,961 people on damaged soil, the same as the earlier run that needed no retry. Neither run ran short of memory, so the split itself is tested only with the fake Earth Engine. What can still move a total: images Google adds or reprocesses later (for example fire detections that arrive late), and a run that had to use coarser pixels (it says so).

### Recovery cost

Fast path US$95 to 290 per hectare; full recovery US$260 to 620 per hectare, before demining. These are **planning assumptions** carried over from the product design, not measurements and not tied to a published source. They multiply measured hectares; treat them as order-of-magnitude ranges. Every place that shows a cost (Field "What needs doing", the Atlas map panel and budget box) labels it **"Planning assumption (not sourced)"**, and both AIs are told to say so. A new Atlas workspace starts with **no budget and no team** (nothing made up): the overview asks for a budget, and the first person added to the team is its admin.

### How we know it works (the research)

On Ukraine, 2022 to 2024, against records the method never saw:

| Check | Result |
| --- | --- |
| Radar damage vs 109,636 recorded explosion events | 0.80 |
| Fire detections vs the same events | 0.73 |
| More damage vs a bigger fall in harvests, 21 regions | −0.80 |
| Radar vs fire, two different sensors | 0.62 |
| Near-term top five unchanged across 27 settings | 63 % |
| Reliability checks passed | 126 of 126 |

The paper finds 2.23 million ha of heavily damaged chernozem, 83.7 % of it in the east. The app's real Ukraine runs (method 2026-10-19.3) find 1.68 million ha in July and 1.78 million ha in September 2026, 80 % of it in the seven eastern and southern oblasts (see [Damage over time](#damage-over-time)). Still open: the rankings are not yet tested against real recovery results, and Postwar has no outside check so far.

---

## Datasets

| Dataset (Earth Engine id) | Resolution | Revisit | Used for |
| --- | --- | --- | --- |
| Sentinel-2 surface reflectance (`COPERNICUS/S2_SR_HARMONIZED`) | 10 m (B2, B3, B4, B8); 20 m (B5, B8A, B11, B12) | 2 to 5 days | NDVI, NDWI, NDRE, NDYI, CHI, field edges |
| Cloud Score+ (`GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED`) | 10 m | with Sentinel-2 | Clear-pixel mask |
| Sentinel-1 radar (`COPERNICUS/S1_GRD`, IW, VV and VH) | 10 m pixels | 6 to 12 days | Damage, radar alerts, radar harvest, corn vs soybean |
| NASA FIRMS active fire (`FIRMS`, band T21) | 1 km | daily | Unusual fire, distance to fighting |
| ESA WorldCover 2021 (`ESA/WorldCover/v200`) | 10 m | one map | Cropland |
| OpenLandMap USDA great groups (`OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01`) | 250 m | one map | Black soil |
| SoilGrids organic carbon (`projects/soilgrids-isric/soc_mean`) | 250 m | one map | Black-soil stand-in where the map has no data |
| MODIS NDVI (`MODIS/061/MOD13A2`) | 1 km | 16 days | Each place's season (2019 to 2021) |
| WorldPop (`WorldPop/GP/100m/pop`, 2020) | 100 m | one map | People |
| VIIRS night lights (`NASA/VIIRS/002/VNP46A2`) | 500 m | daily | Night lights |
| FAO GAUL 2015 (`FAO/GAUL/2015/level1`, `level2`) | boundaries | one map | Region names |
| USDA Cropland Data Layer (`USDA/NASS/CDL`) | 30 m | yearly, US only | Checking crop detection (not used in the app's numbers) |
| Open-Meteo forecast and archive | weather models, about 1 to 25 km | hourly | Weather, rain, heat units, pest and disease risk |
| OpenStreetMap Nominatim | — | — | Place search |
| ACLED (optional CSV) | event points | as exported | Distance to fighting |

---

## Where the rules live

| What | File |
| --- | --- |
| Field thresholds and formulas (condition, stress, cause, pest risk, harvest, damage, status) | `src/lib/field/method.js` |
| Crop profiles, heat units, crop classifier | `src/lib/field/crops.js` |
| Atlas indicators, scales, heavy damage, damage over time (war years, worst year, lasting radar change), method version, costs | `src/lib/atlas/method.js` |
| Atlas scores, set-aside, power mean, tiers | `src/lib/atlas/scoring.js` |
| Seasons by place, the war seasons of the damage radar (per place and for a whole area) | `src/lib/season.js` |
| Wars and their areas | `src/config/conflicts.js` |
| Research results | `src/config/research.js` |
| The same rules as Earth Engine image arithmetic | `server/providers/gee.js` (Atlas), `server/providers/field-gee.js` (Field) |

Each of these has tests next to it (`*.test.js`, run with `npm test`). The Earth Engine code is tested against a stand-in (`server/providers/fake-ee.js`) and checked on real data with `npm run gee:check`.
