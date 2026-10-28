// WHAT THIS FILE DOES
// The website's Methodology page (chernozem.app/method): how Chernozem
// works, in eight parts a reader can jump to from the row of links under
// the title: the three scores, the gate (with the sliders, GateLab.jsx),
// the Ukraine demo, the two products, how to use them, the checks against
// independent records, the technology and the data, and the design. The
// old /product, /guide, /technology and /design addresses land on the
// matching part here (src/App.jsx).
//
// WHO EDITS IT
// The founder, for the words. The formulas match src/lib/atlas/scoring.js
// and the paper; keep them in step. Numbers come from
// src/site/content/site.js.

import { Link } from "react-router-dom";
import DemoRanking from "../components/DemoRanking.jsx";
import GateLab from "../components/GateLab.jsx";
import ProofTable from "../components/ProofTable.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { DATASETS, LINKS, NUMBERS, SITE_ACTIONS, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

// The parts of the page, in order; each is a section with that id.
const PARTS = [
  ["scores", "Scores"],
  ["gate", "The gate"],
  ["demo", "The demo"],
  ["product", "The product"],
  ["use", "How to use it"],
  ["checks", "Checks"],
  ["technology", "Technology"],
  ["design", "Design"],
];

const FIELD_STEPS = ["Register and choose Field.", "Find your farm: search a village, type coordinates, or draw.", "Check the crops the app detected.", `Read the first pass; a ten-field farm takes about ${NUMBERS.tenFieldsSeconds === 20 ? "twenty" : NUMBERS.tenFieldsSeconds} seconds.`, "Come back after each pass, or ask the assistant."];

const ATLAS_STEPS = ["Register and choose Atlas.", "Pick a country, a region or a box.", `Run the first twelve months; a month of Ukraine takes ${NUMBERS.ukraineMonthMinutes} minutes.`, "Move the weights and the cutoff.", "Export the report."];

