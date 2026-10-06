# Chernozem Field

The farmer-facing part of Chernozem, a satellite tool that assesses war-damaged
farmland in Ukraine. Someone searches for a field and sees information about it.

**This is a skeleton.** There is no real data, no real search and no working AI
yet. The structure is in place so each teammate can plug their part in.

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

## Who edits which file

Each teammate works in one file and does not need to touch the others.

| File | Who | What it is |
| --- | --- | --- |
| `src/components/ChatPanel.jsx` | Danny | The chat panel: the bubbles and the input box. |
| `src/api/chatApi.js` | Danny | Where the chat gets its reply. It is a fake for now; connect the real AI here. |
| `src/data/soilTypes.js` | Shirley | The list of soil types. Instructions are at the top of the file. |
| `src/config/tiles.js` | Anyone | The titles and order of the 6 tiles on the Field page. |

Every file starts with a plain-English note saying what it does and who edits it.

## What is in the app

- **Home**: a large field photo with the app name, a search box and a Search
  button on top, then a "How it works" section. Searching opens the Field page
  and shows whatever was typed as the field name. The background
  photo changes on every refresh. The photos are in `public/images` and are
  listed in `src/config/photos.js`. The Field page uses the same photo.
- **Field**: the field name, a link back to Home, six tiles and the chat panel.
  The Soil Type tile shows the first entry in `src/data/soilTypes.js`. The other
  tiles say "Coming soon".
- **Atlas**: a placeholder for the Chernozem Atlas.

## Folder structure

```
chernozem-field/
├── README.md               This file
├── package.json            The libraries the app uses and the run commands
├── vite.config.js          Settings for Vite, the tool that runs the app
├── index.html              The single web page the app loads into
├── public/images/          Background photos
└── src/
    ├── main.jsx            Starts the app
    ├── App.jsx             Navigation bar; decides which page is showing
    ├── styles.css          All the styling
    ├── pages/
    │   ├── HomePage.jsx    Home screen
    │   ├── FieldPage.jsx   Field page
    │   └── AtlasPage.jsx   Atlas page
    ├── components/
    │   ├── Tile.jsx        One tile
    │   └── ChatPanel.jsx   Danny's file
    ├── api/
    │   └── chatApi.js      Where the chat gets its reply (a fake for now)
    ├── data/
    │   └── soilTypes.js    Shirley's file
    ├── config/
    │   ├── tiles.js        Tile titles and order
    │   └── photos.js       List of background photos
    └── utils/
        └── photoColor.js   Picks a colour from the background photo
```

## Background photos

The photos are in `public/images`. To add one, put the picture file in that
folder and add its name to the list in `src/config/photos.js`.

Several of the current photos come from news sites. This repo is public, so
replace them with pictures the team has the rights to use before the site
goes live.

## Known limits of the skeleton

- Pages are switched without a routing library, so the browser's Back button and
  links to a specific field do not work yet.
- The chat replies with a placeholder answer. No real AI is connected.
