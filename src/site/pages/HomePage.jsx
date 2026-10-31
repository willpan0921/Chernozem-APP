// WHAT THIS FILE DOES
// The website's About page, the landing page (chernozem.app/). In order:
//   1. the hero: a large live Earth filling the first screen (the black
//      soil glowing, today's armed conflicts and disaster alerts on it,
//      components/WorldGlobe.jsx), with the title, one sentence and the two
//      actions over its shaded side
//   2. "One field, one pass": the app's field row, enlarged to fill its
//      columns, in the state the visitor picks, with its button really
//      working
//   3. how it works: one slider through the four stages (tapping the
//      picture moves on)
//   4. the proof: the checks against independent records, as a table
//   5. what a farmer gets, and what governments and NGOs get: on a wide
//      screen an index beside one large window onto the app; each item
//      opens its place in the demo
//   6. the Ukraine demo, live, on the sage stage (built, and its data
//      fetched, only when the visitor scrolls near it)
//   7. the film, with chapters that jump to each part
//   8. the founder's letter, and the line on what Chernozem was made for
//   9. the close: the action tile beside a satellite view, then the small
//      print (where the globe's pictures and data come from)
// The words follow the website brief's copy deck. Numbers come from
// src/site/content/site.js. Layout: home.css. Every section keeps to the
// menu's frame: text starts at the page's left edge, or three columns in
// (the field row, the second line of "the record", the letter's text).
//
// WHO EDITS IT
// Whoever works on the About page.

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import WorldGlobe from "../components/WorldGlobe.jsx";
import FieldRowStates from "../components/FieldRowStates.jsx";
import StageSlider from "../components/StageSlider.jsx";
import ProofTable from "../components/ProofTable.jsx";
import Film from "../components/Film.jsx";
import Letter from "../components/Letter.jsx";
import Shot from "../components/Shot.jsx";
import { useWorldData } from "../components/worldData.js";
import { dayMonthYear } from "../components/globeMath.js";
import { NUMBERS, SITE, formatInt } from "../content/site.js";
import { enterDemo } from "../../lib/demoMode.js";
import { useMediaQuery, useNear, usePageTitle, useReveal } from "../hooks.js";
import "./home.css";

// The Ukraine demo (components/DemoRanking.jsx, not edited) is downloaded
// with its data only when its section comes near (useNear below).
const DemoRanking = lazy(() => import("../components/DemoRanking.jsx"));

// The feature items: a true-size crop of the app beside a short text, and
// the page of the demo that shows it.
const FARMER = [
  {
    title: "Every field, every clear pass",
    lines: ["Draw your fields once, or let the app find them. From then on each clear satellite pass is read for you.", "Plant health, water, stress and harvest timing, against the normal years 2019 to 2021."],
    shot: "field-fields-detail",
    alt: "The demo farm's fields outlined on satellite imagery, Field 11 selected.",
    crop: { x: 300, y: 440, w: 360, h: 220 },
    shotHeight: 1369,
    demo: "/field/fields",
  },
  {
    title: "The whole season on one chart",
    lines: ["Every pass since March, in a table you can download. One field against the farm average.", "The day a war or a flood began is marked on the chart."],
    shot: "field-data",
    alt: "The season chart of plant health, with the full-scale invasion of 24 February 2022 marked.",
    crop: { x: 770, y: 530, w: 360, h: 200 },
    demo: "/field/data",
  },
  {
    title: "Ask in plain words",
    lines: ["The assistant answers only from your own fields’ data, and says when it does not know.", "Open the app, ask, and the answer names the field and the pass it came from."],
    shot: "field-ai",
    alt: "The Field assistant's suggested questions: which field needs me first, when can I harvest.",
    crop: { x: 1548, y: 290, w: 360, h: 200 },
    demo: "/field/ai",
  },
  {
    title: "Weather and a report",
    lines: ["A seven-day forecast beside the fields.", "A report with your photos, to hand to an agronomist or a bank."],
    shot: "field-overview",
    alt: "The farm overview's weather tile: 7 degrees, cloudy, no rain coming.",
    crop: { x: 1540, y: 176, w: 360, h: 160 },
    demo: "/field",
  },
];

