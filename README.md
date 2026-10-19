# Chernozem

Chernozem turns free satellite data into decisions about farmland, for any place on Earth. It has two products that share one codebase, one server and one sidebar:

- **Field**, for a farmer. Type a place, paste coordinates or draw your land, and the app **finds your fields** in the satellite images. Every field is then measured from real data: plant health, water in the plants, stress with its likely cause, pest and disease risk from the weather, harvest readiness, the crop it grows, damage and soil. Pages: Overview, Fields (map), AI, Data, Settings.
- **Atlas**, for a regional office, a ministry or a funder. Pick a region or a country, and the app scores every map square on **soil value**, **damage** and **safe access**, then ranks where restoration should start, now and after the war. Pages: Overview, Atlas (map), AI, Data, Settings, and a printable report.

The data comes from Google Earth Engine (Sentinel-2, Sentinel-1, NASA FIRMS, ESA WorldCover and more) and Open-Meteo weather. The AI pages use Claude and answer from the app's own data. The method follows the owner's research on war-damaged black soil in Ukraine ([Harvard Dataverse, doi:10.7910/DVN/IYXPVS](https://doi.org/10.7910/DVN/IYXPVS)). Ukraine is the case study, not a limit: seasons follow each place's own calendar, and war rules apply only where a known war covers the land.

**How every number is measured, with its dataset, formula, update frequency and limits: [docs/METHODS.md](docs/METHODS.md).**

## How to run it

You need [Node.js](https://nodejs.org) (the LTS version). On this Mac Node lives in a private folder, so first run this once per Terminal window:

```
export PATH=~/.local/node/bin:$PATH
```

Then, in the project folder:

```
npm install      # once, and again whenever package.json changes
npm run dev      # starts the app at http://localhost:5173
```

Open **http://localhost:5173**. The Field product opens first; the Atlas is at **/atlas**. The page refreshes by itself when a file is saved. To stop, press **Control + C** in the Terminal.

Without any settings the app runs on **sample data** (pages show a "Sample data" badge), so it can be tried straight away.

### Example farms

In Field, the farm setup has a quiet row **"Try an example: Ukraine · Iowa · Argentina"**. Each loads a farm of real field outlines and analyses it at once (on real satellite data when Earth Engine is connected). The fields start with no crop: the app detects each one, as it would on your own farm.

| Example | Where | Fields |
| --- | --- | --- |
| Ukraine (default) | Near Kupiansk, Ukraine (close to the front line) | 7, drawn by hand (`scripts/fields.geojson`) |
| Iowa | Near Ames, Iowa, USA (corn and soybean) | 17, found by the app (`server/field/examples/iowa.geojson`) |
| Argentina | Near Chivilcoy, Argentina (southern hemisphere) | 18, found by the app (`server/field/examples/argentina.geojson`) |

The same is available to scripts: `POST /api/farm/demo` with `{ "example": "ukraine" | "iowa" | "argentina" }`. Loading an example replaces the current farm.

To run it for other people:

```
npm run build    # makes the finished app in dist/
npm start        # serves dist/ and the API at http://localhost:8787
```

Set an access code first (see below).

## Connect Earth Engine and Claude

Everything goes into one private settings file, `.env` (copy it from `.env.example`). The step-by-step guide, with every error message and its fix, is **[docs/CONNECT-DATA.md](docs/CONNECT-DATA.md)**. In short:

| To turn on | Add to `.env` | Check |
| --- | --- | --- |
| Real satellite data | `GEE_PROJECT_ID=`, `GOOGLE_APPLICATION_CREDENTIALS=` (full path to the service-account key, kept outside the project folder), `GEE_CHERNOZEM_ASSET=none` | `npm run gee:check` ends with "Earth Engine is ready." |
| The AI | `ANTHROPIC_API_KEY=` (from console.anthropic.com) | Settings > AI says Connected |
| Real front lines (optional) | `ACLED_CSV_PATH=` | `npm run gee:check` shows the battles found |
| An access code (before sharing) | `ATLAS_ACCESS_CODE=` | A sign-in card appears |

Weather (Open-Meteo) and place search (OpenStreetMap) need no key. `GEE_DISABLED=1` switches back to sample data. Restart `npm run dev` after changing `.env`.

## Where the data lives

The server keeps everything in `server/.data/` (never uploaded to GitHub): the farm and its fields, each field's latest analysis and monthly history, the farmer's reports and photos, the Atlas areas and monthly runs, the team and the AI chats. `CHERNOZEM_DATA_DIR` points the server elsewhere (used for testing on a copy, see CONNECT-DATA section 8). Deleting the folder starts the app fresh.

## How the code is organised

```
src/                      the app in the browser (React + Vite, plain CSS)
├── App.jsx               the pages and their web addresses
├── config/               navigation, the known wars (conflicts.js), the research results
├── lib/
│   ├── field/            the Field method (method.js, crops.js), formatting, map geometry
│   ├── atlas/            the Atlas method (method.js, scoring.js), hotspots, overview steps
│   ├── season.js         growing seasons for any place on Earth
│   └── chat/             chat helpers
├── state/                FieldData.jsx and AtlasData.jsx: the data every page shares
├── api/                  calls to the server (fieldApi.js, atlasApi.js, chatApi.js)
├── components/           field/, atlas/, chat/ and ui/ building blocks
├── pages/field/, pages/atlas/   one .jsx and one .css per page
├── data/                 fixed wording: chat text (chats.js) and soil types (soilTypes.js)
└── styles/               tokens.css (every colour, font and spacing), base, shell, components
server/                   the Node server: API, jobs, scheduler, store
├── field/                Field routes, analysis, weather, place search, exports, example farms (examples/)
├── providers/            data sources: gee.js and field-gee.js (Earth Engine),
│                         sample.js and field-sample.js (sample data), fake-ee.js (test stand-in)
└── ai/                   the Claude chat and what it knows (context.js, field-context.js)
scripts/                  gee-check.js, the Ukraine example farm's outlines (fields.geojson), Danny's Firestore scripts
docs/                     METHODS.md, CONNECT-DATA.md
```

| Address | Page |
| --- | --- |
| `/field` | Field Overview: status, what needs doing, your fields, "Tell us what happened" |
| `/field/fields` | Fields map with the four tiles per field (`?field=<id>` selects one) |
| `/field/ai` | Field AI chat |
| `/field/data` | History since 2019, satellite passes, downloads |
| `/field/settings` | Farm, fields and crops, units, Earth Engine, AI |
| `/atlas` | Atlas Overview: totals, top areas, next steps, budget |
| `/atlas/map` | The map with priority, damage and access layers, and the weights |
| `/atlas/ai` | Atlas AI chat |
| `/atlas/data` | Month-by-month history, comparisons, downloads, research checks |
| `/atlas/settings` | Area, data source, schedule, team, AI |
| `/atlas/report` | Printable report |

### The rules the code follows

- **Every rule in one place.** Thresholds and formulas live in `src/lib/field/method.js`, `src/lib/field/crops.js`, `src/lib/atlas/method.js` and `src/lib/atlas/scoring.js`, with tests. The server, the pages and the Earth Engine code all use them, so they can never disagree.
- **No invented numbers.** A page shows only what the server measured (Earth Engine, Open-Meteo) or what the user typed. Sample data is always labelled.
- **Plain-English headers.** Every file starts with `WHAT THIS FILE DOES` and `WHO EDITS IT`. Read it before changing a file.
- **Colours come from `src/styles/tokens.css`.** Each page owns its own `.css` file, and its class names start with a short prefix (for example `.fo-` on the Field Overview).
- **No new libraries** without the team agreeing; never commit `.env`, keys or `server/.data`.

## Who edits which file

| File or folder | Who | What it is |
| --- | --- | --- |
| `src/components/chat/`, `src/api/chatApi.js` | Danny | The chat screens used by both AI pages |
| `scripts/fetch-ndvi.js`, `scripts/seed-fields.js` | Danny | Firestore NDVI scripts (the app itself no longer uses Firestore) |
| `scripts/fields.geojson` | Danny | The Ukraine example farm's 7 real field outlines |
| `server/field/demo.js`, `server/field/examples/*.geojson` | Whoever changes the example farms | The three example farms (Ukraine, Iowa, Argentina) |
| `src/data/soilTypes.js` | Shirley | Soil type names and descriptions |
| `src/data/chats.js` | Danny, or whoever changes the chat wording | Starter questions, report kinds, the "Connect Claude" card |
| `src/lib/field/method.js`, `src/lib/field/crops.js` | Whoever changes the Field method | Every Field rule; a change applies to every analysis from then on |
| `src/lib/atlas/method.js`, `src/lib/atlas/scoring.js` | Whoever changes the research method | Every Atlas rule; saved runs keep their numbers |
| `src/lib/season.js`, `src/config/conflicts.js` | Whoever changes seasons or adds a war | Seasons by place; the known wars and their areas |
| `src/config/research.js` | Whoever publishes new validation results | "How we know it works" |
| `server/providers/gee.js`, `server/providers/field-gee.js` | Whoever changes how satellite data is measured | Earth Engine code; keep it in step with the method files |
| `src/pages/field/*`, `src/pages/atlas/*` | Page owners | One page each, with its own `.css` |
| `src/styles/tokens.css` | Design | Colours, fonts, spacing |
| `docs/METHODS.md` | Whoever changes a method file | Must describe the same rules as the code |
| Everything else in `server/` | Nobody, normally | Routes, jobs, store, scheduler, auth |

## Testing

```
npm test           # every *.test.js in src/lib and server (node:test), no network needed
npm run build      # checks the app builds
npm run gee:check  # real Earth Engine: settings, sign-in and a small analysis
npm run gee:check -- --area=42.03,-93.62,40   # any place on Earth (lat, lon, km)
```

- The tests run the whole Earth Engine code against a stand-in (`server/providers/fake-ee.js`), the AI against a mock client, and the method files as plain functions. Keep `npm test` green before every commit.
- To try a change on **real** Earth Engine without touching the live data, run a second server on a copy of `server/.data` with `GEE_DISABLED=` empty: see [CONNECT-DATA section 8](docs/CONNECT-DATA.md#8-for-developers-testing-earth-engine-without-touching-the-live-data).
- Check pages at 1280 px and 420 px wide with no console errors.
