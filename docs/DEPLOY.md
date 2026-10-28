# Chernozem online: https://chernozem.app

This page explains how the public copy of Chernozem works: where it runs, what it costs, how a change goes live, how the data is kept, and what to do when something goes wrong. Nothing here is needed to run the app on your own computer (that is [CONNECT-DATA.md](CONNECT-DATA.md)).

- [1. What runs where](#1-what-runs-where)
- [2. What it costs each month](#2-what-it-costs-each-month)
- [3. One shared workspace](#3-one-shared-workspace)
- [4. Setting it up (once)](#4-setting-it-up-once)
- [5. Bringing your data (once)](#5-bringing-your-data-once)
- [6. Connecting chernozem.app (GoDaddy)](#6-connecting-chernozemapp-godaddy)
- [7. How an update goes live](#7-how-an-update-goes-live)
- [8. Changing the access code](#8-changing-the-access-code)
- [9. How the data is kept](#9-how-the-data-is-kept)
- [10. Going back (rollback)](#10-going-back-rollback)
- [11. Earth Engine: noncommercial use](#11-earth-engine-noncommercial-use)
- [12. If something goes wrong](#12-if-something-goes-wrong)

---

## 1. What runs where

| What | Where | Notes |
| --- | --- | --- |
| The app (pages and server) | **Render** (render.com), a "web service" named `chernozem`, in Ohio (US East) | Built from the GitHub repository `willpan0921/Chernozem-APP`, branch `main`. Every setting is listed in [`render.yaml`](../render.yaml) (Render applies that file only to a service made from it as a Blueprint: section 4). |
| The data | A 1 GB **disk** attached to that service, at `/var/data` | The farm, the fields' readings, the Atlas areas and months, the team, the settings, the AI chats. |
| The address chernozem.app | **GoDaddy** (where the name was bought) | GoDaddy's DNS points the name at Render. Render makes the https certificate. |
| Satellite numbers | **Google Earth Engine**, project `chernozem-danny` | Called by the server with the service account's key. |
| The AI pages | **Claude** (Anthropic) | Called by the server with your API key. |
| Weather, place search | Open-Meteo, OpenStreetMap | Free, no key. |
| Map pictures and fonts | Esri, OpenStreetMap, Google Fonts | Loaded by each visitor's browser directly. |

The private settings (the Claude key, the Earth Engine key, the access code) are typed into Render's dashboard only. They are **never** in GitHub: the repository is public, so anyone can read everything in it.

## 2. What it costs each month

| Item | Cost |
| --- | --- |
| Render web service, "Starter" (0.5 CPU, 512 MB memory) | $7.00 |
| Render disk, 1 GB | $0.25 |
| Render workspace, "Hobby" | $0. It includes 2 custom domains (chernozem.app and www.chernozem.app) and 5 GB of traffic a month; more traffic costs $0.15 per GB. A first visit downloads about 0.5 to 0.8 MB from the server (a tour of five pages about 1.6 MB), so 5 GB is a few thousand visits. |
| Claude (Anthropic) | Pay for what is used. The app uses Claude Opus 5.5: $4 per million tokens read and $20 per million written. One question in an AI chat costs roughly 2 to 20 US cents, depending on how much data it looks at. Set a monthly spending limit at console.anthropic.com. |
| Google Earth Engine | $0 for noncommercial use, within the project's monthly allowance (section 11). |
| The domain chernozem.app | GoDaddy's yearly renewal (paid separately). |

So about **$7.25 a month**, plus the AI questions people ask.

## 3. One shared workspace

The online app is **one workspace that everyone shares**:

- There is one farm, one set of Atlas areas, one team list and one set of AI chats. Everyone who has the access code sees the same data and can change or delete any of it.
- There are no personal accounts and no record of who changed what. The team list in Atlas Settings is a list of names, not logins.
- The access code is the only lock. Give it only to people who may see and change everything, in person or by phone, not in the same email as the link.
- The Field sidebar says so: "Shared with everyone who has the access code" (on your own computer, without a code, it still says "Your fields are private").
- A browser stays signed in for 30 days. On a shared computer (an office, a library), press **Sign out** at the bottom of the sidebar when you are done, so the next person needs the code again.
- Messages sent from the public website's contact page arrive in **Atlas > Settings** ("Messages from the website"), where anyone with the code can read and delete them; the server sends no e-mail, so look there.

## 4. Setting it up (once)

1. Create an account at **render.com** (the Hobby workspace is free; add a payment card for the $7 service).
2. Create the service from this repository's `render.yaml` (Render calls it a "Blueprint": **New > Blueprint**, pick the repository). Render then also applies any later change to `render.yaml` pushed to `main`.
   A service made any other way (by hand in the dashboard, or by the assistant with Render's API key) never reads `render.yaml`. It must be given every setting in that file itself: the 1 GB disk named `data` at `/var/data`, the build and start commands, the health check path, the build filter, and each setting under `envVars`. Without the disk, the data folder or a proper access code the server refuses to start (section 12) rather than lose data or open the app to everyone. Later changes to `render.yaml` must then be made on the service's pages as well. (Through the API, change one setting at a time, with the address for a single key, `/v1/services/{id}/env-vars/{key}`: a PUT to `/v1/services/{id}/env-vars` replaces the whole list, so it removes every setting it leaves out, and it deploys nothing by itself.)
3. Render asks for the four private settings (later: the service's **Environment** page):

   | Setting | What to type |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |
   | `GEE_SERVICE_ACCOUNT_JSON` | The whole Earth Engine key file, pasted as it is (open the .json file in TextEdit, select all, copy) |
   | `ATLAS_ACCESS_CODE` | A code you make up: four or more random words, or one a password manager makes. At least 16 characters. Never a code printed in a document, these included: anyone can read them. |
   | `IMPORT_TOKEN` | Only for section 5: a long random text, at least 16 characters (for example from a password manager). Remove it afterwards. |

4. The first build takes a few minutes. The app then answers at the service's own address, shown at the top of the service's page, for example `https://chernozem.onrender.com`. Open it, type the access code: the pages are empty until section 5.

The other settings are already in `render.yaml`: the Node version, the data folder (`CHERNOZEM_DATA_DIR=/var/data`), `ATLAS_TRUST_PROXY=cloudflare` (so 10 wrong codes lock out only the visitor who typed them), the Earth Engine project and `GEE_CHERNOZEM_ASSET=none`.

The server checks two things each time it starts online, and **does not start** if either is wrong (the deploy then shows as failed, and the log says why, see section 12): the access code must be set, at least 16 characters and not the example once printed in these docs; and the data folder must be the disk. So a mistake there never puts an app live that anyone can open, or that forgets its data at the next update.

## 5. Bringing your data (once)

This copies the data of the app on your Mac (the farm and its fields' readings, the 7 Atlas areas and their 84 months, the team, the settings, the states and soil types already worked out) to the online app. Your Mac's copy is only read, never changed.

1. In Render, make sure `IMPORT_TOKEN` is set (section 4).
2. On the Mac, open Terminal:
   ```
   export PATH=~/.local/node/bin:$PATH
   cd ~/Desktop/Chernozem-APP
   node scripts/export-data.js
   ```
   This only shows what would be sent (about 124 files, 31 MB) and what is left out. Nothing is sent yet.
3. Send it (use your token; before the domain works, use the onrender.com address instead):
   ```
   IMPORT_TOKEN=<the token> node scripts/export-data.js --url https://chernozem.app
   ```
   It travels in parts of about 16 MB (the online server has little memory) and ends with "Done: the server wrote 124 files."
4. In Render, **delete** `IMPORT_TOKEN` (Environment page, then **Save and deploy**). The upload address then no longer exists.
5. Only now, once the online copy has your data: if you keep running the app on your Mac, switch off its automatic updates there, or the two copies spend Earth Engine's monthly allowance (section 11) twice on the same areas and fields. On the Mac: Atlas > Settings, "Analyze every saved area automatically each month", and Field > Settings, "Update automatically". (Not before the upload: these switches travel with the data.)

Good to know:
- **Left out**: the AI chats (add `--with-chats` to bring them), the farmer's reports and photos, and your Mac's sign-in secret (the server makes its own).
- The server **refuses** an upload when it already has areas, months or a farm, so nothing is overwritten by mistake. Adding `--replace` writes the upload over the files of the same name (anything else on the server is kept). If an upload stops halfway, send it again with `--replace`.
- After the upload the two copies are separate: a change made online does not appear on your Mac, and the other way round.
- The details are at the top of `scripts/export-data.js` and `server/import.js`.

## 6. Connecting chernozem.app (GoDaddy)

**In Render** (the service's **Settings > Custom Domains**):
1. Click **Add Custom Domain** and type `chernozem.app`. Render adds `www.chernozem.app` by itself and sends it on to `chernozem.app`.
2. Render shows the two records to make. Keep that page open.

**In GoDaddy** (sign in, **My Products**, then **DNS** next to chernozem.app):
1. **Turn off forwarding**: in the **Forwarding** part of the page, delete any forwarding of the domain or of www.
2. **Remove the parking page**: delete **every** A record named `@`, whatever its value shows ("Parked", `3.33.130.190`, `15.197.148.33` or anything else; there can be two), so that after step 3 the only A record for `@` is Render's. Delete any **AAAA** record named `@` too. (With a parking record left, some visitors would reach GoDaddy's page instead, and `.app` names show them a certificate error they cannot get past.)
3. **Add an A record**: type `A`, name `@`, value `216.24.57.1` (the address Render shows; if Render shows another one, use Render's), time to live 1 hour.
4. **Point www at Render**: edit the **CNAME** named `www` (GoDaddy often has one pointing to `@`) so its value is the service's address, for example `chernozem.onrender.com` (exactly as Render shows it, without https://).
5. Save.

**Back in Render**, click **Verify** next to each domain. When it says the domain is verified, Render makes the https certificate by itself, usually within minutes (DNS changes can take up to a few hours to reach everyone).

The `.app` names only ever work over **https**: until the certificate is ready, browsers show an error page instead of the site. That is normal; wait and try again.

## 7. How an update goes live

1. A change is pushed to the `main` branch on GitHub. (A change to the docs alone, `docs/` and the `.md` files, is not deployed: nothing in the app changes.)
2. Render sees it and builds the new version (`npm ci && npm run build`, a few minutes). While it builds, the old version keeps running.
3. Render then stops the old copy and starts the new one: the site is away for a few seconds. (A service with a disk always restarts this way.)
4. Render checks `/api/health`; once it answers, the new version is live.

If the build fails, the old version simply keeps running. If the new version does not start (the log then says `Not starting online` and why: section 12), the old copy may already have stopped, so the site can be away until the setting is fixed. Watch a deploy on the service's **Deploys** and **Logs** pages; at each start the log shows `Data folder: /var/data`.

A page left open during an update reloads itself onto the new version the first time it opens another page (or says "A new version of Chernozem is live", with a Reload button).

An analysis running during an update stops; the months it finished are kept, and the monthly check starts the rest again (or press **Analyze** in Atlas Settings).

## 8. Changing the access code

1. Render > the `chernozem` service > **Environment**.
2. Edit `ATLAS_ACCESS_CODE` (at least 16 characters, made up), then **Save and deploy**. The app restarts in a few seconds.
3. Everyone is signed out and needs the new code. Do this when someone should no longer have access, or when a computer or phone that was signed in is lost: it is the only way to end every sign-in at once (Sign out ends only the one browser it is pressed in).

After changing the code, never roll back to a deploy made before the change: the old code would work again (section 10).

Never delete the access code online, or make it short: the server then refuses to start rather than let anyone on the internet see and change everything (and should that ever happen while it runs, the app stays locked for everyone). Ten wrong codes from one visitor lock that visitor out for 10 minutes.

## 9. How the data is kept

- Everything is kept as files on the 1 GB disk (`/var/data`); today it is about 32 MB. The disk keeps them through restarts and updates. Anything the app wrote anywhere else would be wiped at the next update, so the app writes only there.
- Render takes a **snapshot** of the disk every day and keeps the last seven. To go back to one: the service's **Disks** page > the snapshot > **Restore**. Everything goes back to that moment, and changes made after it are lost.
- Readings can also be downloaded from the pages: Field > Data, and Atlas > Data (CSV and GeoJSON).
- The disk can be made larger later (never smaller), on the same Disks page.

## 10. Going back (rollback)

- **A bad version of the app**: Render > the service > **Deploys**, find the last good deploy, click **Rollback**, then **Rollback to this deploy**. The site runs that version again within a few minutes. A rollback also switches off the automatic updates: once the change is undone on GitHub, switch them on again in the service's **Settings**.
- **The settings go back too.** A rollback runs that deploy with the settings it had then (the Environment page keeps showing today's, so you cannot see it there). The disk is not rolled back, so if you changed the access code (section 8) or deleted `IMPORT_TOKEN` (section 5) after that deploy, then until the next normal deploy the old code works again, the sign-ins made with it work again (for up to 30 days), and the upload address exists again. So:
  - roll back only to a deploy made after your last change on the Environment page (each **Save and deploy** shows on the Deploys page as its own deploy);
  - if the last good version is older than that, do not roll back: ask the assistant to undo the change on GitHub instead. Render deploys the undo like any update, with today's settings, and automatic updates stay on;
  - if you already rolled back past such a change, deploy again with today's settings straight away: **Manual Deploy > Deploy latest commit** once the fix is on GitHub, or **Manual Deploy > Deploy a specific commit** and pick the last good one (like a rollback, this switches automatic updates off).
- **Bad data** (something deleted by mistake): a rollback never changes the data. Restore a disk snapshot instead (section 9).

## 11. Earth Engine: noncommercial use

- The Google Cloud project `chernozem-danny` is registered for Earth Engine as **noncommercial** (research, nonprofit or government work). A public website is fine for that. Charging for the service, or using it for a business, needs a commercial Earth Engine plan first.
- Since April 2026 noncommercial projects have a **monthly computing allowance** (the Community tier gives 150 EECU-hours; the Contributor tier gives 1,000 and needs a billing account on the project). Every analysis anyone starts on chernozem.app counts, and so does the monthly update of each saved area. When it runs out, Earth Engine keeps working more slowly until the 1st of the next month. The allowance is shown in the Google Cloud console.
- If Earth Engine cannot be reached, Settings says "Not connected" and analyses wait; sample numbers are never saved for a real place.

## 12. If something goes wrong

| What you see | What to do |
| --- | --- |
| The browser says the site cannot be reached, or warns about the certificate | The DNS (section 6) or the certificate is not ready. Check Render's Custom Domains page says verified, and wait. |
| The access screen keeps refusing the code | Check `ATLAS_ACCESS_CODE` in Render: capitals and small letters count. After 10 wrong codes, wait 10 minutes. After a rollback, the app may be using the code of that older deploy (section 10): run a normal deploy. |
| The deploy failed and the log says `Not starting online` | The lines under it say what to fix. `ATLAS_ACCESS_CODE is not set` or `is shorter than 16 characters` or `is the example`: set a code you make up, at least 16 characters (Environment page, **Save and deploy**). `CHERNOZEM_DATA_DIR is not set` or `The data folder /var/data does not exist`: set `CHERNOZEM_DATA_DIR=/var/data` and make sure the service has its disk (the **Disks** page: name `data`, mount path `/var/data`). Until then the site may be away; nothing was lost, and nothing was put live open or without its disk. |
| The access screen says "The app stays locked: the access code set on the server..." | The code on the server was removed or made too short while the app ran. Set a proper one (section 8). |
| Settings says "Sample data" or "Not connected" | `GEE_SERVICE_ACCOUNT_JSON` is missing or wrong in Render: paste the whole key file again. If pasting does not work, use a Render **Secret File** instead (Environment page): name it `gee-key.json`, paste the key file into it, set `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gee-key.json` and delete `GEE_SERVICE_ACCOUNT_JSON`. |
| The AI pages say "Connect Claude" | `ANTHROPIC_API_KEY` is missing in Render. |
| The upload (section 5) says the server already has data | Nothing was written. To write over it, add `--replace`. |
| The upload says the address does not exist | `IMPORT_TOKEN` is not set in Render (or the deploy after setting it has not finished). |