const ORGANISATION = [
  {
    title: "A whole country, square by square",
    lines: ["Atlas scores value, damage and feasibility for every square and ranks the regions.", "Where recovery can start now, and where it must wait."],
    shot: "atlas-map-near-macro",
    alt: "Atlas ranking Ukraine's states for the near term: Mykolaiv, Kirovohrad, Poltava.",
    crop: { x: 1510, y: 60, w: 360, h: 220 },
    demo: "/atlas/map",
  },
  {
    title: "A report donors can read",
    lines: ["The top ten areas, the method and its limits.", "PDF and CSV in one click."],
    shot: "atlas-report",
    alt: "The Atlas donor report for Ukraine, September 2026: the top ten near-term areas with their scores.",
    crop: { x: 300, y: 566, w: 360, h: 220 },
    demo: "/atlas/report",
    link: { to: "/register?product=atlas", label: "Register for Atlas" },
  },
];

// The film's chapters, checked frame by frame (the film runs 2:58).
const CHAPTERS = [
  { label: "Northeastern China", t: 4 },
  { label: "Ukraine", t: 17 },
  { label: "How it reads the land", t: 34 },
  { label: "Field", t: 71 },
  { label: "Atlas", t: 108 },
];

const WINDOW = { w: 720, h: 450 };

// The 720x450 window keeps today's crop at its centre, inside the picture.
function windowOver(item) {
  const height = item.shotHeight || 1200;
  const cx = item.crop.x + item.crop.w / 2;
  const cy = item.crop.y + item.crop.h / 2;
  return {
    cx: Math.round(Math.min(Math.max(cx, WINDOW.w / 2), 1920 - WINDOW.w / 2)),
    top: Math.round(Math.min(Math.max(cy - WINDOW.h / 2, 0), height - WINDOW.h)),
    height,
  };
}

function DemoLink({ item }) {
  return (
    <Link to={item.demo} className="link link-under feature-link" onClick={enterDemo}>
      Open in the demo
    </Link>
  );
}

