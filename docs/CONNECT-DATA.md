# Connecting real data

Chernozem starts on **sample data**, so it can be tried with nothing set up: both products work, and every page shows a **Sample data** badge. These steps switch both products (Field and Atlas) to **real satellite data from Google Earth Engine** and turn on the **AI (Claude)**.
No code changes are needed: everything goes into one settings file called `.env`.

What each number means and which dataset it comes from is in [METHODS.md](METHODS.md).

- [1. Running the app](#1-running-the-app)
- [2. Connecting Google Earth Engine](#2-connecting-google-earth-engine) (about 20 minutes)
- [3. Weather and place search](#3-weather-and-place-search) (nothing to do)
- [4. Conflict data from ACLED (optional)](#4-conflict-data-from-acled-optional)
- [5. Connecting Claude (the AI)](#5-connecting-claude-the-ai)
- [6. If something goes wrong](#6-if-something-goes-wrong)
- [7. Protecting the app with an access code](#7-protecting-the-app-with-an-access-code)
- [8. For developers: testing Earth Engine without touching the live data](#8-for-developers-testing-earth-engine-without-touching-the-live-data)

---

## 1. Running the app

1. Open **Terminal** and go to the project folder:
   ```
   cd ~/Desktop/Chernozem-APP
   ```
2. On this Mac, Node is installed in a private folder. If a command below says `command not found: npm`, run this first (once per Terminal window):
   ```
   export PATH=~/.local/node/bin:$PATH
   ```
3. Start the app:
   ```
   npm run dev
   ```
4. Open **http://localhost:5173** in your browser (the Field product; the Atlas is at **/atlas**).
5. To stop it, click the Terminal window and press **Control + C**. To restart, run `npm run dev` again.

### The settings file (.env)

All private settings live in a file named `.env` in the project folder. Create it once from the template:

```
cp .env.example .env
open -e .env
```

The second line opens it in TextEdit. Each setting is one line, `NAME=value`, with no spaces around `=` and no quotes.
Finder hides files whose names start with a dot; press **Command + Shift + .** in Finder to see them.

`.env` and key files are never uploaded to GitHub (they are listed in `.gitignore`). Never email them or paste them in a chat.

---

## 2. Connecting Google Earth Engine

You need a Google account. Earth Engine is free for research, nonprofit and government noncommercial use; commercial use needs a paid plan.

### Step 1: Create a Google Cloud project

1. Go to **https://console.cloud.google.com** and sign in.
2. Click the project picker at the top of the page, then **New project**.
3. Give it a name, for example `chernozem`, and click **Create**.
4. Write down the **Project ID** shown under the name (for example `chernozem-471203`). It is often different from the name.

### Step 2: Turn on the Earth Engine API

1. Go to **https://console.cloud.google.com/apis/library/earthengine.googleapis.com**
2. Check that your new project is selected at the top.
3. Click **Enable**.

### Step 3: Register the project for Earth Engine

1. Go to **https://code.earthengine.google.com/register**
2. Choose **Use with a Cloud project**, then **Unpaid usage** (noncommercial: research, nonprofit, government) or **Paid usage** (commercial).
3. Pick the project from Step 1 and finish the form.

### Step 4: Create a service account (the app's own Google login)

1. Go to **https://console.cloud.google.com/iam-admin/serviceaccounts** (same project selected).
2. Click **Create service account**.
3. Name: `chernozem`. Click **Create and continue**.
4. Write down its email address. It looks like `chernozem@chernozem-471203.iam.gserviceaccount.com`.

### Step 5: Give it the Earth Engine roles

Still in the "Create service account" form ("Grant this service account access to project"), add two roles:

- **Earth Engine Resource Viewer** (search "Earth Engine")
- **Service Usage Consumer** (search "Service Usage")

Click **Continue**, then **Done**.
If you already closed the form: go to **https://console.cloud.google.com/iam-admin/iam**, click **Grant access**, paste the service account's email, and add the same two roles.

### Step 6: Create a JSON key

1. On the service accounts page, click the service account's email.
2. Open the **Keys** tab, then **Add key** > **Create new key** > **JSON** > **Create**.
3. A file downloads (named like `chernozem-471203-1a2b3c4d5e6f.json`). This file is a password: keep it private.

### Step 7: Put the key somewhere safe

Keep the key **outside** the project folder, so it can never be shared with the code by mistake:

```
mkdir -p ~/.config/chernozem
mv ~/Downloads/chernozem-471203-*.json ~/.config/chernozem/service-account.json
```

(Use the real name of the downloaded file.) A key inside the project folder also works if it is named `service-account*.json`: such files are never uploaded to GitHub and the app never serves them to a browser.

### Step 8: Add the settings to .env

Open `.env` (see [The settings file](#the-settings-file-env)) and fill in:

```
GEE_PROJECT_ID=chernozem-471203
GOOGLE_APPLICATION_CREDENTIALS=/Users/yourname/.config/chernozem/service-account.json
GEE_CHERNOZEM_ASSET=none
GEE_DISABLED=
```

- Use your own Project ID from Step 1.
- `GOOGLE_APPLICATION_CREDENTIALS` must be the **full** path (the app does not understand `~`). Type `echo ~` in Terminal to see your home folder.
- `GEE_CHERNOZEM_ASSET=none` uses the public black-soil map (see [The black-soil map](#the-black-soil-map)).
- `GEE_DISABLED` must be empty (or `0`). With `GEE_DISABLED=1` the app stays on sample data even with a working key.

Save the file.

### Step 9: Check the connection

In Terminal, in the project folder:

```
npm run gee:check
```

It checks the settings, signs in, reads the soil maps at a test point in Kharkiv oblast, Ukraine (49.74° N, 37.54° E), analyses one map square there for last month (showing how many seconds each step took), then three squares side by side. It ends with either

- **`Earth Engine is ready.`** You're done; go to Step 10.
- **`NOT READY: ...`** followed by what to fix. See [If something goes wrong](#6-if-something-goes-wrong), fix it and run `npm run gee:check` again.

Google can take up to 10 minutes to apply new roles and registrations. If a step you just did is reported as missing, wait a few minutes and try again.

**Try your own place, anywhere on Earth.** Add `--area=<latitude>,<longitude>,<km>` to analyse a square of that many km around a point, cut into map squares exactly like the Atlas does:

```
npm run gee:check -- --area=49.59,34.55,5      (5 km around Poltava, Ukraine)
npm run gee:check -- --area=42.03,-93.62,40    (40 km in Iowa, USA)
```

It prints how many squares and Earth Engine requests that takes, the time, and the lowest, middle and highest value of each reading. The growing season follows the place's latitude, and war rules apply only where a known war covers it. Start small (a few km); bigger squares take longer.

### Step 10: Restart the app

Stop the app (**Control + C**) and run `npm run dev` again. **Settings > Data** now says **Earth Engine** in both products. What happens next:

- **Field**: every field still on sample data is analysed again with real data, including its history since 2019. With **Update automatically** on, each field is refreshed when its analysis is more than a day old (Sentinel-2 passes every 2 to 5 days). **Update now** in Settings does it straight away. A farm of 7 fields takes about half a minute; a large farm several minutes.
- **Atlas**: every saved area is analysed again with real data (when **Analyze every saved area automatically each month** is on), starting a few seconds after the app connects: the area on screen first, then the others by name, one area at a time (the others say "Waiting for … analysis to finish"). **Re-run analysis** in Settings redoes the area on screen: at once, or once the analysis running now (and any other a person asked for before) has ended; areas waiting for the monthly check go after it. **Stop**, under the progress bar, ends the analysis running (the months done are kept) and lets the next area start. A country-sized area takes several minutes per month.

Both products show progress while they work, and the rest of the app stays usable.

### The black-soil map

The app uses a **public** black-soil map that covers the whole world: OpenLandMap's USDA soil great groups (250 m). Black soil = the Mollisols, except the cold and bleached ones. Keep `GEE_CHERNOZEM_ASSET=none`.

The research team's own Ukraine map (`projects/zhaobo/assets/chernozem_wrb_ukraine`) can be used instead by setting `GEE_CHERNOZEM_ASSET` to that id, but only if its owner shares it with your service account (Earth Engine Code Editor > Assets > Share > add the service account's email as a Reader). It covers Ukraine only; elsewhere the public map is used. `npm run gee:check` says which map it used.

### What Earth Engine measures

The full list, with formulas, is in [METHODS.md](METHODS.md). In short:

| Reading | Earth Engine dataset |
| --- | --- |
| Plant health (NDVI), water (NDWI), red edge (NDRE), field edges | `COPERNICUS/S2_SR_HARMONIZED`, cleaned with `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED` |
| Radar damage, radar harvest, crop type support | `COPERNICUS/S1_GRD` (VV and VH) |
| Unusual fire | `FIRMS` (band T21), above the 2019 to 2021 rate |
| Cropland | `ESA/WorldCover/v200` (class 40) |
| Black soil | `OpenLandMap/SOL/SOL_GRTGROUP_USDA-SOILTAX_C/v01`; where it has no data, `projects/soilgrids-isric/soc_mean` |
| Each place's growing season | `MODIS/061/MOD13A2` (2019 to 2021) |
| People | `WorldPop/GP/100m/pop` (2020) |
| Night lights | `NASA/VIIRS/002/VNP46A2` |
| Place names | `FAO/GAUL/2015/level1` and `level2` |

How the app keeps a big job from failing (the details are in [METHODS.md](METHODS.md), "Same code, same answer?"):

- The server analyses one Atlas area at a time: another area's analysis (from the monthly check of every saved area, or a person) waits until the ones before it have ended, so two areas never share the project's limits at once. A person's request goes before the areas waiting for the monthly check, and the analysis running can be stopped (Stop: the months done are kept).
- Atlas squares are sent to Earth Engine in groups (up to 250 small squares at a time, about 100 for a country like Ukraine), at most two groups of a month at once. Field analyses send up to 8 fields per request, at most 4 requests at once.
- Every request has the app's own time limit, at most 5 minutes: 5 for a group of squares and for the Field's requests, 4 for a check of which images exist, 2 for place names, alert dates, a region's outline and a GeoTIFF link, 1 for a region search and a read of a map's description. The Earth Engine library's own deadline comes a minute after the longest, so the app's limit ends a request first.
- A request that is too much work ("User memory limit exceeded", "Computation timed out", or past the app's time limit) is made lighter at once. An Atlas group is split in two with the same pixels, down to 4 squares; only a piece that still fails uses coarser pixels, and the run says how many squares. A lighter image check sends each count as its own request, four at a time. A Field request uses 20 m pixels instead of 10 m, and the field's analysis (on the Data page) or the field search says so. When Earth Engine's servers are full ("memory capacity exceeded"), the same request is first tried again after 5 s.
- A growing-season group that runs past the time limit is sent once more; if it fails again, the area takes its seasons from the latitude and the run says so.
- A dropped connection is retried once after 8 s; a busy Earth Engine ("Too many concurrent aggregations.", "Earth Engine capacity exceeded.") twice more, after 40 s and then 80 s. These retries are **tested only with the fake Earth Engine** in the tests (`server/providers/fake-ee.js`), not against a real dropped connection or a real busy answer.
- A month that still fails is skipped: the job goes on with the other months and says which are missing; running it again fills them in. Only a problem that would fail every month (a bad key, no permission, a real quota) stops the job at once. Once a month, or a farm's analysis, has failed, nothing more of it is sent.
- The Atlas gives way to the Field: while a farm's analysis, a field search or a region search has a request with Earth Engine, the Atlas sends nothing new (each request waits 10 minutes at most), and the Atlas page says it is waiting. This counts one server's requests only: a second server or a script on the same project is not seen.
- Outside the app's control, the Earth Engine library itself sends a request answered "429, too many requests" again (up to 10 times, about 10 minutes in all) and sends one request every 350 ms.
- The Atlas totals are made repeatable: fixed pixel scales, no "best effort" rescaling, and fixed date windows (see docs/METHODS.md, "Same code, same answer?").
- No request asks for dates after today. For a month that is not over yet, only images up to yesterday are used, and the run says so.

---

## 3. Weather and place search

Nothing to set up:

- **Weather** comes from **Open-Meteo** (`api.open-meteo.com`, free, no key): the farm's weather now, a 10-day forecast, rain before harvest, heat units for harvest timing, and the weather-based pest and disease risk. Older temperatures come from Open-Meteo's archive. Answers are kept for an hour.
- **Place search** ("Kupiansk", "Ames, Iowa") uses **OpenStreetMap Nominatim**, at most one request per second, kept for a day. Typed coordinates ("49.74, 37.54", "49.74N 37.54E", "lat -33.9 lon 18.4", "-34,6; -60,0") are read directly without asking anyone.

Both need an internet connection. If the weather service cannot be reached, the weather tile says so and the rest of the page works.

---

## 4. Conflict data from ACLED (optional)

Without this file, the Atlas measures "distance to fighting" inside a known war (the app's list, or a war your team set for the area in Atlas Settings) from **unusual** fire detections (fires well above the normal years' rate for the place). Outside a war it is not measured at all. Inside a war whose fires are sparser than at a front line (scattered strikes: real data, south Lebanon, September 2026), no fire counts as fighting, so it is not measured there either: the app says so (Atlas Settings, the map key, the report and the AI), and an ACLED file is the way to measure it. An ACLED file gives the real battle locations. If a connected file has no battles within 300 km of an area (an export of another country, or fighting that ACLED records as strikes, not battles), the app says so for that area rather than "no ACLED file": check that the export covers the area's country and its neighbours; where the fighting is recorded only as strikes, your team's own knowledge of it is needed.

1. Create a free account at **https://acleddata.com** (choose the research or public-sector access type).
2. Open the **Data Export Tool**. Pick the country (and its neighbours if the area is near a border), a date range that covers **at least the last 13 months**, and event type **Battles** (others are fine but are not used). Export as **CSV**.
3. Save the file inside the project as `server/.data/acled.csv` (that folder is never uploaded to GitHub).
4. Add to `.env`:
   ```
   ACLED_CSV_PATH=./server/.data/acled.csv
   ```
5. Run `npm run gee:check`; the ACLED line shows how many battles it found. Download a fresh export every month or two.

---

## 5. Connecting Claude (the AI)

Both AI pages (Field AI and Atlas AI) use the Claude API with your own API key. The AI answers from the app's own data (the farm's fields and analyses, the Atlas runs, the weather and the farmer's reports with photos), never from made-up numbers.

1. Go to **https://console.anthropic.com** and sign in (or sign up).
2. Open **Settings > Billing** and add credit. The API is paid per use.
3. Open **Settings > API keys**, click **Create key**, name it `chernozem`, and copy the key (it starts with `sk-ant-`). You only see it once.
4. Add it to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. Restart the app (**Control + C**, then `npm run dev`). The AI pages now answer, and **Settings > AI** says **Connected**. `npm run gee:check` also shows whether the key is set.

**Note:** a claude.ai subscription (Pro, Max, Team) is separate from the API. It does not include API usage and cannot be linked to the app; the app needs an API key from console.anthropic.com, billed there.

Optional: `CLAUDE_MODEL=` picks a different Claude model (the default is `claude-opus-5-5`).

---

## 6. If something goes wrong

What `npm run gee:check` (or **Settings > Data**) says, and what to do:

| Message | What to do |
| --- | --- |
| `MISSING GEE_PROJECT_ID` | Step 8: add `GEE_PROJECT_ID=` with your Project ID. |
| `MISSING GOOGLE_APPLICATION_CREDENTIALS` | Steps 6 to 8: create the key, put it in place, add the line to `.env`. |
| `... points to ..., but that file cannot be read` | The path is wrong or uses `~`. Use the full path (Step 8). |
| `... is not valid JSON` / `missing client_email or private_key` | The file is not a service-account key. Create a new JSON key (Step 6). |
| `The Earth Engine API is not enabled` | Step 2. Wait a few minutes after enabling. |
| `... is not registered for Earth Engine` | Step 3. Wait a few minutes after registering. |
| `The service account ... lacks permission` | Step 5: give it **Earth Engine Resource Viewer** and **Service Usage Consumer**. Wait a few minutes. |
| `Google rejected the service-account key` | The key was deleted or is wrong. Create a new JSON key (Step 6) and replace the file. |
| `Asset not found: projects/zhaobo/...` | The research team's map is not shared with your service account. Set `GEE_CHERNOZEM_ASSET=none` (the public map; see [The black-soil map](#the-black-soil-map)). |
| `Could not reach Google Earth Engine` | Check the internet connection. |
| `Earth Engine could not finish this much work` / `did not answer in time` | Try again later, or analyse a smaller area first. |
| `Earth Engine is limiting requests` | The project hit its quota or rate limit. Wait a few minutes and try again. |
| `Earth Engine was too busy` | Usually another job or script was using the same project at the same time ("Too many concurrent aggregations."): let it finish (or stop it), then run the analysis again to fill in the missing months. An Atlas job goes on with its other months (a farm: analyse it again later). "Earth Engine capacity exceeded." is Earth Engine as a whole: try again later. |
| `Waiting for Ukraine's analysis to finish` | Nothing to fix: the server analyses one Atlas area at a time, and this one starts when the ones before it have ended (a person's request goes before the areas waiting for the monthly check). **Cancel** takes it out of line. **Stop**, under the progress bar of the analysis running, ends that one (its months done are kept) so the next can start; the monthly check starts a stopped area again within 6 hours if its latest month is still missing. |
| Settings says **Sample data** with a working key | `.env` has `GEE_DISABLED=1`. Empty it and restart. |
| Settings says **Not connected** | Earth Engine is set up but could not connect; the reason is shown. The app tries again every 5 minutes. Meanwhile analyses stop with "Earth Engine is set up but cannot be reached right now" (try again later): sample numbers are never saved for a real place. |

To go back to sample data at any time, set `GEE_DISABLED=1` in `.env` and restart.

---

## 7. Protecting the app with an access code

On your own computer the app needs no code. Before handing it to anyone else (on your network or online), set an access code so only people you give it to can see the data.

1. Add a line to `.env` with a long code, for example four random words:
   ```
   ATLAS_ACCESS_CODE=river-tractor-winter-maple
   ```
2. Restart the app. Everyone now sees a small sign-in card and types the code once; the browser remembers it for 30 days.
3. Share the code in person or by phone, not in the same email as the link.

Good to know:
- **Changing the code signs everyone out.** Do this when someone should no longer have access.
- **10 wrong codes** from one address lock it out for 10 minutes.
- With a code set, `npm start` answers the whole network (not just this computer). Without one it only answers this computer. To choose yourself, add `HOST=127.0.0.1` (this computer) or `HOST=0.0.0.0` (the network).
- Online, put the app behind **https** (for example Caddy, nginx or Cloudflare Tunnel); the sign-in cookie is then sent over https only. Behind such a proxy, also add `ATLAS_TRUST_PROXY=1` so the wrong-code limit counts each visitor separately.
- The code protects all the data of both products (farm, fields, reports and photos, areas, runs, team, AI chats). The page design itself (not the data) can still be loaded without it.

---

## 8. For developers: testing Earth Engine without touching the live data

The live app keeps its data in `server/.data` (farm, analyses, Atlas runs, chats). Real Earth Engine jobs write there and can take minutes. To try a change on real data without touching the live app, run a **second** server on a copy of the data:

```
export PATH=~/.local/node/bin:$PATH
TMP=$(mktemp -d) && cp -R server/.data/. "$TMP/"
GEE_DISABLED= CHERNOZEM_DATA_DIR="$TMP" PORT=8799 npm start
```

- `GEE_DISABLED=` (empty) in the command overrides `.env`, so this server uses Earth Engine even when the live one is on sample data.
- `CHERNOZEM_DATA_DIR` points it at the copy; delete the folder afterwards.
- `npm start` serves the built app (`npm run build` first) and the API on the given port. For API-only checks, `curl http://127.0.0.1:8799/api/status`.
- A lock file stops two servers on the same data folder from running the monthly analysis at once.

The automatic tests (`npm test`) never call Earth Engine: they run every Earth Engine request against a stand-in (`server/providers/fake-ee.js`).
