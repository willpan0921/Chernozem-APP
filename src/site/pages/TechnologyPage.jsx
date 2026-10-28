// WHAT THIS FILE DOES
// The website's "Technology" page (chernozem.app/technology): what the app
// is built on, and how far its numbers can be trusted. In order:
//   1. the hero
//   2. how it is built: a moving diagram of the browser, the Node server,
//      Google Earth Engine, Claude and Open-Meteo, then the stack and the
//      hosting
//   3. what it is written in: lines of code, tests, files
//   4. what it reads: the fifteen datasets
//   5. one month of Ukraine: the analysis pipeline, step by step
//   6. reliability: the checks against Copernicus, the USDA and ACLED, and
//      where it reads low
//   7. security and privacy
//   8. the code, public on GitHub, and the invitation to open the app
//
// WHO EDITS IT
// Whoever works on the website. Numbers come from src/site/content/site.js;
// every other fact here is in docs/DEPLOY.md, docs/METHODS.md, render.yaml,
// server/auth.js, server/web.js, server/jobs.js, server/providers/gee.js and
// server/ai/chat.js. Keep the words in step with those files.

import { Link } from "react-router-dom";
import PageHero from "../components/PageHero.jsx";
import SplitWords from "../components/SplitWords.jsx";
import Shot from "../components/Shot.jsx";
import { Arrow, CountUp, Magnetic, Reveal, Spotlight, Stagger, StaggerItem, motion, useReducedMotion } from "../components/motion.jsx";
import { Code2, Server, Satellite, Map as MapIcon, Sparkles, Zap, Cpu, ShieldCheck, ShieldAlert, Globe2, BookOpen, Database, Eye, Clock, TestTube2, CheckCircle2, ArrowUpRight } from "../components/Icons.jsx";
import { DATASETS, LINKS, NUMBERS, SITE, STACK, compactHa, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

const EASE = [0.22, 1, 0.36, 1];

// Lines of code, measured on the repository on 2026-10-27 with `git
// ls-files` (tests, data and the lockfile left out); the page says "about".
const LANGUAGES = [
  { name: "JavaScript", note: "Node on the server, React (JSX) in the browser", lines: 47003 },
  { name: "CSS", note: "the app and this website", lines: 10808 },
  { name: "HTML", note: "one page: index.html", lines: 43 },
];
const CODE = { testLines: 19656, testFiles: 61, serverFiles: 38, clientFiles: 95, firstCommit: "11 September 2026" };
const CODE_LINES = LANGUAGES.reduce((sum, l) => sum + l.lines, 0);

const STACK_ICONS = { "React 19": Code2, "Node.js": Server, "Google Earth Engine": Satellite, Leaflet: MapIcon, Claude: Sparkles, Vite: Zap };

// Where it runs (docs/DEPLOY.md, render.yaml).
const HOSTING = [
  { name: "Render, Ohio", icon: Cpu, what: "One small web service (0.5 CPU, 512 MB) with a 1 GB disk for the data. Every push to the main branch is built and goes live once /api/health answers; the disk is snapshotted daily." },
  { name: "Cloudflare and https", icon: ShieldCheck, what: "Every request passes Cloudflare's edge on its way to Render. chernozem.app answers only over https, with a certificate Render makes and renews by itself." },
  { name: "Straight to the browser", icon: Globe2, what: "Esri's World Imagery tiles and the Google Fonts are loaded by each visitor's browser directly. The server only ever sends the app and its own JSON answers." },
];

// One month of Ukraine on Earth Engine (server/jobs.js, server/providers/
// gee.js, docs/METHODS.md "Same code, same answer?").
const MONTH_STEPS = [
  {
    title: `Cut the country into ${formatInt(NUMBERS.ukraineSquares)} squares`,
    text: "Each square finds its own growing season from its greenest month in 2019 to 2021 (MODIS), and squares that share a season are measured together, so the same code works in Ukraine, Kenya or Iowa.",
  },
  {
    title: "Ask Earth Engine in groups, through one queue",
    text: "Squares go out in groups of up to 250, at most two groups at a time, every request with its own five-minute limit. The whole server runs one Atlas analysis at a time; a person's request goes ahead of the monthly backlog.",
  },
  {
    title: "A farmer's field goes first",
    text: "Whenever Field is analysing a farm or searching for a region, the Atlas holds its next request until that work has been quiet for three seconds (ten minutes at most), and the page says “Waiting for farm analyses and searches to finish”.",
  },
  {
    title: "Stay signed in; try again, lighter",
    text: "The hour-long sign-in token is renewed before every request. When Earth Engine's servers are full, a request goes again after 5 s, then lighter after 20 s; when the project is busy, after 40 s and 80 s. A group that is too big is split in two with the same pixels, so the totals do not move.",
  },
  {
    title: "Fire maths on a 1 km grid",
    text: "For small areas with fine pixels, the 5 km fire smoothing and the distance to fighting are worked out on a 1 km grid, the size of a FIRMS fire detection. Before that, one month of a 1,200 km² box ran over 30 minutes and failed.",
  },
  {
    title: `${NUMBERS.ukraineMonthMinutes} minutes for a full month`,
    text: "Real runs of Ukraine took 2 min 37 s to 3 min 38 s a month. Twelve months are analysed in a row, the latest first, and the progress bar names the month it is on.",
  },
  {
    title: "Saved once, never run twice",
    text: "Every month is saved as its own file on the disk. A job skips the months that already have a run; a month that fails is reported by name, and running the job again fills in only that one.",
  },
  {
    title: "Same code, same answer",
    text: "Pixel sizes, date windows and the fire sample's seed are fixed, and no cell reading uses Earth Engine's “best effort” rescaling: every pixel size is fixed by the app (the one exception decides whether an ERA5 day was snowy or frozen, at 11 km). Two runs of the same month, one after the other, gave the same heavy-damage total to the hectare.",
  },
];

// The three Copernicus Emergency Management Service maps the disaster
// methods were checked against (docs/METHODS.md "Natural disasters").
const [greeceLow, greeceHigh] = NUMBERS.greeceFloodOfficial.split(" to ").map((s) => Number(s.replace(/,/g, "")));
const greeceCentral = (greeceLow + greeceHigh) / 2;
const COPERNICUS = [
  { event: "Thessaly flood", place: "Greece", when: "September 2023", map: "EMSR692", what: "cropland hit", app: NUMBERS.greeceFloodHa, ref: greeceCentral, refText: `${formatInt(greeceCentral)} (${NUMBERS.greeceFloodOfficial})` },
  { event: "Punjab flood", place: "Pakistan", when: "August 2025", map: "EMSR838", what: "cropland hit", app: NUMBERS.pakistanFloodHa, ref: NUMBERS.pakistanFloodOfficial, refText: formatInt(NUMBERS.pakistanFloodOfficial), note: "reads low: most of the flood was on rice paddies" },
  { event: "Yambol wildfire", place: "Bulgaria", when: "July 2024", map: "EMSR738", what: "land burned", app: NUMBERS.bulgariaFireHa, ref: NUMBERS.bulgariaFireOfficial, refText: formatInt(NUMBERS.bulgariaFireOfficial) },
];

// 12151 against 13800 -> "−11.9%"
function percentOff(app, ref, decimals = 1) {
  const d = (app / ref - 1) * 100;
  return `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(decimals)}%`;
}

const LIMITS = [
  { icon: ShieldAlert, title: "Very large floods read low.", text: "The 2024 Lower Big Sioux flood in Iowa came out at 37% of the USDA's figure: satellite revisits miss the peak, and flooded tall crops brighten on radar instead of darkening." },
  { icon: ShieldAlert, title: "Floods on rice land read low.", text: "On paddies a flood counts only where the radar sees the water deeper than the field's normal, so the Punjab flood read about 18% low." },
  { icon: ShieldAlert, title: "Storm, earthquake and landslide damage is provisional.", text: "Checked on one landslide event only, where it found a fraction of the mapped slides. Every run and page of such an area says so." },
  { icon: ShieldAlert, title: "Without an ACLED file, feasibility can be rough.", text: "Fighting is then inferred from unusual fires. Where none look like a front line, the app says “not measured” and sets nothing aside, rather than guessing." },
  { icon: ShieldCheck, title: "It never declares land safe.", text: "Mines leave no satellite signature. Feasibility is a distance to fighting, and clearance is for certified deminers and local authorities." },
];

// docs/DEPLOY.md sections 3, 4, 8, 9 and 11; server/auth.js; server/web.js;
// server/store.js; server/ai/chat.js.
const SECURITY = [
  { icon: ShieldCheck, title: "One access code, and nothing else to remember.", text: "Online it must be at least 16 characters, and the server refuses to start without one. The code and the API keys are typed into Render's dashboard only; they are never in the public repository." },
  { icon: Clock, title: "A signed cookie for 30 days.", text: "After the right code the browser gets an HttpOnly, Secure, SameSite cookie carrying an expiry and a signature only this server can make. Changing the code signs everyone out at once." },
  { icon: ShieldAlert, title: "Ten wrong codes per visitor per ten minutes.", text: "Then that visitor waits. Codes and signatures are compared in constant time, so timing gives nothing away; behind Cloudflare, each visitor is told apart by the address Cloudflare reports." },
  { icon: Globe2, title: "Safety headers on every answer.", text: "X-Content-Type-Options nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy strict-origin-when-cross-origin, and Strict-Transport-Security for a year over https." },
  { icon: Eye, title: "No personal accounts, no tracking.", text: "The online app is one workspace that everyone with the code shares. There is no analytics script on any page, and no record of who changed what." },
  { icon: Database, title: "The data stays on the server's own disk.", text: "Everything is plain JSON files on the 1 GB disk at /var/data, written safely and snapshotted daily (the last seven kept). Readings can be downloaded as CSV and GeoJSON at any time." },
  { icon: Sparkles, title: "The AI answers only from the user's data.", text: "Its instructions begin: use only the facts in the context block and the tools; if something is not in the data, say so. It never says land is safe or free of mines." },
  { icon: Satellite, title: "Earth Engine under a noncommercial licence.", text: "The Google Cloud project is registered for noncommercial use, which a public website qualifies for. Charging for the service would need a commercial plan first." },
];

// ---------- The diagram ----------

// A box in the diagram: a title and a few lines under it.
function Node({ x, y, w, h, title, lines, main = false }) {
  return (
    <g className={`arch-node${main ? " is-main" : ""}`}>
      <rect x={x} y={y} width={w} height={h} rx="14" />
      <text x={x + 18} y={y + 30}>
        {title}
      </text>
      {lines.map((line, i) => (
        <text key={line} className="sub" x={x + 18} y={y + 52 + i * 16}>
          {line}
        </text>
      ))}
    </g>
  );
}

// The links the dots travel along: the corners of each line, in the
// diagram's own units. A sage dot is a request; a warm one is an answer.
const LINKS_XY = {
  browserServer: [
    [260, 160],
    [332, 160],
  ],
  esriBrowser: [
    [142, 256],
    [142, 216],
  ],
  serverEe: [
    [572, 130],
    [608, 130],
    [608, 71],
    [644, 71],
  ],
  serverClaude: [
    [572, 181],
    [644, 181],
  ],
  serverMeteo: [
    [572, 232],
    [608, 232],
    [608, 291],
    [644, 291],
  ],
};

const pointsOf = (points) => points.map(([x, y]) => `${x},${y}`).join(" ");

// A dot that travels along a link, again and again: a CSS motion path
// (offset-path, the keyframes "arch-travel" in pages.css), which moves it
// for the first 60% of each cycle and keeps it unseen for the rest. Under
// reduced motion it simply sits in the middle of the link. A browser
// without motion paths shows it still, at the start of the link.
function Dot({ points, warm = false, reverse = false, delay = 0, cycle = 4 }) {
  const reduced = useReducedMotion();
  const pts = reverse ? [...points].reverse() : points;
  const className = `arch-dot${warm ? " is-warm" : ""}`;
  if (reduced) {
    const mid = pts[Math.floor(pts.length / 2)];
    return <circle className={className} cx={mid[0]} cy={mid[1]} r="4.5" />;
  }
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return <circle className={`${className} is-moving`} cx={pts[0][0]} cy={pts[0][1]} r="4.5" style={{ offsetPath: `path("${d}")`, animationDuration: `${cycle}s`, animationDelay: `${delay}s` }} />;
}

function Architecture() {
  return (
    <div className="arch">
      <svg viewBox="0 0 900 360" role="img" aria-label="How Chernozem is built: the browser talks to the Node.js server over https; the server talks to Google Earth Engine, the Claude API and Open-Meteo; Esri's map tiles go straight to the browser.">
        <title>How Chernozem is built</title>
        <polyline className="arch-link" points={pointsOf(LINKS_XY.browserServer)} />
        <polyline className="arch-link" points={pointsOf(LINKS_XY.esriBrowser)} />
        <polyline className="arch-link" points={pointsOf(LINKS_XY.serverEe)} />
        <polyline className="arch-link" points={pointsOf(LINKS_XY.serverClaude)} />
        <polyline className="arch-link" points={pointsOf(LINKS_XY.serverMeteo)} />
        <text className="arch-link-label" x="296" y="150" textAnchor="middle">
          https
        </text>
        <text className="arch-link-label" x="622" y="100" textAnchor="middle" transform="rotate(-90 622 100)">
          service account
        </text>

        <Node x={24} y={104} w={236} h={112} title="Browser" lines={["React 19, one page, never reloads", "Leaflet maps on Esri imagery", "phone or desk, nothing to install"]} />
        <Node x={24} y={256} w={236} h={68} title="Esri World Imagery" lines={["map tiles, straight to the browser"]} />
        <Node x={332} y={90} w={240} h={150} main title="Node.js 24 server" lines={["the API: JSON over https", "the monthly check, every 6 hours", "the job queue: one Atlas analysis", "at a time, farmers' fields first", "JSON files on a 1 GB disk", "Render, Ohio, behind Cloudflare"]} />
        <Node x={644} y={28} w={232} h={86} title="Google Earth Engine" lines={["Sentinel-1 and -2, FIRMS and more", "petabytes, computed server-side"]} />
        <Node x={644} y={138} w={232} h={86} title="Claude API" lines={["claude-opus-5-5", "answers only from the user's data"]} />
        <Node x={644} y={248} w={232} h={86} title="Open-Meteo" lines={["weather forecasts; OpenStreetMap", "for place search; free, no key"]} />

        <Dot points={LINKS_XY.browserServer} delay={0} cycle={3.2} />
        <Dot points={LINKS_XY.browserServer} warm reverse delay={1.9} cycle={3.2} />
        <Dot points={LINKS_XY.serverEe} delay={0.6} cycle={4.4} />
        <Dot points={LINKS_XY.serverEe} warm reverse delay={3.3} cycle={4.4} />
        <Dot points={LINKS_XY.serverClaude} delay={1.2} cycle={3.6} />
        <Dot points={LINKS_XY.serverClaude} warm reverse delay={3.1} cycle={3.6} />
        <Dot points={LINKS_XY.serverMeteo} delay={1.6} cycle={4.8} />
        <Dot points={LINKS_XY.esriBrowser} warm delay={0.9} cycle={4} />
      </svg>
      <div className="arch-legend" aria-hidden="true">
        <span>
          <i /> a request
        </span>
        <span>
          <i className="is-warm" /> an answer
        </span>
      </div>
      <div className="arch-mobile">
        <div>
          <b>Browser</b>
          <span>React 19, one page that never reloads; Leaflet maps on Esri imagery. A phone or a desk, nothing to install.</span>
        </div>
        <div>
          <b>Node.js 24 server</b>
          <span>The API (JSON over https), the monthly check every 6 hours, the job queue (one Atlas analysis at a time, farmers&apos; fields first) and the data as JSON files on a 1 GB disk. On Render in Ohio, behind Cloudflare.</span>
        </div>
        <div>
          <b>Google Earth Engine</b>
          <span>Sentinel-1 and -2, FIRMS and the other datasets, computed server-side over petabytes; the server signs in with a service account.</span>
        </div>
        <div>
          <b>Claude API</b>
          <span>claude-opus-5-5, answering only from the user&apos;s own data.</span>
        </div>
        <div>
          <b>Open-Meteo and OpenStreetMap</b>
          <span>Weather forecasts and place search, called by the server; free, no key.</span>
        </div>
        <div>
          <b>Esri World Imagery</b>
          <span>The map tiles, loaded by the browser directly.</span>
        </div>
      </div>
    </div>
  );
}

// ---------- The page ----------

function LanguageBars() {
  const reduced = useReducedMotion();
  const max = Math.max(...LANGUAGES.map((l) => l.lines));
  return (
    <div className="card card-flat">
      <div className="card-num">Lines of code, about</div>
      <div className="lang-bars">
        {LANGUAGES.map((l, i) => {
          const width = `${Math.max(1.2, (l.lines / max) * 100)}%`;
          return (
            <div key={l.name} className="lang-bar">
              <div className="lang-bar-name">
                <b>{l.name}</b>
                <span>{l.note}</span>
              </div>
              <div className="lang-bar-track" aria-hidden="true">
                <motion.i initial={reduced ? false : { width: "0%" }} whileInView={{ width }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 1.2, ease: EASE, delay: 0.1 + i * 0.12 }} style={reduced ? { width } : undefined} />
              </div>
              <span className="lang-bar-value mono">{formatInt(l.lines)}</span>
            </div>
          );
        })}
      </div>
      <p className="muted lang-note">
        Plus about {formatInt(CODE.testLines)} lines of tests in {CODE.testFiles} files. Counted on 27 October 2026 with git ls-files; tests, data and the lockfile left out.
      </p>
    </div>
  );
}

