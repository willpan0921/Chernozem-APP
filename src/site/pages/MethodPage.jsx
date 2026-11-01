// WHAT THIS FILE DOES
// The website's Methodology page (chernozem.app/method): how Chernozem
// works, in two parts, one for each product, and a short close.
//   Field     what it does in two sentences, the walkthrough film (every
//             feature, recorded from the real app: Walkthrough.jsx), how
//             to use it in five steps, and what it reads in one line.
//   Atlas     two sentences, its walkthrough film, the three scores, the
//             gate with the sliders the reader can move (GateLab.jsx: Near
//             term against Post-crisis), the Ukraine ranking as the app
//             shows it (DemoRanking.jsx, untouched) and the checks against
//             independent records (ProofTable.jsx).
//   Behind it what it reads, what it is built with, privacy, and where
//             the data and the code are.
// The old addresses (/product, /guide, /technology, /design) still land
// on the matching part: those ids stay on the blocks (src/App.jsx).
//
// WHO EDITS IT
// The founder, for the words. The formulas match src/lib/atlas/scoring.js
// and the paper; keep them in step. Numbers come from
// src/site/content/site.js.

import { Link } from "react-router-dom";
import DemoRanking from "../components/DemoRanking.jsx";
import GateLab from "../components/GateLab.jsx";
import ProofTable from "../components/ProofTable.jsx";
import Walkthrough from "../components/Walkthrough.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { CONTACT_EMAIL, DATASETS, LINKS, NUMBERS, SITE_ACTIONS, STACK, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

const FIELD_STEPS = ["Register and choose Field.", "Find your farm: search a village, type coordinates, or draw.", "Check the crops the app detected, and set your own.", `Read the first pass; a ten-field farm takes about ${NUMBERS.tenFieldsSeconds === 20 ? "twenty" : NUMBERS.tenFieldsSeconds} seconds.`, "Come back after each pass, report what happened, or ask the assistant."];