// A narrow screen: today's modules, one under the other.
function Feature({ item }) {
  return (
    <div className="feature">
      <div className="feature-panel" data-settle style={{ "--i": 0 }}>
        <Shot name={item.shot} alt={item.alt} crop={item.crop} height={item.shotHeight} />
      </div>
      <div className="feature-text">
        <h3 className="feature-title" data-rise style={{ "--i": 1 }}>
          {item.title}
        </h3>
        {item.lines.map((line, i) => (
          <p key={line.slice(0, 20)} className="feature-line" data-rise style={{ "--i": i + 2 }}>
            {line}
          </p>
        ))}
        <p className="feature-links" data-rise style={{ "--i": 4 }}>
          <DemoLink item={item} />
          {item.link && (
            <Link to={item.link.to} className="link link-under feature-link">
              {item.link.label}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

// A wide screen: the titles as an index, one large window onto the app
// beside them. Pointing at a title (after 120 ms), focusing it or clicking
// it opens it and shows its window.
function FeatureIndex({ items, headingId, heading }) {
  const [active, setActive] = useState(0);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const soon = (i) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(i), 120);
  };
  return (
    <div className="findex grid">
      <div className="findex-list">
        <h2 id={headingId} className="head-small features-head" data-rise>
          {heading}
        </h2>
        {items.map((item, i) => {
          const open = i === active;
          return (
            <div className={`findex-item${open ? " is-open" : ""}`} key={item.title} data-rise style={{ "--i": i + 1 }}>
              <h3 className="findex-title">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`${headingId}-${i}`}
                  onClick={() => {
                    clearTimeout(timer.current);
                    setActive(i);
                  }}
                  onFocus={() => {
                    clearTimeout(timer.current);
                    setActive(i);
                  }}
                  onPointerEnter={() => soon(i)}
                  onPointerLeave={() => clearTimeout(timer.current)}
                >
                  {item.title}
                </button>
              </h3>
              <div className="findex-body" id={`${headingId}-${i}`} hidden={!open}>
                {item.lines.map((line) => (
                  <p key={line.slice(0, 20)} className="feature-line">
                    {line}
                  </p>
                ))}
                <p className="feature-links">
                  <DemoLink item={item} />
                  {item.link && (
                    <Link to={item.link.to} className="link link-under feature-link">
                      {item.link.label}
                    </Link>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="findex-window" data-settle style={{ "--i": 1 }}>
        {items.map((item, i) => {
          const w = windowOver(item);
          return (
            <figure className={`findex-shot${i === active ? " is-on" : ""}`} key={item.shot} aria-hidden={i !== active}>
              <img
                src={`/site/shots/${item.shot}.webp`}
                alt={item.alt}
                width={WINDOW.w}
                height={WINDOW.h}
                loading="lazy"
                decoding="async"
                style={{ objectPosition: `calc(50% + ${960 - w.cx}px) ${-w.top}px` }}
              />
            </figure>
          );
        })}
      </div>
    </div>
  );
}

// Where the globe's pictures and data come from, and the closing tile's
// satellite view, in the page's small print. The Earth's texture is made
// from OpenLandMap (CC BY-SA 4.0), so it is shared under that licence too.
function GlobeCredits() {
  const world = useWorldData();
  const reviewed = world.status === "ok" && world.reviewed ? dayMonthYear(world.reviewed) : "";
  // The trade file says which years its rows come from (each country's
  // latest report); an older file without them just says "the latest year".
  const years = Array.isArray(world.trade?.years) && world.trade.years.length === 2 ? world.trade.years : null;
  const span = years ? (years[0] === years[1] ? ` (${years[0]})` : ` (${years[0]}\u2013${years[1]})`) : "";
  const out = { className: "link link-under", target: "_blank", rel: "noreferrer" };
  return (
    <div className="wrap small-print-wrap">
      <p className="small-print">
        Black soil:{" "}
        <a href="https://doi.org/10.5281/zenodo.1476844" {...out}>
          OpenLandMap USDA great groups
        </a>{" "}
        (Hengl and Nauman, 2018),{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" {...out}>
          CC BY-SA 4.0
        </a>
        , modified; this Earth texture is shared under{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" {...out}>
          CC BY-SA 4.0
        </a>
        . Cropland:{" "}
        <a href="https://doi.org/10.5281/zenodo.3939050" {...out}>
          Copernicus Global Land Service, Land Cover 100 m, 2019
        </a>
        ,{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" {...out}>
          CC BY 4.0
        </a>
        , modified. Coastlines:{" "}
        <a href="https://www.naturalearthdata.com/" {...out}>
          Natural Earth
        </a>
        . Disaster alerts:{" "}
        <a href="https://www.gdacs.org/" {...out}>
          GDACS
        </a>
        , live. Armed conflicts: a list reviewed by hand{reviewed ? ` on ${reviewed}` : ""}. Who buys whose food: World Bank{" "}
        <a href="https://wits.worldbank.org/" {...out}>
          WITS
        </a>
        , the latest year each country reported{span}. The satellite view above: Esri World Imagery (Esri, Maxar, Earthstar Geographics).
      </p>
    </div>
  );
}

export default function HomePage() {
  usePageTitle();
  const reveal = useReveal();
  const wideFeatures = useMediaQuery("(min-width: 1024px)");
  const [demoRef, demoNear] = useNear();

  return (
    <>
      {/* 1. The hero: the Earth fills it; the words sit over its shaded side. */}
      <section className="hero on-dark" aria-labelledby="hero-title">
        <WorldGlobe>
          <div className="hero-words">
            <h1 id="hero-title" className="hero-title lines">
              <span className="line">
                <span data-line style={{ "--i": 0 }}>
                  Your land,
                </span>
              </span>
              <span className="line">
                <span data-line style={{ "--i": 1 }}>
                  seen from space
                </span>
              </span>
            </h1>
            <p className="hero-lead" data-load style={{ "--d": "420ms" }}>
              Field reads every satellite pass over a farm and says what changed, field by field. Atlas does the same for a whole region.
            </p>
            <div className="hero-actions" data-load style={{ "--d": "480ms" }}>
              <Link to="/register?product=field" className="btn btn-light">
                Register for Field
              </Link>
              <Link to={SITE.demoPath} className="link link-under">
                Try the demo
              </Link>
            </div>
          </div>
        </WorldGlobe>
      </section>

      {/* 2. The showcase */}
      <section className="showcase section" aria-labelledby="showcase-title" ref={reveal}>
        <div className="wrap grid">
          <h2 id="showcase-title" className="head showcase-head" data-rise>
            One field, one pass
          </h2>
          <FieldRowStates />
        </div>
      </section>

      {/* 3. How it works, on the page's frame */}
      <section className="how" aria-label="How it works" ref={reveal}>
        <div className="wrap">
          <StageSlider />
        </div>
      </section>

      {/* 4. The proof */}
      <section className="proof section" aria-labelledby="proof-title" ref={reveal}>
        <div className="wrap">
          <h2 id="proof-title" className="display proof-head lines">
            <span className="line">
              <span data-rise style={{ "--i": 0 }}>
                Checked against
              </span>
            </span>{" "}
            <span className="line proof-head-step">
              <span data-rise style={{ "--i": 1 }}>
                the record
              </span>
            </span>
          </h2>
          <div className="proof-body" data-rise style={{ "--i": 3 }}>
            <ProofTable />
          </div>
        </div>
      </section>

      {/* 5. The features */}
      <section className="features section" aria-labelledby="features-title">
        {wideFeatures ? (
          <div className="wrap">
            <div className="features-group" ref={reveal}>
              <FeatureIndex items={FARMER} headingId="features-title" heading="What a farmer gets" />
            </div>
            <div className="features-group" ref={reveal}>
              <FeatureIndex items={ORGANISATION} headingId="features-ngo" heading="For governments and NGOs" />
            </div>
          </div>
        ) : (
          <div className="wrap grid">
            <div className="features-col">
              <div className="features-group">
                <div ref={reveal}>
                  <h2 id="features-title" className="head-small features-head" data-rise>
                    What a farmer gets
                  </h2>
                </div>
                {FARMER.map((item) => (
                  <div className="features-item" key={item.title} ref={reveal}>
                    <Feature item={item} />
                  </div>
                ))}
              </div>
              <div className="features-group">
                <div ref={reveal}>
                  <h2 className="head-small features-head" data-rise>
                    For governments and NGOs
                  </h2>
                </div>
                {ORGANISATION.map((item) => (
                  <div className="features-item" key={item.title} ref={reveal}>
                    <Feature item={item} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 6. The demo: built when the visitor comes near it */}
      <section className="demo-section on-sage section" aria-labelledby="demo-title" ref={reveal}>
        <div className="wrap grid">
          <div className="demo-copy">
            <h2 id="demo-title" className="head" data-rise>
              The demo is Ukraine
            </h2>
            <p className="lead demo-statement" data-rise style={{ "--i": 1 }}>
              Chernozem started there. This is the real {NUMBERS.ukraineMonth} reading of {formatInt(NUMBERS.ukraineSquares)} squares, rolled up to oblasts. The same app works anywhere.
            </p>
            <div data-rise style={{ "--i": 2 }}>
              <Link to={SITE.demoPath} className="btn">
                Try the demo
              </Link>
            </div>
          </div>
          <div className={`demo-stage${demoNear ? "" : " is-waiting"}`} data-ui data-settle style={{ "--i": 2 }} ref={demoRef}>
            {demoNear && (
              <Suspense fallback={null}>
                <DemoRanking />
              </Suspense>
            )}
          </div>
        </div>
      </section>

      {/* 7. The film */}
      <section className="film-section on-dark section" aria-labelledby="film-title" ref={reveal}>
        <div className="wrap">
          <h2 id="film-title" className="head film-head" data-rise>
            Three minutes on Chernozem
          </h2>
          <Film chapters={CHAPTERS} />
        </div>
      </section>

      {/* 8. The letter */}
      <section className="letter-section section" id="letter" aria-labelledby="letter-title" ref={reveal}>
        <div className="wrap">
          <Letter />
        </div>
      </section>

      {/* 9. The close: the action tile beside a satellite view, then the small print */}
      <section className="close" aria-labelledby="close-title" ref={reveal}>
        <div className="close-row frame">
          <div className="close-tile close-tile-main on-accent" data-rise style={{ "--i": 0 }}>
            <h2 id="close-title" className="close-head">
              See your land from space
            </h2>
            <p className="close-text">Register, draw your fields, and read the first pass in about twenty seconds.</p>
            <div className="close-actions">
              <Link to="/register?product=field" className="btn btn-light">
                Register for Field
              </Link>
              <Link to={SITE.demoPath} className="link">
                Try the demo
              </Link>
            </div>
          </div>
          <div className="close-tile close-tile-photo" data-slide="right" style={{ "--i": 1 }}>
            <img src="/site/shots/crops/atlas-map-satellite-sea.webp" alt="Satellite view of southern Ukraine, Crimea and the Black Sea, as Atlas shows it." width="730" height="520" loading="lazy" decoding="async" />
          </div>
        </div>
        <GlobeCredits />
      </section>
    </>
  );
}