function ClosingCta() {
  const reduced = useReducedMotion();
  return (
    <Reveal>
      <div className="callout callout-soil tech-cta">
        <div>
          <h2 className="h-1">See the pipeline run.</h2>
          <p className="lead">Open the app with your access code, or ask for one. Judges, farmers, ministries, researchers and investors are all welcome.</p>
          <div className="btn-row">
            <Magnetic>
              <Link to={SITE.appPath} className="btn btn-light btn-lg">
                Open the app <Arrow />
              </Link>
            </Magnetic>
            <Link to="/contact" className="btn btn-ghost btn-ghost-light btn-lg">
              Request access
            </Link>
          </div>
          <ul className="tech-cta-points">
            <li>
              <CheckCircle2 size={16} /> {compactHa(NUMBERS.heavyDamageHa)} ha of damage mapped in Ukraine
            </li>
            <li>
              <TestTube2 size={16} /> {formatInt(NUMBERS.automatedTests)} automated tests
            </li>
            <li>
              <ShieldCheck size={16} /> Never declares land safe
            </li>
          </ul>
        </div>
        <div className="tech-cta-art" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.i key={i} animate={reduced ? undefined : { opacity: [0.18, 0.85, 0.18] }} transition={{ duration: 3 + (i % 5) * 0.6, repeat: Infinity, delay: (i * 0.37) % 3, ease: "easeInOut" }} />
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export default function TechnologyPage() {
  usePageTitle("Technology");
  return (
    <>
      <PageHero eyebrow="Technology" title="Petabytes in orbit. *Seconds* on a phone." lead="Chernozem is a React app and a Node server. Google Earth Engine does the satellite maths over petabytes of imagery, Claude answers the questions, and every method is checked against independent records before its numbers are shown.">
        <nav className="toc" aria-label="On this page">
          <a href="#architecture">How it is built</a>
          <a href="#data">What it reads</a>
          <a href="#month">One month of Ukraine</a>
          <a href="#reliability">Reliability</a>
          <a href="#security">Security</a>
          <a href="#open">The code</a>
        </nav>
      </PageHero>

      <section className="section section-dark-2 anchor tech-arch" id="architecture">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">How it is built</Reveal>
            <h2 className="h-1">
              <SplitWords text="Four parts, and the heavy lifting *in orbit.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">The browser draws the maps and asks the server. The server keeps the data, runs the monthly schedule and talks to three outside services. The satellite maths never leaves Google&apos;s servers: only the numbers come back.</p>
            </Reveal>
          </div>
          <Reveal delay={0.1} y={40}>
            <Architecture />
          </Reveal>
          <Stagger className="grid grid-3 stack-grid">
            {STACK.map((item) => {
              const Icon = STACK_ICONS[item.name] || Code2;
              return (
                <StaggerItem key={item.name}>
                  <Spotlight className="card-dark">
                    <span className="card-icon">
                      <Icon size={22} />
                    </span>
                    <h3 className="card-title">{item.name}</h3>
                    <p className="card-text">{item.what}</p>
                  </Spotlight>
                </StaggerItem>
              );
            })}
            {HOSTING.map(({ name, icon: Icon, what }) => (
              <StaggerItem key={name}>
                <Spotlight className="card-dark">
                  <span className="card-icon">
                    <Icon size={22} />
                  </span>
                  <h3 className="card-title">{name}</h3>
                  <p className="card-text">{what}</p>
                </Spotlight>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section anchor" id="code">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div>
              <Reveal className="eyebrow">What it is written in</Reveal>
              <h2 className="h-1">
                <SplitWords text={`About ${formatInt(Math.round(CODE_LINES / 1000) * 1000)} lines, each file *explained.*`} inView delay={0} step={0.05} />
              </h2>
              <Reveal delay={0.1}>
                <p className="lead" style={{ marginTop: 18 }}>
                  One language end to end: JavaScript in the browser and on the server. All but one file begins with a plain-English note on what it does and who edits it, so a judge, a farmer&apos;s nephew or a new contributor can read it without a guide.
                </p>
              </Reveal>
            </div>
            <Reveal delay={0.15}>
              <LanguageBars />
            </Reveal>
          </div>
          <Stagger className="grid grid-4 tech-facts">
            <StaggerItem className="stat">
              <span className="stat-value">
                <CountUp to={NUMBERS.automatedTests} />
              </span>
              <span className="stat-label">automated tests, run on every change</span>
            </StaggerItem>
            <StaggerItem className="stat">
              <span className="stat-value">
                <CountUp to={CODE.testLines} />
              </span>
              <span className="stat-label">lines of tests, in {CODE.testFiles} files</span>
            </StaggerItem>
            <StaggerItem className="stat">
              <span className="stat-value">
                {CODE.serverFiles} <small>+</small> {CODE.clientFiles}
              </span>
              <span className="stat-label">server files and client files, about</span>
            </StaggerItem>
            <StaggerItem className="stat">
              <span className="stat-value">11 Sep</span>
              <span className="stat-label">2026: the first commit on GitHub</span>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="section section-cream-2 anchor" id="data">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">What it reads</Reveal>
            <h2 className="h-1">
              <SplitWords text={`${DATASETS.length} open datasets, *one* answer.`} inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">All free and public, from ESA, NASA, the FAO, ISRIC, WorldPop and others, read through Google Earth Engine. Each one answers a different question, and none of them alone would do.</p>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div className="table-scroll">
              <table className="s-table tech-data-table">
                <thead>
                  <tr>
                    <th scope="col">Dataset</th>
                    <th scope="col">From</th>
                    <th scope="col">Role</th>
                    <th scope="col">What it tells the app</th>
                  </tr>
                </thead>
                <Stagger as="tbody" amount={0.1}>
                  {DATASETS.map((d) => (
                    <StaggerItem as="tr" key={d.name}>
                      <td>{d.name}</td>
                      <td className={d.org ? undefined : "is-empty"}>{d.org || <span className="muted">&ndash;</span>}</td>
                      <td>{d.role}</td>
                      <td>{d.what}</td>
                    </StaggerItem>
                  ))}
                </Stagger>
              </table>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="muted" style={{ marginTop: 18, fontSize: "0.86rem" }}>
              The Earth Engine catalogue ids are listed at the top of server/providers/gee.js. ACLED is read from a file the team provides; without one, fires that look like fighting stand in.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section anchor" id="month">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">One month of Ukraine</Reveal>
            <h2 className="h-1">
              <SplitWords text="A whole country, in the time it takes to *make tea.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">What happens when the monthly check, or a person, presses Analyze on Ukraine. Every step is in server/jobs.js and server/providers/gee.js, and each one exists because a real run once went wrong without it.</p>
            </Reveal>
          </div>
          <div className="tech-month">
            <Stagger className="steps" amount={0.1}>
              {MONTH_STEPS.map((step) => (
                <StaggerItem key={step.title} className="step">
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
            <div className="tech-month-side">
              <Reveal delay={0.15}>
                <Shot name="atlas-data" url="chernozem.app/atlas/data" alt="The Atlas data page: heavily damaged hectares of Ukraine month by month, with the monthly table and the compare tool" caption={`Twelve months of Ukraine, each one a saved run. ${NUMBERS.ukraineMonth}: ${compactHa(NUMBERS.heavyDamageHa)} ha heavily damaged.`} />
              </Reveal>
              <Reveal delay={0.25}>
                <div className="card card-dark card-flat tech-month-card">
                  <div className="card-num">A month of Ukraine, in numbers</div>
                  <dl>
                    <div>
                      <dt>{formatInt(NUMBERS.ukraineSquares)}</dt>
                      <dd>squares, each with its own season</dd>
                    </div>
                    <div>
                      <dt>{NUMBERS.ukraineMonthMinutes}</dt>
                      <dd>minutes on Earth Engine</dd>
                    </div>
                    <div>
                      <dt>2</dt>
                      <dd>groups of squares in flight at once</dd>
                    </div>
                    <div>
                      <dt>5 min</dt>
                      <dd>limit on each request, then lighter</dd>
                    </div>
                  </dl>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-cream-2 anchor" id="reliability">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">Reliability</Reveal>
            <h2 className="h-1">
              <SplitWords text="The honest numbers, *including* the low ones." inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">Ground checks are impossible inside a war zone, so every method is tested against records it never saw: Copernicus flood and fire maps, the USDA&apos;s crop map, the ACLED conflict record and Ukraine&apos;s harvest statistics. Where a figure comes from the data the rules were tuned on, it says so.</p>
            </Reveal>
          </div>

          <Stagger className="grid grid-4 reliability-grid">
            <StaggerItem className="stat">
              <span className="stat-value">
                <CountUp to={NUMBERS.mapePercent} decimals={1} suffix="%" />
              </span>
              <span className="stat-label">
                mean error in mapped area against three Copernicus maps (95% interval {NUMBERS.mapeInterval}, n = 3)
              </span>
            </StaggerItem>
            <StaggerItem className="stat">
              <span className="stat-value">
                <CountUp to={NUMBERS.falseAlarmPercent} decimals={1} prefix="≤" suffix="%" />
              </span>
              <span className="stat-label">of cropland wrongly flagged in the same places in a normal year, at worst; {NUMBERS.falseAlarmMeanPercent}% on average</span>
            </StaggerItem>
            <StaggerItem className="stat">
              <span className="stat-value">
                <CountUp to={NUMBERS.cropHeldOutPercent} decimals={1} suffix="%" />
              </span>
              <span className="stat-label">of held-out North Dakota fields named the right crop, across six crops</span>
            </StaggerItem>
            <StaggerItem className="stat">
              <span className="stat-value">
                <CountUp to={NUMBERS.analysesOk} suffix={` of ${NUMBERS.analysesOk}`} />
              </span>
              <span className="stat-label">monthly analyses completed since the Earth Engine fixes</span>
            </StaggerItem>
          </Stagger>

          <Reveal delay={0.1} style={{ marginTop: 48 }}>
            <div className="eyebrow">Natural disasters, against Copernicus Emergency Management Service maps</div>
            <div className="table-scroll">
              <table className="s-table tech-check-table">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">When</th>
                    <th scope="col">Measured</th>
                    <th scope="col">Chernozem, ha</th>
                    <th scope="col">Copernicus, ha</th>
                    <th scope="col">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {COPERNICUS.map((row) => (
                    <tr key={row.event}>
                      <td>
                        {row.event}, {row.place}
                      </td>
                      <td data-label="When">{row.when}</td>
                      <td data-label="Measured">{row.what}</td>
                      <td className="num" data-label="Chernozem, ha">
                        {formatInt(row.app)}
                      </td>
                      <td className="num" data-label="Copernicus, ha">
                        {row.refText} <span className="muted">{row.map}</span>
                      </td>
                      <td className="num" data-label="Difference">
                        {percentOff(row.app, row.ref)}
                        {row.note && <span className="muted tech-note">{row.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: 14, fontSize: "0.86rem" }}>
              Each event was analysed by the app itself on a small box, with a control: the same box in a year without the disaster (Thessaly 2024: 0.2% flagged; Yambol 2023: nothing).
            </p>
          </Reveal>

          <Stagger className="grid grid-3 tech-checks" style={{ marginTop: 48 }}>
            <StaggerItem>
              <Spotlight>
                <span className="card-num">Crop detection · USDA Cropland Data Layer</span>
                <div className="tech-kv">
                  <div>
                    <b>{NUMBERS.cropAccuracyPercent}%</b>
                    <span>of {NUMBERS.cropIowaFields} fields near Ames, Iowa: the calibration set, so optimistic</span>
                  </div>
                  <div>
                    <b>{NUMBERS.cropHeldOutPercent}%</b>
                    <span>on held-out North Dakota fields across six crops: the honest figure</span>
                  </div>
                  <div>
                    <b>{NUMBERS.cropLikelyPercent}%</b>
                    <span>when the app says &ldquo;likely&rdquo;, which it only does for corn, soybean and sunflower</span>
                  </div>
                </div>
              </Spotlight>
            </StaggerItem>
            <StaggerItem>
              <Spotlight>
                <span className="card-num">War damage · ACLED, UkrStat, the paper</span>
                <div className="tech-kv">
                  <div>
                    <b>&rho; {NUMBERS.acledCorrelation.toFixed(2)}</b>
                    <span>radar damage against the density of {formatInt(NUMBERS.acledEvents)} recorded explosion events</span>
                  </div>
                  <div>
                    <b>r {NUMBERS.harvestCorrelation.toFixed(2)}</b>
                    <span>more damage, bigger fall in harvests, across 21 oblasts</span>
                  </div>
                  <div>
                    <b>{compactHa(NUMBERS.heavyDamageHa)}</b>
                    <span>
                      ha of heavy damage in Ukraine, against the paper&apos;s {compactHa(NUMBERS.paperHighDamageHa)} ha ({percentOff(NUMBERS.heavyDamageHa, NUMBERS.paperHighDamageHa, 0)}: a different damage method and a broader black-soil map)
                    </span>
                  </div>
                </div>
              </Spotlight>
            </StaggerItem>
            <StaggerItem>
              <Spotlight>
                <span className="card-num">Operations</span>
                <div className="tech-kv">
                  <div>
                    <b>
                      {NUMBERS.analysesOk}/{NUMBERS.analysesOk}
                    </b>
                    <span>monthly analyses completed since the Earth Engine fixes</span>
                  </div>
                  <div>
                    <b>{formatInt(NUMBERS.automatedTests)}</b>
                    <span>automated tests, from the cookie signature to the flood rule</span>
                  </div>
                  <div>
                    <b>0%</b>
                    <span>difference between two runs of the same month, one after the other</span>
                  </div>
                </div>
              </Spotlight>
            </StaggerItem>
          </Stagger>

          <div className="tech-low">
            <Reveal className="eyebrow">Where it reads low, said openly</Reveal>
            <Stagger as="ul" className="feature-list">
              {LIMITS.map(({ icon: Icon, title, text }) => (
                <StaggerItem as="li" key={title}>
                  <Icon size={20} />
                  <div>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <section className="section section-dark anchor" id="security">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div className="tech-security-head">
              <Reveal className="eyebrow">Security and privacy</Reveal>
              <h2 className="h-1">
                <SplitWords text="One code. No accounts. *Nothing* tracked." inView delay={0} step={0.05} />
              </h2>
              <Reveal delay={0.1}>
                <p className="lead" style={{ marginTop: 18 }}>
                  The online app is built to be handed to an official or a farmer safely, and to hold nothing about its visitors. What follows is in docs/DEPLOY.md, server/auth.js and server/web.js.
                </p>
              </Reveal>
            </div>
            <Stagger as="ul" className="feature-list" amount={0.1}>
              {SECURITY.map(({ icon: Icon, title, text }) => (
                <StaggerItem as="li" key={title}>
                  <Icon size={20} />
                  <div>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <section className="section anchor" id="open">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">Public on GitHub</Reveal>
            <h2 className="h-1">
              <SplitWords text="Read the code. Check the *maths.*" inView delay={0} step={0.05} />
            </h2>
            <Reveal delay={0.1}>
              <p className="lead">The code is public, so every rule on this page can be read in the file it names. The research it rests on is archived with its data and code.</p>
            </Reveal>
          </div>
          <Stagger className="grid grid-2">
            <StaggerItem>
              <Spotlight as="a" href={LINKS.github} target="_blank" rel="noreferrer" className="tech-link">
                <span className="card-icon">
                  <Code2 size={22} />
                </span>
                <h3 className="card-title">The code, on GitHub</h3>
                <p className="card-text">willpan0921/Chernozem-APP: the app, the server, the website and the {formatInt(NUMBERS.automatedTests)} tests, with docs/METHODS.md on how every number is worked out and docs/DEPLOY.md on how it runs online.</p>
                <span className="text-link">
                  Open the repository <ArrowUpRight size={16} />
                </span>
              </Spotlight>
            </StaggerItem>
            <StaggerItem>
              <Spotlight as="a" href={LINKS.paper} target="_blank" rel="noreferrer" className="tech-link">
                <span className="card-icon">
                  <BookOpen size={22} />
                </span>
                <h3 className="card-title">The paper, data and code</h3>
                <p className="card-text">{LINKS.paperTitle}. William Pan, 2026, archived on Harvard Dataverse: the gated aggregation the Atlas ranks with, and the Ukraine data it was tested on.</p>
                <span className="text-link">
                  Read it on Harvard Dataverse <ArrowUpRight size={16} />
                </span>
              </Spotlight>
            </StaggerItem>
          </Stagger>
          <ClosingCta />
        </div>
      </section>
    </>
  );
}