// "Sentinel-1, Sentinel-2, FIRMS, ..., and ACLED"
function listOf(names) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export default function MethodPage() {
  usePageTitle("Methodology");
  const w = NUMBERS.postWeights;
  // Near term uses value and damage only, their weights re-shared (30/40 -> 0.43/0.57), as the app does.
  const nearShares = { value: (w.value / (w.value + w.damage)).toFixed(2), damage: (w.damage / (w.value + w.damage)).toFixed(2) };
  // The test count rounded down to the hundred ("More than 1,000"), so the
  // sentence stays true while tests are added between updates of site.js.
  const testsFloor = Math.floor(NUMBERS.automatedTests / 100) * 100;
  // "meth": on this page the small size never drops under 14 px (pages.css).
  return (
    <div className="pg meth">
      <section className="pg-sec" aria-labelledby="meth-title">
        <div className="pg-grid">
          <div className="meth-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1" id="meth-title">
                How Chernozem works
              </h1>
            </div>
            <p className="pg-lead pg-fade">Free satellite data, read over farmland and turned into a plain answer: Field for one farm, Atlas for a whole region.</p>
          </div>
          <figure className="pg-fig meth-open-pic pg-fade-2">
            <img className="pg-pic" src="/site/shots/atlas-map-near-micro.webp" width="1920" height="1200" alt="The Atlas map of Ukraine by priority, square by square, with the weights on the left and the top ten areas on the right" loading="eager" decoding="async" />
            <figcaption>Ukraine, {NUMBERS.ukraineMonth}, square by square: the weights on the left, the top ten on the right.</figcaption>
          </figure>
        </div>
      </section>

      <section className="pg-sec pg-sec-surface" id="product" aria-labelledby="meth-field">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-field">
              Field
            </h2>
          </Reveal>
          <Reveal className="meth-body" delay={0.08}>
            <p className="pg-lead meth-what">Draw your fields once, and every clear satellite pass is read for you: plant health, water, stress and harvest timing, against the same weeks of 2019 to 2021. Report what happened, ask the assistant about any field, and download the record.</p>
          </Reveal>
          <Reveal className="meth-film" delay={0.1} y={30}>
            <Walkthrough product="field" title="The Field walkthrough" />
          </Reveal>
          {/* The steps, the phone and "What it reads" in one block of their
              own: on a wide screen the phone stands beside both texts, which
              follow each other closely; on a tablet or a phone it sits
              between them (pages.css, ".meth-use-row"). */}
          <div className="meth-use-row">
            <Reveal className="meth-use" id="use">
              <p>
                <strong>How to use it.</strong>
              </p>
              <ol>
                {FIELD_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </Reveal>
            <Reveal className="meth-use-phone" delay={0.16} y={36}>
              <img className="pg-pic" src="/site/shots/phone-field-fields.webp" width="780" height="1688" alt="The Fields page on a phone: the satellite map with the field outlines, the condition key and the selected field's details below" loading="lazy" decoding="async" />
            </Reveal>
            <Reveal className="meth-reads" delay={0.08}>
              <p>
                <strong>What it reads.</strong> Every clear Sentinel-2 pass at ten metres, radar from Sentinel-1 for lasting change in the ground, the local forecast, and the same weeks of 2019 to 2021 as the normal to compare with.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="pg-sec" id="atlas" aria-labelledby="meth-atlas">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-atlas">
              Atlas
            </h2>
          </Reveal>
          <Reveal className="meth-body" delay={0.08}>
            <p className="pg-lead meth-what">Pick a country, a region or a box, and every square of its farmland gets three scores and a place in the ranking: where to act first, within a budget, with a report donors can read. Ukraine is the demo because that is where Chernozem started; the same app runs anywhere.</p>
          </Reveal>
          <Reveal className="meth-film" delay={0.1} y={30}>
            <Walkthrough product="atlas" title="The Atlas walkthrough" />
          </Reveal>

          <Reveal className="meth-scores-intro" id="scores">
            <p>
              <strong>Three scores</strong>, each from 0 to 100. Value and damage make the priority; feasibility decides whether a square is ranked now or later.
            </p>
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

          <div className="meth-gate-text" id="gate">
            <Reveal>
              <p>
                <strong>The gate.</strong> Near term: the least feasible {NUMBERS.gatePercentile}% of squares are left out, with a soft edge of {NUMBERS.rampWidth}, and the rest are ranked by value and damage.
              </p>
              <p>
                Post-crisis: feasibility becomes a pace factor. The three scores are combined in a weighted power mean with weights {w.value * 100} / {w.damage * 100} / {w.feasibility * 100} and exponent {NUMBERS.postExponent}. Move the sliders and watch what the two time frames do with one place.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
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

          <Reveal className="meth-demo-head" id="demo">
            <p>
              <strong>Ukraine, ranked.</strong> The real {NUMBERS.ukraineMonth} reading of {formatInt(NUMBERS.ukraineSquares)} squares, as the app shows it: the top of the list for each time frame, and the whole country on the map.
            </p>
          </Reveal>
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

          <Reveal className="meth-checks-intro" id="checks">
            <p>
              <strong>Checked against independent records.</strong> The app’s readings beside Copernicus’s maps of three disasters and the USDA crop layer, and the paper’s damage score beside ACLED’s record of fighting.
            </p>
          </Reveal>
          <Reveal className="meth-checks-table" delay={0.08} y={24}>
            <ProofTable />
          </Reveal>
          <Reveal className="meth-limits-text" delay={0.12}>
            <p>
              <strong>What it cannot do.</strong> A screen, not a survey. Ten-metre pixels miss small fields; clouds delay optical readings; radar change is less reliable where 2019 to 2021 were not calm; and it never declares land safe.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-dark" id="technology" aria-labelledby="meth-behind">
        <div className="pg-grid">
          <Reveal className="meth-head">
            <h2 className="pg-h2" id="meth-behind">
              Behind it
            </h2>
          </Reveal>
          <div className="meth-tech-body">
            <Reveal delay={0.08}>
              <p>
                <strong>What it reads:</strong> {listOf(DATASETS.map((item) => item.name))}, {DATASETS.length} open datasets, each read against its own normal years.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <p id="design">
                <strong>Built with:</strong> {listOf(STACK.map((item) => item.name))}. More than {formatInt(testsFloor)} automated tests. Drawn as a mockup first, then built.
              </p>
            </Reveal>
            <Reveal className="meth-accounts" delay={0.16}>
              <p>Accounts run on Firebase (Google, or e‑mail and password); your fields, readings and reports are kept on our own server and never sold, and messages from the contact page are kept on our server and e‑mailed to {CONTACT_EMAIL}. When you ask the assistant, your question and your fields’ readings go to Anthropic’s Claude to be answered; the satellite maths runs on Google Earth Engine.</p>
              <p>
                <a className="pg-link" href={LINKS.github} target="_blank" rel="noreferrer">
                  The code is public on GitHub
                </a>
                , and{" "}
                <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
                  the research data and code are on Harvard Dataverse
                </a>
                .
              </p>
            </Reveal>
          </div>
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
            <p>Register for Field or Atlas and read the first pass yourself. The demo is open to everyone and read-only.</p>
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
