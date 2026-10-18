# Connecting real data

The Atlas works straight away on **sample data** (pages show a "Sample data" badge).
These steps switch it to **real satellite data from Google Earth Engine** and turn on the **AI (Claude)**.
No code changes are needed: everything goes into one settings file called `.env`.

- [1. Running the app](#1-running-the-app)
- [2. Connecting Google Earth Engine](#2-connecting-google-earth-engine) (about 20 minutes)
- [3. Conflict data from ACLED (optional)](#3-conflict-data-from-acled-optional)
- [4. Connecting Claude (the AI)](#4-connecting-claude-the-ai)
- [5. If something goes wrong](#5-if-something-goes-wrong)
- [6. Protecting the app with an access code](#6-protecting-the-app-with-an-access-code)

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
4. Open **http://localhost:5173/atlas** in your browser.
5. To stop it, click the Terminal window and press **Control + C**. To restart, run `npm run dev` again.

### The settings file (.env)

All private settings live in a file named `.env` in the project folder. Create it once from the template:

```
cp .env.example .env
open -e .env
```

The second line opens it in TextEdit. Each setting is one line, `NAME=value`, with no spaces around `=` and no quotes.
Finder hides files whose names start with a dot; press **Command + Shift + .** in Finder to see them.

`.env` and the key file are never uploaded to GitHub (they are listed in `.gitignore`). Never email them or paste them in a chat.

---

## 2. Connecting Google Earth Engine

You need a Google account. Earth Engine is free for research, nonprofit and government noncommercial use; commercial use needs a paid plan.

### Step 1: Create a Google Cloud project

1. Go to **https://console.cloud.google.com** and sign in.
2. Click the project picker at the top of the page, then **New project**.
3. Give it a name, for example `chernozem-atlas`, and click **Create**.
4. Write down the **Project ID** shown under the name (for example `chernozem-atlas-471203`). It is often different from the name.

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
3. Name: `chernozem-atlas`. Click **Create and continue**.
4. Write down its email address. It looks like `chernozem-atlas@chernozem-atlas-471203.iam.gserviceaccount.com`.

### Step 5: Give it the Earth Engine role

Still in the "Create service account" form ("Grant this service account access to project"), add two roles:

- **Earth Engine Resource Viewer** (search "Earth Engine")
- **Service Usage Consumer** (search "Service Usage")

Click **Continue**, then **Done**.
If you already closed the form: go to **https://console.cloud.google.com/iam-admin/iam**, click **Grant access**, paste the service account's email, and add the same two roles.

### Step 6: Create a JSON key

1. On the service accounts page, click the service account's email.
2. Open the **Keys** tab, then **Add key** > **Create new key** > **JSON** > **Create**.
3. A file downloads (named like `chernozem-atlas-471203-1a2b3c4d5e6f.json`). This file is a password: keep it private.

### Step 7: Put the key in the project folder

1. Rename the downloaded file to **`service-account.json`**.
2. Move it into the project folder, `~/Desktop/Chernozem-APP` (the same folder as `package.json`).

Files named `service-account*.json` are never uploaded to GitHub, and the app never serves them to a browser (not even with `npm run dev -- --host`).

### Step 8: Add two lines to .env

Open `.env` (see [The settings file](#the-settings-file-env)) and fill in:

```
GEE_PROJECT_ID=chernozem-atlas-471203
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

Use your own Project ID from Step 1. Save the file.

### Step 9: Check the connection

In Terminal, in the project folder:

```
npm run gee:check
```

It checks the settings, signs in, reads the soil maps at one test point in Kharkiv oblast, analyzes one map cell there for last month (showing how many seconds each step took), then three cells side by side. It ends with either

- **`Earth Engine is ready.`** You're done; go to Step 10.
- **`NOT READY: ...`** followed by what to fix. See [If something goes wrong](#5-if-something-goes-wrong), fix it and run `npm run gee:check` again.

Google can take up to 10 minutes to apply new roles and registrations. If a step you just did is reported as missing, wait a few minutes and try again.

**Try your own place.** Add `--area=<latitude>,<longitude>,<km>` to analyze a square of that many km around a point, cut into map squares exactly like the app does. For example, a 5 km square around Poltava:

```
npm run gee:check -- --area=49.59,34.55,5
```

It prints how many squares and Earth Engine requests that takes, the time, and the lowest, middle and highest value of each reading. Start small (a few km); bigger squares take longer.

### Step 10: Restart the app

Stop the app (**Control + C**) and run `npm run dev` again. In the Atlas, **Settings > Data** now says **Earth Engine**.
Your current area is analyzed again with real data automatically (when "Analyze automatically each month" is on), starting a few seconds after the app connects. To redo it straight away, or for other saved areas, open **Settings > Data** and click **Re-run analysis**. Real runs are compared with the same months of 2021.

### The chernozem (black-soil) map

The research team's black-soil map is the Earth Engine asset `projects/zhaobo/assets/chernozem_wrb_ukraine` (already set as `GEE_CHERNOZEM_ASSET` in `.env.example`). It covers Ukraine. Your service account can read it only if the asset's owner shares it:

- The owner opens **https://code.earthengine.google.com**, finds the asset under **Assets**, clicks **Share**, and adds the service account's email as a **Reader** (or ticks "Anyone can read").

Until then, and everywhere outside Ukraine, the Atlas uses soil organic carbon (OpenLandMap) as a stand-in, and the run shows a note saying so. `npm run gee:check` tells you which one it used. To always use soil organic carbon, set `GEE_CHERNOZEM_ASSET=none` (or leave it blank).

### What Earth Engine measures

For each square of the map, for each month:

| Reading | Earth Engine dataset |
| --- | --- |
| Black-soil (chernozem) share | `projects/zhaobo/assets/chernozem_wrb_ukraine` (band b1), else `OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02` (band b0) |
| Cropland | `ESA/WorldCover/v200` (class 40) |
| Soil health and damage | `COPERNICUS/S2_SR_HARMONIZED` (Chernozem Health Index, this season vs the same months of 2021) |
| Fires | `FIRMS` (band T21), since 24 February 2022 |
| Distance to fighting | ACLED file (section 3), else `FIRMS` fires of the last 90 days |
| People | `WorldPop/GP/100m/pop` (2020) |
| Night lights | `NASA/VIIRS/002/VNP46A2` |
| Radar change alerts | `COPERNICUS/S1_GRD` (VV) |
| Place names | `FAO/GAUL/2015/level2` |

A country-sized area takes several minutes per month. The app shows progress while it works.

How the app keeps a big area from failing:

- The map squares are sent to Earth Engine in groups: up to 250 small squares at a time, fewer when the squares are big (about 100 for a country like Ukraine), and at most two groups at once.
- If Earth Engine says a group was too much work ("User memory limit exceeded" or "Computation timed out"), that group is tried once more with coarser pixels, and the run shows a note saying so.
- For a month that is not over yet, only images up to yesterday are used, and the run says so.

---

## 3. Conflict data from ACLED (optional)

Without this file, the app measures "distance to fighting" from recent fire detections, which also catch farm burning. An ACLED file gives the real front line.

1. Create a free account at **https://acleddata.com** (choose the research or public-sector access type).
2. Open the **Data Export Tool**. Pick the country (and its neighbours if the area is near a border), a date range that covers **at least the last 13 months**, and event type **Battles** (others are fine but are not used). Export as **CSV**.
3. Save the file inside the project as `server/.data/acled.csv` (that folder is never uploaded to GitHub).
4. Add to `.env`:
   ```
   ACLED_CSV_PATH=./server/.data/acled.csv
   ```
5. Run `npm run gee:check`; the ACLED line shows how many battles it found. Download a fresh export every month or two.

---

## 4. Connecting Claude (the AI)

The AI pages use the Claude API with your own API key.

1. Go to **https://console.anthropic.com** and sign in (or sign up).
2. Open **Settings > Billing** and add credit. The API is paid per use.
3. Open **Settings > API keys**, click **Create key**, name it `chernozem-atlas`, and copy the key (it starts with `sk-ant-`). You only see it once.
4. Add it to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
5. Restart the app (**Control + C**, then `npm run dev`). The AI page now answers. `npm run gee:check` also shows whether the key is set.

**Note:** a claude.ai subscription (Pro, Max, Team) is separate from the API. It does not include API usage and cannot be linked to the app; the app needs an API key from console.anthropic.com, billed there.

Optional: `CLAUDE_MODEL=` picks a different Claude model (the default is `claude-opus-5-5`).

---

## 5. If something goes wrong

What `npm run gee:check` says, and what to do:

| Message | What to do |
| --- | --- |
| `MISSING GEE_PROJECT_ID` | Step 8: add `GEE_PROJECT_ID=` with your Project ID. |
| `MISSING GOOGLE_APPLICATION_CREDENTIALS` | Steps 6 to 8: create the key, put it in the folder, add the line to `.env`. |
| `... points to ./service-account.json, but that file cannot be read` | The file is not in the project folder or has a different name. Check Step 7. |
| `... is not valid JSON` / `missing client_email or private_key` | The file is not a service-account key. Create a new JSON key (Step 6). |
| `The Earth Engine API is not enabled` | Step 2. Wait a few minutes after enabling. |
| `... is not registered for Earth Engine` | Step 3. Wait a few minutes after registering. |
| `The service account ... lacks permission` | Step 5: give it **Earth Engine Resource Viewer** and **Service Usage Consumer**. Wait a few minutes. |
| `Google rejected the service-account key` | The key was deleted or is wrong. Create a new JSON key (Step 6) and replace the file. |
| `Asset not found: projects/zhaobo/...` | The black-soil map is not shared with your service account. Ask its owner to share it ([see above](#the-chernozem-black-soil-map)), or set `GEE_CHERNOZEM_ASSET=none` in `.env` to always use soil organic carbon. The analysis still works without it. |
| `Could not reach Google Earth Engine` | Check the internet connection. |
| `Earth Engine could not finish this much work` / `did not answer in time` | Try again later, or analyze a smaller area first. |
| `Earth Engine is limiting requests` | Wait a few minutes and try again. |

To go back to sample data at any time, add `GEE_DISABLED=1` to `.env` and restart.

---

## 6. Protecting the app with an access code

On your own computer the app needs no code. Before handing it to officials (on your network or online), set an access code so only people you give it to can see the data.

1. Add a line to `.env` with a long code, for example four random words:
   ```
   ATLAS_ACCESS_CODE=river-tractor-winter-maple
   ```
2. Restart the app. Everyone now sees a small **Chernozem Atlas** card and types the code once; the browser remembers it for 30 days.
3. Share the code in person or by phone, not in the same email as the link.

Good to know:
- **Changing the code signs everyone out.** Do this when someone should no longer have access.
- **10 wrong codes** from one address lock it out for 10 minutes.
- With a code set, `npm start` answers the whole network (not just this computer). Without one it only answers this computer. To choose yourself, add `HOST=127.0.0.1` (this computer) or `HOST=0.0.0.0` (the network).
- Online, put the app behind **https** (for example Caddy, nginx or Cloudflare Tunnel); the sign-in cookie is then sent over https only. Behind such a proxy, also add `ATLAS_TRUST_PROXY=1` so the wrong-code limit counts each visitor separately.
- The code protects all the data (areas, runs, team, AI chats). The page design itself (not the data) can still be loaded without it.
