// WHAT THIS FILE DOES
// The website's About page, the landing page (chernozem.app/). In order:
//   1. the hero: the title, one sentence and the button on the dark field,
//      with the live globe of wars and disasters on farmland beside them
//   2. the showcase "One field, one pass": the app's field row in its
//      three states, the middle one working
//   3. how it works: one slider that moves through the four stages
//   4. the proof: the checks against independent records, as a table
//   5. what a farmer gets, and what governments and NGOs get
//   6. the Ukraine demo, live, on the sage stage
//   7. the film
//   8. the founder's letter
//   9. the close: the action tile
// The words follow the website brief's copy deck. Numbers come from
// src/site/content/site.js. Layout: home.css.
//
// WHO EDITS IT
// Whoever works on the About page.

import { Link } from "react-router-dom";
import WorldGlobe from "../components/WorldGlobe.jsx";
import FieldRowStates from "../components/FieldRowStates.jsx";
import StageSlider from "../components/StageSlider.jsx";
import ProofTable from "../components/ProofTable.jsx";
import DemoRanking from "../components/DemoRanking.jsx";
import Film from "../components/Film.jsx";
import Letter from "../components/Letter.jsx";
import Shot from "../components/Shot.jsx";
import { NUMBERS, SITE, formatInt } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./home.css";

// The feature modules: a true-size crop of the app beside a short text.
const FARMER = [
  {
    title: "Every field, every clear pass",
    lines: ["Draw your fields once, or let the app find them. From then on each clear satellite pass is read for you.", "Plant health, water, stress and harvest timing, against the normal years 2019 to 2021."],
    shot: "field-fields-detail",
    alt: "The demo farm's fields outlined on satellite imagery, Field 11 selected.",
    crop: { x: 300, y: 440, w: 360, h: 220 },
    shotHeight: 1369,
  },
  {
    title: "The whole season on one chart",
    lines: ["Every pass since March, in a table you can download. One field against the farm average.", "The day a war or a flood began is marked on the chart."],
    shot: "field-data",
    alt: "The season chart of plant health, with the full-scale invasion of 24 February 2022 marked.",
    crop: { x: 770, y: 530, w: 360, h: 200 },
  },
  {
    title: "Ask in plain words",
    lines: ["The assistant answers only from your own fields’ data, and says when it does not know.", "Open the app, ask, and the answer names the field and the pass it came from."],
    shot: "field-ai",
    alt: "The Field assistant's suggested questions: which field needs me first, when can I harvest.",
    crop: { x: 1548, y: 290, w: 360, h: 200 },
  },
  {
    title: "Weather and a report",
    lines: ["A seven-day forecast beside the fields.", "A report with your photos, to hand to an agronomist or a bank."],
    shot: "field-overview",
    alt: "The farm overview's weather tile: 7 degrees, cloudy, no rain coming.",
    crop: { x: 1540, y: 176, w: 360, h: 160 },
  },
];

const ORGANISATION = [
  {
    title: "A whole country, square by square",
    lines: ["Atlas scores value, damage and feasibility for every square and ranks the regions.", "Where recovery can start now, and where it must wait."],
    shot: "atlas-map-near-macro",
    alt: "Atlas ranking Ukraine's states for the near term: Mykolaiv, Kirovohrad, Poltava.",
    crop: { x: 1510, y: 60, w: 360, h: 220 },
  },
  {
    title: "A report donors can read",
    lines: ["The top ten areas, the method and its limits.", "PDF and CSV in one click."],
    shot: "atlas-report",
    alt: "The Atlas donor report for Ukraine, September 2026: the top ten near-term areas with their scores.",
    crop: { x: 300, y: 566, w: 360, h: 220 },
    link: { to: "/register?product=atlas", label: "Register for Atlas" },
  },
];

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
          <p key={line.slice(0, 20)} className="feature-line muted" data-rise style={{ "--i": i + 2 }}>
            {line}
          </p>
        ))}
        {item.link && (
          <Link to={item.link.to} className="link link-under feature-link" data-rise style={{ "--i": 4 }}>
            {item.link.label}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  usePageTitle();
  const reveal = useReveal();

  return (
    <>
      {/* 1. The hero */}
      <section className="hero on-dark" aria-labelledby="hero-title">
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-title lines">
            <span className="line">
              <span data-line style={{ "--i": 0 }}>
                Your land, seen from space
              </span>
            </span>
          </h1>
          <p className="hero-lead muted" data-load style={{ "--d": "420ms" }}>
            Field reads every satellite pass over a farm and says what changed, field by field. Atlas does the same for a whole region.
          </p>
          <div className="hero-actions" data-load style={{ "--d": "480ms" }}>
            <Link to="/register?product=field" className="btn btn-light">
              Register for Field
            </Link>
            <Link to={SITE.demoPath} className="link">
              Try the demo
            </Link>
          </div>
        </div>
        <div className="hero-globe">
          <WorldGlobe />
        </div>
      </section>

      {/* 2. The showcase */}
      <section className="showcase section" aria-labelledby="showcase-title" ref={reveal}>
        <div className="wrap grid">
          <h2 id="showcase-title" className="head-small showcase-head" data-rise>
            One field, one pass
          </h2>
          <FieldRowStates />
        </div>
      </section>

      {/* 3. How it works */}
      <section className="how" aria-label="How it works" ref={reveal}>
        <StageSlider />
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
      </section>

      {/* 6. The demo */}
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
                Open the demo
              </Link>
            </div>
          </div>
          <div className="demo-stage" data-ui data-settle style={{ "--i": 2 }}>
            <DemoRanking />
          </div>
        </div>
      </section>

      {/* 7. The film */}
      <section className="film-section on-dark section" aria-labelledby="film-title" ref={reveal}>
        <div className="wrap">
          <h2 id="film-title" className="head film-head" data-rise>
            Three minutes on Chernozem
          </h2>
          <Film />
        </div>
      </section>

      {/* 8. The letter */}
      <section className="letter-section" id="letter" aria-labelledby="letter-title" ref={reveal}>
        <div className="wrap">
          <Letter />
        </div>
      </section>

      {/* 9. The close */}
      <section className="close" aria-labelledby="close-title" ref={reveal}>
        <div className="close-row">
          <div className="close-tile close-tile-sage on-sage" data-slide style={{ "--i": 0 }} aria-hidden="true" />
          <div className="close-tile close-tile-main on-accent" data-rise style={{ "--i": 1 }}>
            <h2 id="close-title" className="close-head">
              See your land from space
            </h2>
            <p className="close-text">
              Register, draw your fields, and read the first pass in about twenty seconds.
              <br />
              The demo is open with a code.
            </p>
            <div className="close-actions">
              <Link to="/register?product=field" className="btn btn-light">
                Register for Field
              </Link>
              <Link to={SITE.demoPath} className="link">
                Try the demo
              </Link>
            </div>
          </div>
          <div className="close-tile close-tile-photo" data-slide="right" style={{ "--i": 2 }}>
            <img src="/site/shots/atlas-map-satellite.webp" alt="Satellite imagery of Ukraine and the Black Sea in Atlas." width="1920" height="1200" loading="lazy" decoding="async" />
          </div>
        </div>
      </section>
    </>
  );
}
