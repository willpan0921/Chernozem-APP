// WHAT THIS FILE DOES
// The website's About page (chernozem.app/), in the order of the owner's
// list of 1 November 2026:
//   1. the hero, on the light ground: on the left the slogan "Drop your
//      pin, know your land." (the page's title), what Chernozem is in
//      three plain sentences, and the two actions (Register for Chernozem,
//      Try the demo); on the right the Earth (components/EarthGlobe.jsx,
//      which fetches its own data and credits its own sources). On a phone
//      the words come first and the Earth under them
//   2. "Why Chernozem": the owner's eight reasons, each a claim and one
//      plain sentence, in two columns, beside a photograph of a wheat field
//      burnt by shelling in the Kharkiv region (public/site/photos/, its
//      credit and licence under it; manifest.json there has its source)
//   3. Field and 4. Atlas: two held, sideways stories (components/
//      ScrollStory.jsx): the section stays on the screen while the visitor
//      scrolls and its steps slide in one by one, what it is and then how
//      it works, each with a picture of the app at true size
//   5. "One field, one pass, one answer": the app's field row, in the state
//      the visitor picks, its button really working
//   6. the proof: the checks against independent records, as a table
//   7. the Ukraine demo, live, on the sage stage (built, and its data
//      fetched, only when the visitor comes near the end of the page)
//   8. the close: the action tile beside a satellite view, then the small
//      print (where the maps in the pictures come from)
// The three-minute film moved to the Methodology page; the founder's
// letter, the stage slider and the feature lists are gone.
// Numbers come from src/site/content/site.js. The pictures of the app are
// cut at true size, each with a copy twice as sharp for sharp screens that
// only those screens load (srcSet; public/site/shots/crops/, where
// manifest.json says from which view and how they were shot).
// Layout: home.css. Every section keeps to the menu's frame: text starts
// at the page's left edge, or three columns in (the field row, the second
// line of "the record").
//
// WHO EDITS IT
// Whoever works on the About page.

import { Suspense, lazy, useCallback } from "react";
import { Link } from "react-router-dom";
import EarthGlobe from "../components/EarthGlobe.jsx";
import ScrollStory from "../components/ScrollStory.jsx";
import FieldRowStates from "../components/FieldRowStates.jsx";
import ProofTable from "../components/ProofTable.jsx";
import { NUMBERS, SITE, formatInt } from "../content/site.js";
import { useNear, usePageTitle, useReveal } from "../hooks.js";
import "./home.css";

// The Ukraine demo (components/DemoRanking.jsx, not edited) is downloaded
// with its data only when the end of the page comes near (useNear below).
const DemoRanking = lazy(() => import("../components/DemoRanking.jsx"));

// Why Chernozem: the owner's eight reasons (his list of 31 October 2026),
// each a claim and one plain sentence. The wording stays honest: "most
// tools", never "all competitors"; the one number is read from site.js.
const WHY = [
  {
    claim: "No hardware, only software",
    text: "Nothing to buy or install on the land. It runs in a browser, which matters most in a disaster, where equipment is costly or cannot get in.",
  },
  {
    claim: "Free satellite data on Google Earth Engine",
    text: "The Sentinel satellites are public and their data is free. Google Earth Engine reads it for the app over a whole region at once.",
  },
  {
    claim: "It plans recovery, not only health",
    text: "Most tools only watch healthy land. Chernozem watches it too, then scores the damaged land and says where recovery can start.",
  },
  {
    claim: "For one farm or a whole country",
    text: "Field is for a farmer’s own fields. Atlas scores a region or a country square by square, from the same satellites.",
  },
  {
    claim: "You choose what matters: the weights",
    text: "In Atlas the weights for value, damage and feasibility are yours to set, so the ranking follows your priorities, not a fixed formula.",
  },
  {
    claim: "Drop a pin, see the field",
    text: "Point at a place on the map, or search for it, and the app finds the fields there and reads each one.",
  },
  {
    claim: "From satellite images to an answer in a few clicks",
    text: `Finding the right passes, cleaning them and reading them happens for you. A ten-field farm is read in about ${NUMBERS.tenFieldsSeconds} seconds.`,
  },
  {
    claim: "All it needs is a place",
    text: "No files, no sensors, no survey. Coordinates, an address or an outline drawn on the map are enough to start.",
  },
];