export default function MethodPage() {
  usePageTitle("Methodology");
  const w = NUMBERS.postWeights;
  // Near term uses value and damage only, their weights re-shared (30/40 -> 0.43/0.57), as the app does.
  const nearShares = { value: (w.value / (w.value + w.damage)).toFixed(2), damage: (w.damage / (w.value + w.damage)).toFixed(2) };
  return (
    <div className="pg">
      <section className="pg-sec" aria-labelledby="meth-title">
        <div className="pg-grid">
          <div className="meth-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1" id="meth-title">
                How Chernozem works
              </h1>
            </div>
            <p className="pg-lead pg-fade">Three scores, one gate, and a list of where to act first. The same method for a farm and for a country.</p>
            <ul className="meth-toc pg-fade-2" aria-label="On this page">
              {PARTS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`}>{label}</a>
                </li>
              ))}
            </ul>
          </div>
          <figure className="pg-fig meth-open-pic pg-fade-2">
            <img className="pg-pic" src="/site/shots/atlas-map-near-micro.webp" width="1920" height="1200" alt="The Atlas map of Ukraine by priority, square by square, with the weights on the left and the top ten areas on the right" loading="eager" decoding="async" />
            <figcaption>Ukraine, September 2026, square by square: the weights on the left, the top ten on the right.</figcaption>
          </figure>
        </div>
      </section>

      <section className="pg-sec" id="scores" aria-labelledby="meth-scores">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-scores">
              Three scores
            </h2>
          </Reveal>
          <Reveal className="meth-body" delay={0.08}>
            <p>Every square of land gets three numbers between 0 and 100. Value and damage make the priority; feasibility decides whether a square is ranked now or later.</p>
          </Reveal>
          <Stagger as="dl" className="meth-scores">
            <StaggerItem>
              <dt>Value</dt>
              <dd>How likely the soil is black soil, and how much of the square is cropland.</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>Damage</dt>
              <dd>Unusual fire and lasting radar change since the crisis began, against the same seasons in 2019 to 2021.</dd>
            </StaggerItem>
            <StaggerItem>
              <dt>Feasibility</dt>
              <dd>Distance to recorded fighting; 100 km or more counts as fully feasible.</dd>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="pg-sec pg-sec-surface" id="gate" aria-labelledby="meth-gate">
        <div className="pg-grid">
          <div className="meth-gate-text">
            <Reveal>
              <h2 className="pg-h2" id="meth-gate">
                The gate
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p style={{ marginTop: 22 }}>
                Near term: the least feasible {NUMBERS.gatePercentile}% of squares are left out, with a soft edge of {NUMBERS.rampWidth}, and the rest are ranked by value and damage.
              </p>
              <p>
                Post-crisis: feasibility becomes a pace factor. The three scores are combined in a weighted power mean with weights {w.value * 100} / {w.damage * 100} / {w.feasibility * 100} and exponent {NUMBERS.postExponent}.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="meth-formula">
                Near term: priority = ({nearShares.value}·value<sup>0.5</sup> + {nearShares.damage}·damage<sup>0.5</sup>)<sup>2</sup>, faded in over the {NUMBERS.rampWidth} ramp above the cutoff; below it, left out
              </p>
              <p className="meth-formula">
                Post-crisis: priority = ({w.value}·value<sup>0.5</sup> + {w.damage}·damage<sup>0.5</sup> + {w.feasibility}·feasibility<sup>0.5</sup>)<sup>2</sup>
              </p>
            </Reveal>
          </div>
          <Reveal className="meth-gate-lab" delay={0.12} y={36}>
            <GateLab />
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-sage" id="demo" aria-labelledby="meth-demo">
        <div className="pg-grid">
          <div className="meth-demo-head">
            <Reveal>
              <h2 className="pg-h2" id="meth-demo">
                The demo
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="pg-lead">
                The demo is Ukraine because that is where Chernozem started: the real {NUMBERS.ukraineMonth} reading of {formatInt(NUMBERS.ukraineSquares)} squares. The same app runs anywhere.
              </p>
            </Reveal>
          </div>
          <Reveal className="meth-demo-stage" delay={0.12} y={36}>
            {/* The owner's own demo, untouched: a piece of the product, with the product's look. */}
            <div data-ui>
              <DemoRanking />
            </div>
          </Reveal>
          <Reveal className="meth-demo-link" delay={0.16}>
            <Link className="pg-btn pg-btn-light" to={SITE_ACTIONS.demo.path}>
              Open the demo
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec" id="product" aria-labelledby="meth-product">
        <div className="pg-grid">
          <Reveal className="meth-product-head">
            <h2 className="pg-h2" id="meth-product">
              The product
            </h2>
          </Reveal>
          <Reveal className="meth-product-text">
            <h3 className="pg-h3">Field</h3>
            <p>For a farm: draw the fields once, then read every clear pass, ask questions, export a report.</p>
          </Reveal>
          <Reveal className="pg-crop meth-product-crop meth-crop-field" delay={0.08} y={36}>
            <img src="/site/shots/field-fields.webp" width="1920" height="1200" alt="Field 11 in the Field app at true size: rapeseed, water near normal, plant health 0.79, stress under 1%, past peak greenness" loading="lazy" decoding="async" />
          </Reveal>
          <Reveal className="meth-product-text">
            <h3 className="pg-h3">Atlas</h3>
            <p>For a region: pick a country, region or box, run twelve months, move the weights, export a report donors can read.</p>
          </Reveal>
          <Reveal className="pg-crop meth-product-crop meth-crop-atlas" delay={0.08} y={36}>
            <img src="/site/shots/atlas-overview.webp" width="1920" height="1200" alt="The Atlas overview of Ukraine at true size: 34.8M ha of cropland analysed, 26M ha of black soil, and the priority map" loading="lazy" decoding="async" />
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-surface" id="use" aria-labelledby="meth-use">
        <div className="pg-grid">
          <Reveal className="meth-use-head">
            <h2 className="pg-h2" id="meth-use">
              How to use it
            </h2>
          </Reveal>
          <Reveal className="meth-use-list">
            <h3 className="pg-h3">Field</h3>
            <ol>
              {FIELD_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Reveal>
          <Reveal className="meth-use-list" delay={0.1}>
            <h3 className="pg-h3">Atlas</h3>
            <ol>
              {ATLAS_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Reveal>
          <Reveal className="meth-use-phone" delay={0.16} y={36}>
            <img className="pg-pic" src="/site/shots/phone-field-fields.webp" width="780" height="1688" alt="The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below" loading="lazy" decoding="async" />
          </Reveal>
        </div>
      </section>

      <section className="pg-sec" id="checks" aria-labelledby="meth-checks">
        <div className="pg-grid">
          <Reveal className="meth-checks-head">
            <h2 className="pg-h2" id="meth-checks">
              Checks
            </h2>
          </Reveal>
          <Reveal className="meth-checks-table" delay={0.08} y={24}>
            <ProofTable />
          </Reveal>
          <Reveal className="meth-limits-head" delay={0.08}>
            <h3 className="pg-h3">What it cannot do</h3>
          </Reveal>
          <Reveal className="meth-limits-text" delay={0.12}>
            <p>A screen, not a survey. Ten-metre pixels miss small fields; clouds delay optical readings; radar change is less reliable where 2019 to 2021 were not calm; and it never declares land safe.</p>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-dark" id="technology" aria-labelledby="meth-tech">
        <div className="pg-grid">
          <Reveal className="meth-tech-head">
            <h2 className="pg-h2" id="meth-tech">
              Technology
            </h2>
          </Reveal>
          <div className="meth-tech-body">
            <Reveal delay={0.08}>
              <p>
                React 19 in the browser; a Node.js server for analyses, the monthly schedule and the data; Google Earth Engine for the satellite maths; Leaflet maps over Esri imagery; Claude for the assistant, answering only from the user’s own data; Vite for the build. {NUMBERS.automatedTests} automated tests.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <h3 className="pg-h3" style={{ marginTop: 36 }}>
                What it reads
              </h3>
            </Reveal>
            <Stagger as="ul" className="meth-datasets" style={{ marginTop: 0 }}>
              {DATASETS.map((item) => (
                <StaggerItem as="li" key={item.name}>
                  <span>{item.name}</span>
                  <span>{item.org || item.role}</span>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal className="meth-accounts" delay={0.08}>
              <h3 className="pg-h3">Accounts and privacy</h3>
              <p>Accounts run on Firebase (Google or e‑mail and password); Google holds your sign-in. Your fields, readings, reports and messages are kept on our own server and never sold. When you ask the assistant, your question and your fields’ readings go to Anthropic’s Claude to be answered; the satellite maths runs on Google Earth Engine. The demo is behind one access code.</p>
              <ul className="meth-links">
                <li>
                  <a className="pg-link" href={LINKS.github} target="_blank" rel="noreferrer">
                    The code is public on GitHub
                  </a>
                </li>
                <li>
                  <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
                    The paper’s data and code are on Harvard Dataverse
                  </a>
                </li>
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="pg-sec" id="design" aria-labelledby="meth-design">
        <div className="pg-grid">
          <Reveal className="meth-design-head">
            <h2 className="pg-h2" id="meth-design">
              Design
            </h2>
          </Reveal>
          <Reveal className="meth-design-line" delay={0.08}>
            <p>Drawn first, then built.</p>
          </Reveal>
          <Stagger className="meth-design-pics">
            <StaggerItem as="figure" className="pg-fig">
              <img className="pg-pic" src="/site/design/mockup-field.webp" width="1200" height="1552" alt="The drawn mockup of Field: a light sidebar app opening on My farm" loading="lazy" decoding="async" />
              <figcaption>The Field mockup.</figcaption>
            </StaggerItem>
            <StaggerItem as="figure" className="pg-fig">
              <img className="pg-pic" src="/site/design/mockup-atlas.webp" width="1200" height="1552" alt="The drawn mockup of Atlas: a recovery overview with a Near term and Postwar switch" loading="lazy" decoding="async" />
              <figcaption>The Atlas mockup.</figcaption>
            </StaggerItem>
            <StaggerItem as="figure" className="pg-fig">
              <img className="pg-pic" src="/site/shots/field-fields.webp" width="1920" height="1200" alt="The built Field app: the farm's fields outlined on satellite imagery, with Field 11 selected" loading="lazy" decoding="async" />
              <figcaption>The built app, October 2026.</figcaption>
            </StaggerItem>
          </Stagger>
          <Reveal className="meth-logo" delay={0.08}>
            <img src="/chernozem-logo.png" width="96" height="96" alt="The Chernozem pin: a map pin holding a field under a white sky and a sun" loading="lazy" decoding="async" />
            <p>The logo is a map pin holding a field: a white sky, a sun, a sage band, and dark soil underneath. The site’s colours come from it; the sun stays in the logo.</p>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-sage" aria-labelledby="meth-close">
        <div className="pg-grid">
          <Reveal className="meth-close-head">
            <h2 className="pg-h2" id="meth-close">
              Run it on your own land
            </h2>
          </Reveal>
          <Reveal className="meth-close-act" delay={0.1}>
            <p>Register for Field or Atlas and read the first pass yourself. The demo is open with a code.</p>
            <div className="pg-actions">
              <Link className="pg-btn" to={SITE_ACTIONS.register.path}>
                Register
              </Link>
              <Link className="pg-link" to={SITE_ACTIONS.demo.path}>
                Try the demo
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
