# How Chernozem measures

This page explains every number the app shows: where it comes from, how it is worked out, how often it changes, and what it cannot see. It is written for farmers, partners and investors. Every rule named here lives in code with tests (see [Where the rules live](#where-the-rules-live)), so this page and the app describe the same thing.

**Ground rules**

- **Only measured numbers.** Every value on a page comes from a Google Earth Engine computation on public satellite data, from a weather service (Open-Meteo), or from what the user typed. Nothing is filled in by hand.
- **Sample data is labelled.** Until Earth Engine is connected, the app runs on a built-in sample source so it can be tried. Those pages carry a **Sample data** badge, and the AI says so too. Sample numbers are made up and are never shown as satellite measurements.
- **Honest words.** A satellite cannot name a pest, find a mine or prove that land is safe. Where that is the truth the app says "likely", "risk" or "check on the ground". Only certified deminers can declare land safe.
- **Works anywhere on Earth.** Seasons follow the place (see [Seasons](#seasons-by-place)), and war rules apply only where a known war covers the land (see [Wars](#wars-by-area)). Ukraine is the research case study, not a limit.

**Contents**

- [Shared foundations](#shared-foundations): normal years, clouds, seasons, wars
- [Field: a farmer's own fields](#field-a-farmers-own-fields)
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

- **Inside a known war**, damage is counted from the day the war started, the Data charts mark that day, and the AI and reports talk about demining.
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
| Damage | Sentinel-1 VV, 10 m; FIRMS fire, 1 km | Radar change and unusual fire | Daily check |
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

*Checked on real data:* the demo farm near Kupiansk, Ukraine, against 7 hand-drawn outlines (measured 2026-10-19): mean overlap (IoU) **0.805**. Six fields match well (0.83 to 0.96); one (Field 5) scores only 0.14: no detected outline matches it, so the farmer has to draw it. The same score with and without the join of touching pieces by their season curves (that join leaves the demo farm's fields apart).
*Cannot see:* a boundary with no visible difference on the ground (the same crop, sown on the same day, on both sides of a property line). The farmer can draw or remove fields.

### Plant health (NDVI)

**Formula:** NDVI = (B8 − B4) / (B8 + B4), the standard vegetation index (near-infrared against red). Bare soil is about 0.2, a dense green crop 0.8 to 0.9.
**Window:** median of clear pixels over the last 30 days, or the 30 days up to the latest clear pass when that is 30 to 90 days old.
**Normal:** the same calendar window (±15 days) in 2019, 2020 and 2021. The tile shows the reading, "Below", "Normal" or "Above" the normal range (a margin of 0.02 stops a hair's difference from flipping the word), and the range.
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

- **Stressed share** = the share of the field's pixels that are stressed. Level: high from 15 %, medium from 5 %, else low.
- **Patches** = stressed blobs of 0.3 ha or more (the 3 largest per field), drawn as dashed circles on the map.
- **Likely cause**: the mean NDWI anomaly (NDWI minus normal) over the stressed pixels. At −0.05 or lower: **"Dry patch"**. Otherwise: **"Not water: check for pests or disease"**.
- **No crop, no stress**: when the field is harvested or not sown (or reads as fallow or grass), the tile says **"No crop"**, and a harvested or not-sown field has no condition score (it is not "Poor").
- **Dried down, no stress**: once a crop is ready (dried down, standing dry or with its leaves down), or a field of unknown crop has dried down to the ready level, the tile says **"Dried down"** and stress is not read: leaves die back unevenly as a crop dries, and both rules would read that as stress. (Real data, Iowa, 2026-10-19: a dried-down field read "Stress high · Dry patch" while its water was normal and its condition "Very good".)

**Cannot see:** which pest or disease it is. A satellite sees that plants are weaker and whether water explains it, nothing more. Hail, herbicide drift, nutrient shortage and waterlogging can all look like "not water". The app says "check on the ground".

### Pest and disease risk (a forecast, not a detection)

Only while a crop is growing or ripening (not once it has dried down, and not on fallow or grass). From Open-Meteo hourly air temperature and relative humidity over **14 days: the last 7 and the next 7**.

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

**Red-edge gap.** Radar VH peaks shift by a decibel or more from one region to the next (North Dakota corn −15.1 dB against Iowa corn −16.2 dB, median), so VH alone could not tell corn from soybean or sunflower outside the calibration area. The classifier also reads the **red-edge gap**: the mean of NDVI − NDRE over this season's clear passes within 20 days of the NDVI peak (at least 2 passes), a property of the canopy. Calibration windows (10th to 90th percentile): **corn 0.111 to 0.155** (128 fields), **soybean 0.161 to 0.195** (71), **sunflower 0.193 to 0.267** (10); spring cereal 0.154 to 0.21, winter cereal 0.152 to 0.243, spring canola 0.178 to 0.26.

**Grass or hay.** A field cut and grown back two or more times in one season (a fall of 0.25 or more from NDVI 0.6 or higher within 21 days, then regrowth back to 0.6 within 45 days) is grass or hay, not a field crop the rules know (real alfalfa near Ames, cut three times in 2026, was read "winter cereal" before this rule). A cereal followed by a second crop is one cut, not two.

**Fallow or grass.** When no crop rule fits, a field that greens up in spring, peaks before early July (northern day 185), fades for 50 days or more without ever going back to bare soil (NDVI never under 0.25 after green-up) and has a red-edge gap above **0.27** (wider than any crop's window) reads **"Fallow or grass"**: mixed grasses and weeds, not a sown crop. It has no harvest, no crop stress and no pest risk, and its slow fade to dry grass is never called a harvest. This is the pattern of 8 of the 11 fields on the Kupiansk demo farm (peaks of 0.66 to 0.89 in late June, the same in 2025), a few kilometres from the front: fallow or abandoned cropland gone to grass. Checked against the CDL (below): not one of 528 crop fields is called fallow or grass, but neither is any of 60 CDL grassland, hay or summer-fallow fields in the Dakotas and Montana (prairie grass there has a narrower red-edge gap, and US "fallow" is bare tilled land, which this rule does not describe). Because the rule rests on one region it is only ever **"possible"**. A field that fades the same way but fails one test stays "Unknown", and the reason says what was seen ("Green from early May, greenest in late June, a slow fade over 110 days: not the pattern of a known crop; possibly fallow or grass").

**A double crop.** When a crop was harvested and another has grown since (a southern double crop: last summer's soybean, then wheat), the crop read is the one harvested, so it is **last season's** and never drives this season's harvest rules.

**Validation against the USDA Cropland Data Layer** (`USDA/NASS/CDL` 2025, 30 m, band `cropland`), run on 2025-10-19 conditions with this app's own Earth Engine provider (the 2025 season, the same code path as a live analysis; script and logs: the build scratchpad `cdl/` and `val/cdl/`). Each field's truth is its CDL majority class (fields with a majority under 60 % left out). The rules were calibrated on **176 fields near Ames, Iowa** (corn, soybean; detected outlines) and **95 sample fields in central South Dakota, north-west Minnesota and north Montana** (homogeneous 240 m squares sampled per CDL class), then frozen and measured on **248 held-out North Dakota fields** (detected outlines and 240 m squares in four areas: north-east, centre, south-east and south-centre).

Accuracy = the share of a crop's fields that were named as that crop. "Likely right" = of the fields named that crop with confidence "likely", how many were right.

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

**Condition** = 0.5 × plant health score + 0.3 × water score + 0.2 × (1 − stressed share), from 0 to 1. Missing parts are left out and the rest re-weighted. Classes: Poor under 0.40, Fair under 0.65, Good under 0.85, Very good above. Because health and water are compared with the normal for the **same weeks**, a crop drying down on time for harvest still scores well. A damaged field is never shown better than Fair, and a field with **high stress** (15 % or more) never better than Good (0.84). A harvested or not-sown field has no condition.

**Status**, most urgent first: Needs recovery (damage) → Ready to harvest → Harvest soon (ready within 14 days) → Harvested → Not sown → Watch (condition below Fair, stress medium or high, or plant health below normal) → Healthy. "No clear image yet" when there is no clear pass. The overview counts harvested and not-sown fields on their own, never as "healthy" (for example "4 healthy · 5 harvested · 1 ready to harvest"), and a field with high stress is counted "to watch" even when its status is a harvest one.

### Damage

| Evidence | Source | Rule |
| --- | --- | --- |
| Radar change | Sentinel-1 VV, 10 m, one orbit direction | Per pixel: the last complete growing season's median minus the same months of 2019 to 2021, minus the field's own overall change. A pixel counts at 3 dB or more. Crop rotation and soil moisture shift a whole field; craters, trenches and burnt patches change parts of it. |
| Unusual fire | NASA FIRMS (band T21), 1 km | Fire detections in the damage window minus what the 2019 to 2021 rate gives for a window that long, never below 0. Stubble burning that happens every year cancels out. |
| Health index | Sentinel-2 (see the Atlas) | Support only, never enough on its own. |

- **Inside a known war:** damaged when radar changed over 10 % of the field; or 3 or more unusual fires backed by radar change over 5 % (or a health-index drop of 0.1); or a health-index drop backed by radar change over 5 %.
- **At peace:** damaged only when 3 or more unusual fires AND radar change over 5 % are both found. Ploughing or a new crop alone can change radar over part of a field.
- **Damaged area** = the radar-changed share × the field's area. When only fire shows it, the area is left blank rather than guessed.
- **Recovery cost** ranges are planning assumptions, not measurements (see [Recovery cost](#recovery-cost)).

**Cannot see:** mines or unexploded ordnance. A field with no damage found is **not** a safe field.

### Black soil

The share of the field on black soil, from OpenLandMap's USDA great-group map (250 m): the Mollisols ("…olls") except the cold (Cryolls) and bleached (Albolls) ones. At 0.5 or more the field is shown as chernozem. This is broader than the research's WRB Chernozem definition (it also counts Phaeozems and Kastanozems).
**Cannot see:** the soil on this particular farm at a finer scale than 250 m, or its current organic matter.

### Weather, history and downloads

- **Weather**: Open-Meteo (free, no key) at the farm's centre: now, 10 days of forecast, the next rainy spell. Kept for an hour.
- **History** (Data page): monthly field means of clear NDVI and NDWI since January 2019, refreshed every 30 days.
- **Downloads**: field outlines (GeoJSON), every reading (CSV), the history (CSV) and, with Earth Engine, a GeoTIFF of the latest NDVI, NDWI and condition clipped to the field.

---

## Atlas: a region or a country

The Atlas is for offices and funders who decide where restoration money goes first. It follows the owner's research paper (Chernozem Recovery Atlas, 2026; data and code on Harvard Dataverse, [doi:10.7910/DVN/IYXPVS](https://doi.org/10.7910/DVN/IYXPVS)).

An area (a drawn shape, a region, a country) is cut into a grid of squares: as small as possible while staying under 1,500 squares (0.25°, about 18 × 28 km, for all of Ukraine; a few hundred metres or less for a farm-sized area). Each square is measured for one month. Each reading becomes a 0-to-1 indicator on a **fixed scale**, so a score means the same thing in every month and every place. The indicators make three scores, and the scores make the priority.

### At a glance

| Number | Source and resolution | How it is worked out | Updates |
| --- | --- | --- | --- |
| Soil value | OpenLandMap USDA soil classes, 250 m; ESA WorldCover, 10 m | Mean of black-soil share and cropland share | Monthly |
| Damage | FIRMS fire, 1 km; Sentinel-1 VV radar, 10 m | Mean of unusual fire and radar change | Monthly |
| Heavily damaged hectares | Same | Black-soil cropland pixels with strong radar change (with fire) | Monthly |
| Soil health index (CHI) | Sentinel-2, 10 to 20 m | Five-index blend, this season vs normal | Monthly, diagnostic only |
| Safe access | ACLED battles, or FIRMS unusual fire | Distance to fighting, full at 100 km | Monthly |
| Priority, rank, tier | The three scores | Near term and Postwar formulas | Instantly when weights change |
| People, night lights | WorldPop 100 m (2020); VIIRS 500 m | Sum and median | Monthly, context only |
| Alerts | Sentinel-1 VV; FIRMS | This month vs the same month of 2019 to 2021 | Monthly |

**Monthly**: with "Analyze automatically each month" on, the server analyses each month once it is over (it checks every 6 hours). The damage evidence uses the last **complete** growing season, so it changes once per season; month-to-month change comes from that month's new fires and radar change.

### Soil value

Soil value = mean of two indicators:
- **Black-soil share** (0 to 1): the share of the square on black soil, from OpenLandMap's USDA great groups (Mollisols except Cryolls and Albolls), 250 m. Where that map has no data, SoilGrids soil organic carbon (0 to 5 cm) is used: (SOC g/kg − 10) / 50, held between 0 and 1.
- **Cropland share** (0 to 1): ESA WorldCover 2021, class 40, 10 m.

Our black-soil map is broader than the paper's WRB Chernozem ≥ 0.5 map, so national totals come out higher: Ukraine has 15.07 million ha of chernozem in the paper; a real 12-month Atlas run found 25.96 million ha of black soil (34.78 million ha of cropland).
**Cannot see:** soil degradation within a field, contamination, or ownership.

### Damage (the paper's definition)

Damage = mean of two indicators:
- **Unusual fire**: FIRMS fire detections (band T21, 1 km) in the damage window **minus** the square's normal rate from 2019 to 2021 for a window that long, never below 0, per 100 km². Scale: 0 to 1 at 25 per 100 km². The damage window starts the day a known war began, else two years back. Farm burning that comes every year cancels out.
- **Radar change**: Sentinel-1 VV backscatter (10 m, IW mode, one orbit direction), mean |change| over the square's cropland between the last complete growing season's median and the same season's median in 2019 to 2021. Scale: 0 at 0.5 dB, 1 at 3 dB. Ordinary year-to-year change stays under about 0.5 dB on average; 3 dB is the change of shelled or cratered land.

**At peace** (no known war covers the area) the damage **score** is not the mean of the two indicators but the share of the square's black-soil cropland that is heavily damaged (below), full at 20 % (`PEACE_DAMAGE` in `src/lib/atlas/method.js`). Savanna burning and seasonal radar change in dry land have everyday causes: on a real Kenya run (2026-10-19) the indicator mean gave damage 100 to arid squares with 0 ha damaged and put them at the top of the ranking.

**Heavily damaged hectares**: black-soil cropland pixels whose radar changed by **3 dB or more**, or by **2 dB or more with an unusual fire within 1 km**. At peace a pixel needs both: 3 dB **and** an unusual fire within 1 km. On real data at peace, with the war rule, 0.75 % of Iowa's and 1.2 % of the Pampas' black-soil cropland came out "damaged" (rotation, tillage, new fields), which is why the stricter rule applies there.

**Soil health index (CHI), diagnostic only.** From a cloud-masked Sentinel-2 median: CHI = 0.30 NDVI + 0.25 NDMI + 0.20 NBR + 0.15 (1 − BSI) + 0.10 RVI, each first stretched to 0 to 1 over a fixed range. Its drop from 2019 to 2021 is stored for every square and shown in the CSV, but it is **not** part of the damage score: crop rotation and an early or late season move it as much as war does. This follows the paper.

**Cannot see:** mines, unexploded ordnance or contamination. Fire and radar find disturbed land, not its cause: at peace "damage" can be a burnt field, a new building or a flood.

### Safe access

Safe access = distance to the nearest recorded fighting ÷ 100 km, held at 1 (100 km or more scores full access, 1.0; this does not make the land safe: a satellite cannot see mines or unexploded ordnance).
- With an **ACLED** export (optional): distance to battles of the last 12 months.
- Without it, **inside a known war**: distance to unusual fire, meaning a fire of the last 12 months where the fire density within 10 km is at least 3 times the same months of 2019 to 2021 and at least 1 per km².
- **At peace** without ACLED: not measured. Every square counts as reachable, the run says so, and nothing is set aside.

**Cannot see:** mines, checkpoints, roads or legal access. Far from fighting does not mean safe.

### Priority: Near term and Postwar

Weights default to soil value 30, damage 40, safe access 30 (they always add up to 100 and can be changed in the app).

- **Near term**: the least safe squares, holding **30 %** of the black soil, are set aside (counted by rank; squares 100 km or more from fighting are never set aside). Just above that line, scores fade in over a **0.2** ramp of safe access. The rest are ranked by a weighted power mean of soil value and damage.
- **Postwar**: all three scores blended with a weighted power mean, no set-aside.

Weighted power mean = (Σ wᵢ · xᵢʳ)^(1/r) with the weights made to add up to 1. The default **r = 0.5** sits between a plain average (r = 1) and the paper's geometric mean (r = 0, Value^w × Damage^w × Access^w), so one weak score pulls a square down without zeroing it.

**Tiers** are cut by rank: the top 25 % "highest", the next 25 % "high", the next 20 % "medium", the rest "lower".

**No black soil, no rank.** A square where less than 0.5 % of its area is black-soil cropland (about 250 ha for a country-sized square of 50,000 ha; a fraction of a hectare for a farm-sized square; 100 ha when the square's size is unknown) has next to nothing for the method to restore. It is shown as "No black soil" and left out of the ranking, the top areas, the next steps and the budget (`BLACK_SOIL_MIN`).

### People, night lights and alerts

- **People**: WorldPop 2020 (100 m), people living in the square and on its heavily damaged black soil.
- **Night lights**: NASA VIIRS VNP46A2 (500 m), the month's median, for context.
- **Radar alerts**: squares whose VV changed by more than 2 dB this month against the same month of 2019 to 2021, after removing the neighbourhood's own shift (20 km), and at least twice as much as the area's typical square.
- **Fire alerts**: fires in the month above the same month's 2019 to 2021 count.

### Comparing months

Two months are compared (the change since the month before, new damage, the Compare card, the AI) only when they come from the **same data source** (Earth Engine or sample), the **same method version** (its indicators and scales are saved with every month) and the **same squares**. Otherwise the app says **"Not comparable: different data source"** (or method, or squares) instead of a difference: a real month against sample months once read "Cropland −27,371,469 ha". The Data page's badge names the latest month's source and how many earlier months came from the other one ("Earth Engine · 11 earlier months are sample data").

### Same code, same answer?

Two real runs of Ukraine, September 2026, with the same code gave 1,318,634 ha and 1,257,117 ha of heavily damaged black soil (and 34.78 against 34.89 million ha of cropland, which never changes). The cause: in the second run Earth Engine ran short of memory on one group of 97 cells in the east, and the old rule measured that group again with pixels twice as coarse (1,850 m); the other 1,079 cells were identical to the hectare. Now:

- A group that runs out of memory or time is **split in two and measured again with the same pixels**, down to 4 cells; a cell's reading does not depend on which cells share its request, so the totals stay the same. Only a piece of 4 cells or fewer that still fails is measured with coarser pixels, and the run says how many cells.
- No reduction uses Earth Engine's "best effort" rescaling: every pixel size is fixed by the app (for a big area, worked out from its size).
- Date windows are fixed by the month and the place's season (the last complete season for damage), and the fire sample used for distance to fighting has a fixed seed.

Re-checked on real Earth Engine after the change (2026-10-19, two runs one after the other, 161 s and 172 s): Ukraine, September 2026, both **1,318,634 ha** heavily damaged, 34,778,156 ha cropland, 25,964,070 ha black soil, 958,961 people on damaged soil, the same as the earlier run that needed no retry. Neither run ran short of memory, so the split itself is tested only with the fake Earth Engine. What can still move a total: images Google adds or reprocesses later (for example fire detections that arrive late), and a run that had to use coarser pixels (it says so).

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

The paper finds 2.23 million ha of heavily damaged chernozem, 83.7 % of it in the east. Still open: the rankings are not yet tested against real recovery results, and Postwar has no outside check so far.

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
| Atlas indicators, scales, heavy damage, costs | `src/lib/atlas/method.js` |
| Atlas scores, set-aside, power mean, tiers | `src/lib/atlas/scoring.js` |
| Seasons by place | `src/lib/season.js` |
| Wars and their areas | `src/config/conflicts.js` |
| Research results | `src/config/research.js` |
| The same rules as Earth Engine image arithmetic | `server/providers/gee.js` (Atlas), `server/providers/field-gee.js` (Field) |

Each of these has tests next to it (`*.test.js`, run with `npm test`). The Earth Engine code is tested against a stand-in (`server/providers/fake-ee.js`) and checked on real data with `npm run gee:check`.