// The two stories. Each step: a short title, one or two plain sentences,
// a picture of the app (crops/<shot>-800.webp and -1600.webp) with what it
// shows in words, and the part of the picture a narrow window keeps (fx,
// fy on a phone; tx, when given, on a window a little narrower than the
// picture). The first step says what the product is, the rest how it works.
const FIELD_STEPS = [
  {
    title: "Your farm, field by field",
    text: "Field is Chernozem for one farm: you mark your fields once, and after every clear satellite pass it tells you how each one is doing and what needs doing.",
    shot: "story-field-map",
    alt: "The demo farm near Kupiansk on satellite imagery in Field, each field outlined and patterned by its condition, Field 11 picked, after the Sentinel-2 pass of 26 October.",
    fx: "16%",
    fy: "86%",
  },
  {
    title: "Drop a pin on your land",
    text: "Search for a place or paste coordinates, then click the map to move the pin. Field finds the fields around it, and you keep the ones that are yours.",
    shot: "story-field-pin",
    alt: "Field’s farm setup: coordinates typed in the search, the place found, “Find my fields”, and the pin on the satellite map inside the dashed circle it will search.",
    fx: "95%",
    fy: "70%",
    tx: "0%",
  },
  {
    title: "Every clear pass, read",
    text: "Each time Sentinel-2 passes on a clear day, every field gets its plant health, water, stress and harvest timing, each against its usual range.",
    shot: "story-field-reading",
    alt: "Field 11 in Field, growing well: its water near normal, its plant health above normal, stress under 1% and the harvest past its peak, beside the field on the map.",
    fx: "95%",
    fy: "50%",
  },
  {
    title: "This season against normal",
    text: "Every pass since 2019 on one chart: a field against the farm and against its normal years, with the day the full-scale invasion began marked.",
    shot: "story-field-season",
    alt: "Field’s data page: one field’s plant health since 2019 against the farm average, the normal years 2019 to 2021 shaded, and the full-scale invasion of 24 February 2022 marked.",
    fx: "45%",
    fy: "78%",
    tx: "0%",
  },
  {
    title: "Tell us what happened",
    text: "Report shelling, fire, flood, hail or pests with your photos, and ask the assistant what to do first. It answers only from your own fields’ data.",
    shot: "story-field-report",
    alt: "Field’s overview: what needs doing, then “Tell us what happened” with Shelling, Fire, Flood, Hail, Pests and Other, a note, photos and Send.",
    fx: "5%",
    fy: "73%",
  },
];

const ATLAS_STEPS = [
  // fx 82%: on every phone from 320 to 430 px wide the window shows the
  // heavily damaged land's card with its figure whole ("1.8M ha" starts 424
  // px into the picture) and none of the words of the card before it.
  {
    title: "A whole region, square by square",
    text: "Atlas is Chernozem for a whole region, for governments, NGOs and corporations: it scores every square of farmland and ranks where recovery should start.",
    shot: "story-atlas-overview",
    alt: "Atlas’s overview of Ukraine for September 2026: the cropland analysed, the black soil, the heavily damaged land and the people on it, above the map of where to start.",
    fx: "82%",
    fy: "27%",
    tx: "0%",
  },
  {
    title: "Pick a country, a region or a box",
    text: "Search a country or a province, type the corners of a box, or draw it on the map. Atlas then reads the last twelve months there.",
    shot: "story-atlas-area",
    alt: "Atlas’s “Choose an area”: a box around the Kharkiv region typed by its north, south, west and east edges, shown on a small map, ready to analyse.",
    fx: "12%",
    fy: "73%",
    tx: "30%",
  },
  {
    title: "Three scores for every square",
    text: "Value: how good the soil is. Damage: what fire and radar have seen since the crisis began. Feasibility: whether anyone can safely reach it.",
    shot: "story-atlas-square",
    alt: "One square in Mykolaiv picked in Atlas: highest priority, its value, damage and feasibility scores, and the soil types under its cropland.",
    fx: "100%",
    fy: "27%",
  },
  {
    title: "Your weights, your ranking",
    text: "Choose how much value and damage count, and how much of the least reachable land to leave out for now. The ranking follows your choice.",
    shot: "story-atlas-weights",
    alt: "Atlas’s weights for Ukraine in the near term, value, damage and the share of the least feasible land left out, beside the map of priorities square by square.",
    fx: "0%",
    fy: "30%",
  },
  {
    title: "A report donors can read",
    text: "The top areas to start with, near term or after the crisis, in a report with the method and its limits, saved as a PDF or a table.",
    shot: "story-atlas-report",
    alt: "Atlas’s donor report for Ukraine, September 2026, with Download CSV and Save as PDF: the headline figures, then the top ten areas for the near term.",
    fx: "0%",
    fy: "30%",
  },
];

