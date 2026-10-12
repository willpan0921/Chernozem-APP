# Chernozem

A satellite tool that assesses war-damaged black-soil farmland in Ukraine. The
app has two products that share one codebase and one sidebar:

- **Field** — what a farmer sees: their own farm. Overview, Fields (map),
  Notes, AI, Data, Settings.
- **Atlas** — what a regional office sees: the whole country. Overview, Atlas
  (map), AI, Data, Settings.

**This is the foundation.** Every screen from the design mockups is built and
works with placeholder data. There is no real satellite data, no real map
tiles and no real AI yet. The structure is in place so each teammate can plug
their part in without touching anyone else's files.

## How to run it

You need [Node.js](https://nodejs.org) installed (the LTS version).

Open a terminal in this folder and run:

```
npm install
npm run dev
```

- `npm install` downloads the libraries the app needs. Run it once, and again
  whenever `package.json` changes.
- `npm run dev` starts the app. It prints an address, usually
  `http://localhost:5173`. Open that address in your browser.

The page refreshes by itself whenever you save a file. To stop the app, press
`Ctrl + C` in the terminal.

`npm run build` makes the finished version in a `dist` folder, ready to put on
a web server. You do not need it while working.

## Who edits which file

| File or folder | Who | What it is |
| --- | --- | --- |
| `src/components/chat/` | Danny | The chat: thread list, bubbles, cards, input box. Used by both AI pages. |
| `src/api/chatApi.js` | Danny | Where the chat gets its reply. A fake for now; connect the real AI here. |
| `src/data/soilTypes.js` | Shirley | The list of soil types. Instructions are at the top of the file. Shown in Field → Settings. |
| `src/data/farm.js` | Anyone | Every number and sentence on the Field pages. Replace with real data here. |
| `src/data/atlas.js` | Anyone | Every number and sentence on the Atlas pages. |
| `src/data/chats.js` | Danny | The example chat conversations. |
| `src/pages/field/*` | Page owners | One file per Field page, with its own `.css` next to it. |
| `src/pages/atlas/*` | Page owners | One file per Atlas page, with its own `.css` next to it. |
| `src/styles/tokens.css` | Design | Every colour, font and spacing, defined once. |

Every file starts with a plain-English note saying what it does and who edits
it. Read that note before changing a file.

## How the app is put together

```
src/
├── main.jsx                 Starts the app and switches on page routing
├── App.jsx                  The list of pages and their web addresses
├── styles.css               Loads the shared stylesheets below
├── styles/
│   ├── tokens.css           Colours, fonts, spacing, corner radii (change here first)
│   ├── base.css             Page reset and typography
│   ├── shell.css            The sidebar and page frame
│   └── components.css       Styling for the shared building blocks
├── layout/
│   ├── AppShell.jsx         Sidebar on the left, the current page on the right
│   └── Sidebar.jsx          Logo, Field/Atlas switch, page list, account
├── config/
│   └── navigation.js        The two products and their pages (add a page here)
├── components/
│   ├── ui/                  Shared blocks: Card, Stat, Badge, Button, Tabs, Toggle...
│   └── chat/                Danny's chat blocks, used by both AI pages
├── api/
│   └── chatApi.js           Danny's file: where the chat gets its reply
├── data/
│   ├── farm.js              Placeholder data for the Field product
│   ├── atlas.js             Placeholder data for the Atlas product
│   ├── chats.js             Placeholder chat conversations
│   └── soilTypes.js         Shirley's file
└── pages/
    ├── field/               OverviewPage, FieldsPage, NotesPage, AiPage, DataPage, SettingsPage
    └── atlas/               OverviewPage, MapPage, AiPage, DataPage, SettingsPage
```

### Pages and their addresses

| Address | Page |
| --- | --- |
| `/field` | Field: Overview (My farm) |
| `/field/fields` | Field: Fields map and field detail |
| `/field/notes` | Field: Notes |
| `/field/ai` | Field: AI chat |
| `/field/data` | Field: Data (satellite readings) |
| `/field/settings` | Field: Settings |
| `/atlas` | Atlas: Recovery overview |
| `/atlas/map` | Atlas: the map (Kupiansk cluster) |
| `/atlas/ai` | Atlas: AI chat |
| `/atlas/data` | Atlas: Data archive |
| `/atlas/settings` | Atlas: Settings |

Opening `/` goes to `/field`. The browser's Back button works, and every page
can be linked to directly.

### The rules the code follows

- **Data lives in `src/data`, not in pages.** A page reads from the data file
  and draws it. To change a number or a sentence, change the data file. To
  connect real data later, replace the data file and the pages keep working.
- **Colours come from `src/styles/tokens.css`.** Pages never type a raw colour
  except inside hand-drawn pictures (the maps and chart illustrations).
- **Each page owns its own `.css` file**, and its class names start with a
  short prefix (for example `.fo-` on the Field Overview) so two pages never
  clash.
- **Shared blocks live in `src/components/ui`.** Before drawing a new card,
  button or badge, check whether one already exists there.

## Adding a page

1. Add it to the product's `pages` list in `src/config/navigation.js`. The
   sidebar updates by itself.
2. Create `src/pages/<product>/<Name>Page.jsx` and `<Name>Page.css`. Copy an
   existing page to start.
3. Add a `<Route>` for it in `src/App.jsx`.

## What is placeholder and what is real

Real and working: navigation, every layout, switching tabs and filters,
selecting fields and notes, the Near term / Postwar switch, the weight sliders,
the unit switch, sending a chat message (it gets a fake reply).

Placeholder: all numbers and text (from the mockups), the maps (drawn by hand
in SVG, not map tiles), the charts' data, the AI replies, and every Download,
Export, Save, Invite and Share button (they do nothing yet and say
"Not connected yet" when you hover).

A few pages keep small bits of data in a `const` at the top of the file,
marked `// TODO move to src/data/...`. Those are fine to leave until the real
data arrives.

## Background photos

`public/images` holds photos from an earlier version of the app. Nothing uses
them now. Several come from news sites, so delete them or replace them with
pictures the team has the rights to use before the site goes live.
