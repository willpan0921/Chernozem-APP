# Chernozem online: https://chernozem.app

This page explains how the public copy of Chernozem works: where it runs, what it costs, how a change goes live, how the data is kept, and what to do when something goes wrong. Nothing here is needed to run the app on your own computer (that is [CONNECT-DATA.md](CONNECT-DATA.md)).

- [1. What runs where](#1-what-runs-where)
- [2. What it costs each month](#2-what-it-costs-each-month)
- [3. The public demo](#3-the-public-demo)
- [4. Setting it up (once)](#4-setting-it-up-once)
- [5. Bringing your data (once)](#5-bringing-your-data-once)
- [6. Connecting chernozem.app (GoDaddy)](#6-connecting-chernozemapp-godaddy)
- [7. How an update goes live](#7-how-an-update-goes-live)
- [8. Changing the owner's key](#8-changing-the-owners-key)
- [9. How the data is kept](#9-how-the-data-is-kept)
- [10. Going back (rollback)](#10-going-back-rollback)
- [11. Earth Engine: noncommercial use](#11-earth-engine-noncommercial-use)
- [12. If something goes wrong](#12-if-something-goes-wrong)
- [13. Accounts](#13-accounts)
- [14. Contact e-mail](#14-contact-e-mail)

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
| The contact form's e-mail | The owner's own **Gmail**, chernozem.app@gmail.com (or **Resend**) | Each message is e-mailed to chernozem.app@gmail.com and kept on the disk too (section 14). |
| Map pictures and fonts | Esri, OpenStreetMap, Google Fonts | Loaded by each visitor's browser directly. |

The private settings (the Claude key, the Earth Engine key, the owner's key, the Gmail app password) are typed into Render's dashboard only. They are **never** in GitHub: the repository is public, so anyone can read everything in it.

## 2. What it costs each month

| Item | Cost |
| --- | --- |
| Render web service, "Starter" (0.5 CPU, 512 MB memory) | $7.00 |
| Render disk, 1 GB | $0.25 |
| Render workspace, "Hobby" | $0. It includes 2 custom domains (chernozem.app and www.chernozem.app) and 5 GB of traffic a month; more traffic costs $0.15 per GB. A first visit downloads about 0.5 to 0.8 MB from the server (a tour of five pages about 1.6 MB), so 5 GB is a few thousand visits. |
| Claude (Anthropic) | Pay for what is used. The app uses Claude Opus 5.5: $4 per million tokens read and $20 per million written. One question in an AI chat costs roughly 2 to 20 US cents, depending on how much data it looks at. Set a monthly spending limit at console.anthropic.com. |
| Google Earth Engine | $0 for noncommercial use, within the project's monthly allowance (section 11). |
| The contact e-mail | $0: the owner's own Gmail (or Resend's free plan). |
| The domain chernozem.app | GoDaddy's yearly renewal (paid separately). |

So about **$7.25 a month**, plus the AI questions people ask (the public demo's assistant answers at most 300 a day: section 3).

## 3. The public demo

Anyone who opens **chernozem.app/field** or **chernozem.app/atlas** without an account sees the **Ukraine demo** (the farm near Kupiansk and the Atlas areas), both products, **read-only**. No code, no sign-in. People who **register** get a workspace of their own instead (section 13).

**What a visitor can do**: look at everything, switch views, move the weights and the cutoff (in their own browser only, never saved), and ask the AI assistant a few questions.

**What a visitor cannot do**: change anything. Every change (an area, a field, a crop, a report, a photo, the team, a setting, an analysis, a search for fields) is refused with the sentence "This is the demo, so it can't be changed. Register to do this on your own land." (the pages show it with a Register button). Nothing a visitor does changes the demo's files or starts paid work.

- **The AI assistant** answers at most **8 questions per visitor**, **24 per internet address** and **300 for the whole demo** in 24 hours (the owner's Claude key pays for each one); then it says "The demo's assistant has answered enough questions for now. Register to ask about your own land." A visitor's chats live in the server's memory only, for 24 hours, and only that visitor's browser sees them (a cookie, `chernozem_demo`). Nothing they ask is written to the disk. The numbers are in `server/quotas.js`.
- **Earth Engine is never asked for the demo.** The area search gives countries only (regions need Earth Engine). A square's or a state's soil types, and the states' borders, show only where they were worked out before; elsewhere the demo says so. (Tip: as the owner, open the squares and states you want the demo to show once; they are then saved for everyone.) GeoTIFF downloads are off.
- **The place search** (OpenStreetMap) looks up at most 20 names an hour per internet address and 200 for the whole demo (typed coordinates are always fine). **The weather** is the one kept for an hour; when it runs out, Open-Meteo is asked at most once every 10 minutes for the whole demo.
- **Everyone can see the demo's data**: the farm, its reports and photos, the areas, the team's names and roles (never their e-mail addresses). Keep nothing private in it.
- A registered person who presses "Open Field" or "Open Atlas" on the website's Demo page sees the demo in that browser tab, read-only (the tab sends the header `X-Chernozem-View: demo`); their own workspace is unchanged.

**The owner's key.** `ATLAS_ACCESS_CODE` (once "the access code") is now **only the owner's key**. Nothing on the website mentions it. The owner types it once on the hidden page **https://chernozem.app/owner** (linked from nowhere); that browser is then the owner for 30 days: it edits the demo as before (both products, everything can be changed) and reads the contact messages in **Atlas > Settings**. On a shared computer press **Sign out** at the bottom of the sidebar when done. Ten wrong keys from one visitor lock that visitor out for 10 minutes.

Online the key must still be set (at least 16 characters, not the example once printed here): without it everyone could change everything, so the server refuses to start (section 12).

## 4. Setting it up (once)

1. Create an account at **render.com** (the Hobby workspace is free; add a payment card for the $7 service).
2. Create the service from this repository's `render.yaml` (Render calls it a "Blueprint": **New > Blueprint**, pick the repository). Render then also applies any later change to `render.yaml` pushed to `main`.
   A service made any other way (by hand in the dashboard, or by the assistant with Render's API key) never reads `render.yaml`. It must be given every setting in that file itself: the 1 GB disk named `data` at `/var/data`, the build and start commands, the health check path, the build filter, and each setting under `envVars`. Without the disk, the data folder or a proper owner's key the server refuses to start (section 12) rather than lose data or let everyone change everything. Later changes to `render.yaml` must then be made on the service's pages as well. (Through the API, change one setting at a time, with the address for a single key, `/v1/services/{id}/env-vars/{key}`: a PUT to `/v1/services/{id}/env-vars` replaces the whole list, so it removes every setting it leaves out, and it deploys nothing by itself.)
3. Render asks for the four private settings (later: the service's **Environment** page):

   | Setting | What to type |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |
   | `GEE_SERVICE_ACCOUNT_JSON` | The whole Earth Engine key file, pasted as it is (open the .json file in TextEdit, select all, copy) |
   | `ATLAS_ACCESS_CODE` | The owner's key (section 3), typed only at chernozem.app/owner: four or more random words you make up, or one a password manager makes. At least 16 characters. Never a key printed in a document, these included: anyone can read them. |
   | `IMPORT_TOKEN` | Only for section 5: a long random text, at least 16 characters (for example from a password manager). Remove it afterwards. |

4. The first build takes a few minutes. The app then answers at the service's own address, shown at the top of the service's page, for example `https://chernozem.onrender.com`. Open its `/owner` page and type the key: the pages are empty until section 5.
5. For the contact form's e-mail, add `GMAIL_APP_PASSWORD` (section 14). Until then the messages are kept on the disk and sent once it is set.

The other settings are already in `render.yaml`: the Node version, the data folder (`CHERNOZEM_DATA_DIR=/var/data`), `ATLAS_TRUST_PROXY=cloudflare` (so the limits per visitor, such as 10 wrong keys or the demo assistant's questions, count each visitor on their own), the Earth Engine project and `GEE_CHERNOZEM_ASSET=none`.

The server checks two things each time it starts online, and **does not start** if either is wrong (the deploy then shows as failed, and the log says why, see section 12): the owner's key must be set, at least 16 characters and not the example once printed in these docs; and the data folder must be the disk. So a mistake there never puts an app live that anyone can change, or that forgets its data at the next update.

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

## 8. Changing the owner's key

1. Render > the `chernozem` service > **Environment**.
2. Edit `ATLAS_ACCESS_CODE` (at least 16 characters, made up), then **Save and deploy**. The app restarts in a few seconds.
3. The owner is signed out everywhere and types the new key at **chernozem.app/owner**. Visitors notice nothing (the demo needs no key), and registered accounts stay signed in. Do this when a computer or phone that was signed in as the owner is lost, or when someone else learned the key: it is the only way to end every owner sign-in at once (Sign out ends only the one browser it is pressed in).

After changing the key, never roll back to a deploy made before the change: the old key would work again (section 10).

Never delete the owner's key online, or make it short: the server then refuses to start rather than let anyone on the internet change everything (and should that ever happen while it runs, nobody can sign in as the owner: everyone gets the read-only demo). Ten wrong keys from one visitor lock that visitor out for 10 minutes.

## 9. How the data is kept

- Everything is kept as files on the 1 GB disk (`/var/data`); today it is about 32 MB. The disk keeps them through restarts and updates. Anything the app wrote anywhere else would be wiped at the next update, so the app writes only there.
- Render takes a **snapshot** of the disk every day and keeps the last seven. To go back to one: the service's **Disks** page > the snapshot > **Restore**. Everything goes back to that moment, and changes made after it are lost.
- Readings can also be downloaded from the pages: Field > Data, and Atlas > Data (CSV and GeoJSON).
- The disk can be made larger later (never smaller), on the same Disks page.

## 10. Going back (rollback)

- **A bad version of the app**: Render > the service > **Deploys**, find the last good deploy, click **Rollback**, then **Rollback to this deploy**. The site runs that version again within a few minutes. A rollback also switches off the automatic updates: once the change is undone on GitHub, switch them on again in the service's **Settings**.
- **The settings go back too.** A rollback runs that deploy with the settings it had then (the Environment page keeps showing today's, so you cannot see it there). The disk is not rolled back, so if you changed the owner's key (section 8) or deleted `IMPORT_TOKEN` (section 5) after that deploy, then until the next normal deploy the old key works again, the sign-ins made with it work again (for up to 30 days), and the upload address exists again. So:
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
| The /owner page keeps refusing the key | Check `ATLAS_ACCESS_CODE` in Render: capitals and small letters count. After 10 wrong keys, wait 10 minutes. After a rollback, the app may be using the key of that older deploy (section 10): run a normal deploy. |
| The deploy failed and the log says `Not starting online` | The lines under it say what to fix. `ATLAS_ACCESS_CODE is not set` or `is shorter than 16 characters` or `is the example`: set an owner's key you make up, at least 16 characters (Environment page, **Save and deploy**). `CHERNOZEM_DATA_DIR is not set` or `The data folder /var/data does not exist`: set `CHERNOZEM_DATA_DIR=/var/data` and make sure the service has its disk (the **Disks** page: name `data`, mount path `/var/data`). Until then the site may be away; nothing was lost, and nothing was put live open or without its disk. |
| The /owner page says "Signing in as the owner is off: the owner's key set on the server..." | The key on the server was removed or made too short while the app ran (visitors still get the read-only demo). Set a proper one (section 8). |
| Contact messages do not arrive at chernozem.app@gmail.com | The log's start lines say `Contact e-mail: off` (nothing set: section 14) or `Contact e-mail: to chernozem.app@gmail.com, through Gmail`. In **Atlas > Settings** each message says whether it was sent; a failed one shows the reason (for Gmail "Invalid login": make a new app password, section 14). Look in Gmail's Spam the first time. Nothing is lost: every message is kept on the disk and tried again every 10 minutes (8 tries). |
| The demo's AI assistant says it "has answered enough questions for now" | Its daily limits (section 3). They reset as the 24 hours pass; the numbers are in `server/quotas.js`. |
| Settings says "Sample data" or "Not connected" | `GEE_SERVICE_ACCOUNT_JSON` is missing or wrong in Render: paste the whole key file again. If pasting does not work, use a Render **Secret File** instead (Environment page): name it `gee-key.json`, paste the key file into it, set `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gee-key.json` and delete `GEE_SERVICE_ACCOUNT_JSON`. |
| The AI pages say "Connect Claude" | `ANTHROPIC_API_KEY` is missing in Render. |
| The upload (section 5) says the server already has data | Nothing was written. To write over it, add `--replace`. |
| The upload says the address does not exist | `IMPORT_TOKEN` is not set in Render (or the deploy after setting it has not finished). |

## 13. Accounts

The website's **Register** page lets a person make an account (with Google, or an e-mail and password), choose who they are, and get **Field** or **Atlas** with an **empty workspace of their own**. The public demo (section 3) is untouched: both products, the same data, read-only for everyone but the owner.

**How it works**

- The sign-in itself is **Firebase Authentication** (Google's), in the project `chernozem-danny`, the same Google Cloud project as Earth Engine. Google keeps the passwords; the server never sees them.
- After the sign-in, the browser hands the server a token from Google. The server checks it with Firebase's own library and gives the browser an **account cookie** (30 days, separate from the owner's). From then on every request from that browser works in that account's own folder.
- Each account's data lives on the disk under **`/var/data/users/<id>/`** (the id is a hash of the account's Firebase id): its `profile.json` (name, e-mail, role, product, the place to watch), and the same files as the demo has (`farm.json`, `areas/`, `runs/`, `chats/`...). Nothing is copied into it: a new account starts empty. The daily disk snapshot (section 9) covers these folders; the data upload and export of section 5 leave them alone.
- An account is for **one product**: the one chosen at registration. Its Field pages cannot open Atlas data and the other way round (the server answers `wrong_product`). The demo has both.
- The monthly Atlas update and the daily Field refresh run for every account's folder too, one after the other after the demo's, inside the Earth Engine allowance (section 11). Every account's analysis waits in the same line as the demo's: one at a time for the whole server.
- Messages from the contact page are e-mailed to chernozem.app@gmail.com (section 14) and kept for the **owner's** Atlas Settings only; no account sees them.

**What one account may do** (anyone can register, so one account cannot fill the disk, hold the Earth Engine line for hours or spend the Claude key without end; the numbers are in `server/quotas.js`; the owner has none of these limits)

- Atlas: at most **5 areas**, each at most **1,000,000 km²** (a country the size of Ukraine, not Russia) and 1,500 map squares, drawn with at most 1,000 points; **one analysis at a time**, of at most **12 months**; the monthly update is **off** until the person switches it on in Settings.
- Field: **one job at a time** (a search for fields or an analysis), and at most **2 searches and 2 "update now" an hour**; outlines of at most 1,000 points; at most **30 reports** and **40 MB of photos** in all, and every photo must be a real JPEG, PNG or WebP picture of at most 8,000 pixels a side.
- The AI chat: at most **40 messages a day**.
- A limit reached answers with a plain sentence (the code `quota`; `busy` while the account's other analysis runs).

**Signing out**: "Sign out" ends every copy of that account's cookie at once (the moment is kept in the account's `session.json`) and ends its Firebase sessions. The server also asks Firebase once an hour whether each signed-in account still exists, so an account deleted or disabled in the Firebase console is signed out within the hour. If Firebase cannot be asked (an outage, or a computer without the Google key), the last answer stays good for a day, then the person signs in again.

**What you must do once (the owner, in the Firebase console)**

Registration is **not open** until Firebase Authentication is switched on for the project. Until then the Register page says "Registration is not open yet" and offers the demo and the contact page.

1. Open https://console.firebase.google.com, project **chernozem-danny**.
2. Left menu: **Build > Authentication**, then **Get started**.
3. **Sign-in method** tab: enable **Email/Password**, then enable **Google** (it asks for a support e-mail: yours).
4. **Settings** tab > **Authorized domains**: add **chernozem.app** (and **www.chernozem.app**). Without this Google's pop-up refuses the site.
5. Nothing to change in Render: the server uses the Earth Engine key it already has (same project) and the project id from `GEE_PROJECT_ID`. To use another Firebase project, set `FIREBASE_PROJECT_ID` on the Environment page; `FIREBASE_PROJECT_ID=off` switches registration off.

The server also needs the `firebase-admin` package in `package.json` (`npm install firebase-admin`); without it, registration answers "not open yet" and the log says so at the first sign-in.

**Trying it on your own computer without Google**: install the Firebase tools once (`npm install -g firebase-tools`), run `firebase emulators:start --only auth --project chernozem-danny` (port 9099), and put `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in `.env` and `VITE_FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099` for the pages. Accounts made there exist only on your computer. Never set the emulator address online.

**Signing everyone out at once** (accounts and the owner): delete `auth.json` on the disk (the sign-in secret's salt; the server makes a new one at once). Changing the owner's key (section 8) signs out the owner only.

**Removing an account**: delete its folder under `/var/data/users/` (the person can register again and starts empty) and, in the Firebase console, the user under Authentication > Users (its cookies stop working within the hour; or the person deletes it themselves in the app, when that exists).

## 14. Contact e-mail

Every message sent from **chernozem.app/contact** is e-mailed to **chernozem.app@gmail.com**, from the owner's own Gmail account. It is also kept on the disk (`messages/`), so nothing is lost before the e-mail is set up or while Gmail is away: **Atlas > Settings** (as the owner) lists every message with whether it was sent. A message not sent yet is tried again 20 seconds after each start, then every 10 minutes (oldest first, 8 tries each). The e-mail is plain text: the name, e-mail, organisation and role, the message, when it came and its id; pressing **Reply** answers the visitor (when their address is a plain one).

**What the owner does once (Gmail, about 5 minutes)**

1. Sign in to Google as **chernozem.app@gmail.com**.
2. If needed, turn on **2-Step Verification** for that account (Google account > **Security** > **2-Step Verification**). App passwords exist only with it on.
3. Open **https://myaccount.google.com/apppasswords**, type the name **Chernozem**, press **Create**.
4. Google shows a password of **16 letters** (in four groups). Copy it. It is shown only once.
5. **Render** dashboard > the **chernozem** service > **Environment** > **Add Environment Variable**: key `GMAIL_APP_PASSWORD`, value the 16 letters (the spaces may stay or go), then **Save and deploy**. Render restarts the app in a few seconds.
6. Check: the service's **Logs** show `Contact e-mail: to chernozem.app@gmail.com, through Gmail.` at the start. Send a message from chernozem.app/contact: it arrives within seconds (look in **Spam** the first time and mark it "Not spam"). Messages that came earlier are sent within a minute of the restart.

Changing the Google account's password ends its app passwords: then make a new one (steps 3 to 5). If Gmail refuses ("Invalid login" in Atlas Settings), do the same.

**Instead of Gmail: Resend** (resend.com, an e-mail service with a free plan)

1. Make a Resend account **with chernozem.app@gmail.com** (its test sender, onboarding@resend.dev, only delivers to the address the account was made with).
2. Resend > **API Keys** > **Create API Key**, name it **Chernozem**, sending access only. Copy the key (it starts with `re_`).
3. Render > **chernozem** > **Environment** > add `RESEND_API_KEY` with the key, then **Save and deploy**. The log then says `through Resend`.
4. Optional: to send from the site's own address, add **chernozem.app** under Resend > **Domains** (it gives DNS records to add at GoDaddy, section 6), then set `MAIL_FROM`, for example `Chernozem website <contact@chernozem.app>`.

Gmail wins when both are set. **Other settings**, all optional: `MAIL_TO` (where messages go; default chernozem.app@gmail.com), `GMAIL_USER` (the Gmail account that sends; default `MAIL_TO`), `MAIL_FROM`, and for any other mail server `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (used when no Gmail password is set). The code is `server/mail.js` and `server/messages.js`; `.env.example` lists the settings.