// The photograph beside "Why Chernozem" and its credit (CC BY 4.0 asks for
// the author, a link to the licence, and to say it was changed: cropped).
// The file's licence box on Wikimedia Commons asks for the attribution
// "Kharkivoda.gov.ua", so the credit names the administration and its site.
const PHOTO = {
  small: "/site/photos/karasivka-wheat-600.webp",
  large: "/site/photos/karasivka-wheat-768.webp",
  licence: "https://creativecommons.org/licenses/by/4.0/",
  source: "https://commons.wikimedia.org/wiki/File:Burning_field_near_Karasivka,_2024-07-01_(11).jpg",
};

export default function HomePage() {
  usePageTitle();
  const reveal = useReveal();
  // The page's last three parts (the record, the demo and the close) play
  // their entrances together, and the demo is built, once the field row is
  // within 2,400 px of the screen, rather than each as it scrolls in: with
  // the two held stories the page is long (about 16 screens on a phone),
  // and a fast scroll, or a tool that scans the page, must never find their
  // words still waiting to appear. The close starts them too: a visitor
  // who lands at the very end (Back from Register, the End key, a drag of
  // the scrollbar) is there with the field row more than 2,400 px above
  // the screen on a phone, and must find the end of the page shown, not
  // waiting for a scroll back up. (Without the observer, "near" is true at
  // once: nothing is ever hidden for good.)
  const [tailRef, tailNear] = useNear("2400px 0px");
  const [closeRef, closeNear] = useNear("2400px 0px");
  const near = tailNear || closeNear;
  const tail = near ? " is-in" : "";
  // The field row's section both reveals itself and starts the tail.
  const showcaseRef = useCallback(
    (node) => {
      reveal(node);
      tailRef.current = node;
    },
    [reveal, tailRef]
  );
  const out = { className: "link link-under", target: "_blank", rel: "noreferrer" };

  return (
    <>
      {/* 1. The hero: the words on the left, the Earth on the right */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap grid hero-grid">
          <div className="hero-words">
            <h1 id="hero-title" className="hero-title lines">
              <span className="line">
                <span data-line style={{ "--i": 0 }}>
                  Drop your pin,
                </span>
              </span>
              <span className="line">
                <span data-line style={{ "--i": 1 }}>
                  know your land.
                </span>
              </span>
            </h1>
            <p className="hero-lead" data-load style={{ "--d": "420ms" }}>
              Chernozem reads free satellite data over farmland and puts it into plain words. Field watches a farmer’s own fields; Atlas scores whole regions for governments, NGOs and corporations. The name is the black soil of Ukraine and northeast China, where its story began.
            </p>
            <div className="hero-actions" data-load style={{ "--d": "480ms" }}>
              <Link to={SITE.registerPath} className="btn">
                Register for Chernozem
              </Link>
              <Link to={SITE.demoPath} className="link link-under">
                Try the demo
              </Link>
            </div>
          </div>
          <div className="hero-earth">
            <EarthGlobe />
          </div>
        </div>
      </section>

      {/* 2. Why Chernozem: the eight reasons in two columns, the photograph beside them */}
      <section className="why section" aria-labelledby="why-title" ref={reveal}>
        <div className="wrap grid">
          <h2 id="why-title" className="head why-head" data-rise>
            Why Chernozem
          </h2>
          <ul className="why-list">
            {WHY.map((item, i) => (
              <li className="why-item" key={item.claim} data-rise style={{ "--i": i + 1 }}>
                <h3 className="why-claim">{item.claim}</h3>
                <p className="why-text">{item.text}</p>
              </li>
            ))}
          </ul>
          <figure className="why-photo" data-settle style={{ "--i": 2 }}>
            <div className="why-photo-frame">
              <img
                src={PHOTO.small}
                srcSet={`${PHOTO.small} 600w, ${PHOTO.large} 768w`}
                sizes="(min-width: 1200px) 40vw, (min-width: 701px) 420px, 100vw"
                alt="A strip of unburnt wheat runs through a blackened field near Karasivka, in the Kharkiv region, to two firefighters spraying the flames after shelling on 1 July 2024."
                width="600"
                height="750"
                loading="lazy"
                decoding="async"
              />
            </div>
            <figcaption className="window-caption muted photo-caption">
              Wheat near Karasivka, Kharkiv region, after shelling on 1 July 2024. Photo: Kharkiv Regional State Administration (kharkivoda.gov.ua),{" "}
              <a href={PHOTO.licence} {...out}>
                CC BY 4.0
              </a>
              , cropped;{" "}
              <a href={PHOTO.source} {...out}>
                Wikimedia Commons
              </a>
              .
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 3. Field and 4. Atlas: the held, sideways stories */}
      <ScrollStory id="field-story" title="Field, for one farm" link={{ to: "/field", label: "Open Field in the demo" }} steps={FIELD_STEPS} />
      <ScrollStory id="atlas-story" title="Atlas, for a whole region" link={{ to: "/atlas", label: "Open Atlas in the demo" }} steps={ATLAS_STEPS} surface />

      {/* 5. One field, one pass, one answer */}
      <section className="showcase section" aria-labelledby="showcase-title" ref={showcaseRef}>
        <div className="wrap grid">
          <h2 id="showcase-title" className="head showcase-head" data-rise>
            One field, one pass, one answer
          </h2>
          <FieldRowStates />
        </div>
      </section>

      {/* 6. The proof */}
      <section className={`proof section${tail}`} aria-labelledby="proof-title">
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

      {/* 7. The demo: built when the visitor comes near the end of the page */}
      <section className={`demo-section on-sage section${tail}`} aria-labelledby="demo-title">
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
          <div className={`demo-stage${near ? "" : " is-waiting"}`} data-ui data-settle style={{ "--i": 2 }}>
            {near && (
              <Suspense fallback={null}>
                <DemoRanking />
              </Suspense>
            )}
          </div>
        </div>
      </section>

      {/* 8. The close: the action tile beside a satellite view, then the small print */}
      <section className={`close${tail}`} aria-labelledby="close-title" ref={closeRef}>
        <div className="close-row frame">
          <div className="close-tile close-tile-main on-accent" data-rise style={{ "--i": 0 }}>
            <h2 id="close-title" className="close-head">
              See your land from space
            </h2>
            <p className="close-text">Register, drop your pin or choose a region, and read what the satellites saw.</p>
            <div className="close-actions">
              <Link to={SITE.registerPath} className="btn btn-light">
                Register for Chernozem
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
        <div className="wrap small-print-wrap">
          <p className="small-print">
            The maps in the pictures of the app: Esri World Imagery (Esri, Maxar, Earthstar Geographics) and Esri’s light grey canvas (Esri, HERE, Garmin, © OpenStreetMap contributors). The satellite view above: Esri World Imagery.
          </p>
        </div>
      </section>
    </>
  );
}
