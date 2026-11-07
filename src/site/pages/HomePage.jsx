// WHAT THIS FILE DOES
// The website's About page (chernozem.app/), in the order the owner asked
// for:
//   1. the hero, on the light ground: on the left the slogan "Drop your
//      pin, know your land." (the page's title), the problem in two plain
//      sentences (wars and climate disasters hit hardest the farmers who
//      depend on their land), then, in bold, that Chernozem "solves the
//      problem of that harm going unseen", and the two actions (Register
//      for Chernozem, Try the demo); on the right the Earth (components/
//      EarthGlobe.jsx, which fetches its own data and credits its own
//      sources; on a wide screen it opens a dot's card in the empty
//      "hero-side" slot, in the words' place). On a phone the words come
//      first and the Earth under them
//   2. "What is Chernozem", back as it was on 1 November 2026 at the
//      owner's request: what it is in one bold sentence, then one phrase
//      each for Field and Atlas and where the name comes from, beside the
//      owner's picture of the two (the logo above Field and Atlas, shown
//      whole; public/site/shots/what-field-atlas-*.webp)
//   3. "Why Chernozem": the owner's eight reasons as a bulleted list, each
//      a short bold claim and one line, beside a photograph of spent
//      artillery shell casings left in a field, credited under it as the
//      article it was published in prints it (public/site/photos/, whose
//      manifest.json says where it came from)
//   4. Field and 5. Atlas: two held, sideways stories (components/
//      ScrollStory.jsx): what each is, then how it works, each step with a
//      picture of the app at true size
//   6. "One field, one pass, one answer": the app's field row, in the state
//      the visitor picks, its button really working
//   7. the proof: the checks against independent records, as a table
//   8. the Ukraine demo, live, on the sage stage (built, and its data
//      fetched, only when the visitor comes near the end of the page)
//   9. the close: the action tile beside a satellite view; then what the
//      readings are and are not ("A detection framework": no soil samples
//      in a disaster zone and no hardware on the ground, roughly as
//      accurate as the owner's own tests found, from site.js, so a guide
//      to check on the ground), and the small print (where the maps in the
//      pictures come from)
// The three-minute film moved to the Methodology page; the founder's
// letter, the stage slider and the feature lists are gone.
// Numbers come from src/site/content/site.js. The pictures of the app are
// cut at true size, each with a copy twice as sharp for sharp screens that
// only those screens load (srcSet; public/site/shots/crops/, where
// manifest.json says from which view and how they were shot).
// Layout: home.css. Every section keeps to the menu's frame: text starts
// at the page's left edge, or three columns in (the field row, the second
// line of "the record"). The site's base stylesheet (site.css) is imported
// first, before anything else here, so its rules always sit before home.css
// and the components' sheets, and those win every tie with it, whichever
// of this page and the site's frame arrives first (a test checks it).
// Languages: every sentence a visitor reads goes through t() (src/site/
// i18n/, namespace "home"), the English sentence being the key; the step
// lists and the reasons stay English in their constants and are translated
// where they are drawn. Anything that varies, or any name joined with
// no-break spaces, is a {hole} filled where the sentence is drawn.
//
// WHO EDITS IT
// Whoever works on the About page.

import "../site.css";
import { Suspense, lazy, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import EarthGlobe from "../components/EarthGlobe.jsx";
import ScrollStory from "../components/ScrollStory.jsx";
import FieldRowStates from "../components/FieldRowStates.jsx";
import ProofTable from "../components/ProofTable.jsx";
import { NUMBERS, SITE, formatInt } from "../content/site.js";
import { useNear, usePageTitle, useReveal } from "../hooks.js";
import { useT } from "../i18n/i18n.js";
import "./home.css";

// The Ukraine demo (components/DemoRanking.jsx, not edited) is downloaded
// with its data only when the end of the page comes near (useNear below).
const DemoRanking = lazy(() => import("../components/DemoRanking.jsx"));

// A no-break space (U+00A0): the words it joins never part at the end of a
// line ("Google Earth Engine", "about 20 seconds", "Camera 51").
const NBSP = "\u00a0";
const EARTH_ENGINE = `Google${NBSP}Earth${NBSP}Engine`;

// Why Chernozem: the owner's eight reasons (his list of 31 October 2026,
// asked for again as bullets), each a short bold claim and one line, shown
// as a bulleted list. The wording stays honest: "most tools", never "all
// competitors", and no claim to be the most of anything. The one number
// ({seconds}, from site.js) and the joined name ({earthEngine}) are holes,
// filled where the list is drawn, so each sentence is one dictionary key.
const WHY = [
  {
    claim: "No hardware, only software.",
    text: "Nothing to install on the land. In a disaster that matters most: equipment there is costly, and often impossible to bring in.",
  },
  {
    claim: "Free satellite data, read on {earthEngine}.",
    text: "Open data anyone can use: the public Sentinel satellites, read for you on {earthEngine}.",
  },
  {
    claim: "Recovery, not only monitoring.",
    text: "Most tools only monitor healthy soil. Chernozem monitors it too, then ranks damaged land and shows where recovery should start.",
  },
  {
    claim: "For every stakeholder.",
    text: "Individuals and organizations alike: Field for a farmer’s own fields, Atlas for governments, NGOs and corporations.",
  },
  {
    claim: "You choose what matters.",
    text: "You set the weights for value, damage and feasibility, and the ranking follows your priorities.",
  },
  {
    claim: "Drop the pin, see the field.",
    text: "Easy to use: point at a place, and the app finds the fields there and reads each one.",
  },
  {
    claim: "A few clicks, start to finish.",
    text: "Finding the right satellite images and analysing them happens for you: a ten-field farm is read in about {seconds} seconds.",
  },
  {
    claim: "All you need is a place.",
    text: "Select the coordinates, type an address or draw an outline. No files, no sensors, no survey.",
  },
];

// Each reason's last two words share a line (the last plain space becomes
// a no-break one), so none ends on a word alone where the browser cannot
// even out a paragraph's last line (text-wrap: pretty; Safari before 26).
const lastTwoTogether = (text) => text.replace(/ (?=[^ ]*$)/, NBSP);

// A number and the words on either side of it share a line too ("about 20
// seconds"), in every language: the plain spaces beside a digit become
// no-break ones.
const digitsTogether = (text) => text.replace(/ (?=\d)|(?<=\d) /g, NBSP);

// The two stories. Each step: a short title, one or two plain sentences,
// a picture of the app (crops/<shot>-800.webp and -1600.webp) with what it
// shows in words, and the part of the picture a narrow window keeps (fx,
// fy on a phone; tx, when given, on a window a little narrower than the
// picture). The first step says what the product is, the rest how it works.
// Field's second and third steps say how it reads the land, as Atlas's
// "Three scores" does; each claim is the code's (server/providers/
// field-gee.js detectFields and analyzeFields, src/lib/field/method.js,
// docs/METHODS.md): the fields are traced from Canny edges in Sentinel-2
// composites of the last complete growing season and the one before, and
// offered for the farmer to pick; clouds go pixel by pixel (Cloud Score+);
// plant health, water and stress (the NDVI rule or the red-edge rule) are
// each against the same weeks of 2019 to 2021, and harvest timing comes
// from the season's own dry-down, heat units and radar, so it is named
// apart from them.
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
    text: "Search for a place or paste coordinates. Field traces the edges between fields in Sentinel-2 images of the last two seasons and offers the fields it finds; you keep yours.",
    shot: "story-field-pin",
    alt: "Field’s farm setup: coordinates typed in the search, the place found, “Find my fields”, and the pin on the satellite map inside the dashed circle it will search.",
    fx: "95%",
    fy: "70%",
    tx: "0%",
  },
  {
    title: "Every clear pass, read",
    text: "Clouds are removed pixel by pixel. Each field gets plant health (NDVI), water (NDWI) and stress (two tests, one on the red edge) against the same weeks of 2019 to 2021, and its harvest timing.",
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

// The photograph beside "Why Chernozem": spent artillery shell casings in a
// field, the owner's crop of the header photo of Responsible Statecraft's
// article "Ukraine's vaunted 'bread basket' soil is now toxic" (29 February
// 2024), credited as the article prints it, with a link to the article. The
// article gives no place or date, so the caption names none
// (public/site/photos/manifest.json). Two copies, 600 x 582 and one twice
// as sharp for sharp screens (srcSet); it is never shown wider than the
// first (home.css .why-photo). The credit and the publication's name are
// names, the same in every language: the caption takes them as holes.
const PHOTO = {
  small: "/site/photos/shell-casings-field-600.webp",
  large: "/site/photos/shell-casings-field-1200.webp",
  alt: "Spent artillery shell casings, some rusted, lie in the grass of a field, with dry weeds and trees behind.",
  credit: `Jose Hernandez, Camera${NBSP}51 / Shutterstock.com`,
  publication: "Responsible Statecraft",
  article: "https://responsiblestatecraft.org/ukraine-soil-contamination/",
};

export default function HomePage() {
  usePageTitle();
  const t = useT("home");
  const reveal = useReveal();
  // What fills the reasons' holes: the joined name and the number, written
  // in the website's language.
  const whyVars = { earthEngine: EARTH_ENGINE, seconds: formatInt(NUMBERS.tenFieldsSeconds) };
  // The page's last four parts (the field row, the record, the demo and the
  // close) play their entrances together, and the demo is built, once the
  // field row is within 2,400 px of the screen, rather than each as it
  // scrolls in: with the two held stories the page is long (about 16
  // screens on a phone), and a fast scroll, or a tool that scans the page
  // (the design inspector walks eleven screens, which end above the field
  // row on a phone and at 1,024 px), must never find their words still
  // waiting to appear. The close starts them too: a visitor who lands at
  // the very end (Back from Register, the End key, a drag of the scrollbar)
  // is there with the field row more than 2,400 px above the screen on a
  // phone, and must find the end of the page shown, not waiting for a
  // scroll back up. (Without the observer, "near" is true at once: nothing
  // is ever hidden for good.)
  const [tailRef, tailNear] = useNear("2400px 0px");
  const [closeRef, closeNear] = useNear("2400px 0px");
  const near = tailNear || closeNear;
  const tail = near ? " is-in" : "";
  // The field row's section starts the tail, and also reveals itself once
  // it is on the screen, whichever comes first.
  const showcaseRef = useCallback(
    (node) => {
      reveal(node);
      tailRef.current = node;
    },
    [reveal, tailRef]
  );
  // The place beside the Earth where it opens a dot's card (in the words'
  // place, on a screen wide enough for both; components/EarthGlobe.jsx).
  const side = useRef(null);

  return (
    <>
      {/* 1. The hero: the words on the left, the Earth on the right */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap grid hero-grid">
          <div className="hero-words">
            <h1 id="hero-title" className="hero-title lines">
              <span className="line">
                <span data-line style={{ "--i": 0 }}>
                  {t("Drop your pin,")}
                </span>
              </span>
              <span className="line">
                <span data-line style={{ "--i": 1 }}>
                  {t("know your land.")}
                </span>
              </span>
            </h1>
            {/* The problem, then, in bold, what Chernozem does about it (the owner's words) */}
            <p className="hero-lead" data-load style={{ "--d": "420ms" }}>
              {t("As geopolitical and environmental tensions rise, wars and climate disasters strike more often. They hit hardest the people noticed least: the farmers who depend on their land to survive.")}
            </p>
            <p className="hero-solves" data-load style={{ "--d": "450ms" }}>
              {t("Chernozem solves the problem of that harm going unseen.")}
            </p>
            <div className="hero-actions" data-load style={{ "--d": "480ms" }}>
              <Link to={SITE.registerPath} className="btn">
                {t("Register for Chernozem")}
              </Link>
              <Link to={SITE.demoPath} className="link link-under">
                {t("Try the demo")}
              </Link>
            </div>
          </div>
          {/* The Earth's card, beside it: empty until a dot is picked */}
          <div className="hero-side" ref={side} />
          <div className="hero-earth">
            <EarthGlobe side={side} />
          </div>
        </div>
      </section>

      {/* 2. What is Chernozem: the words beside the owner's picture of Field and Atlas */}
      <section className="what section" aria-labelledby="what-title" ref={reveal}>
        <div className="wrap grid">
          <div className="what-words">
            <h2 id="what-title" className="head" data-rise>
              {t("What is Chernozem")}
            </h2>
            <p className="lead what-lead" data-rise style={{ "--i": 1 }}>
              <strong>{t("Chernozem is satellite farmland monitoring: free satellite data over farmland, read and put into plain words for people who are not scientists.")}</strong> {t("Field watches a farmer’s own fields; Atlas scores a whole region for governments, NGOs and corporations. The name is the black soil of Ukraine and northeast China, where its story began.")}
            </p>
            <p className="what-link" data-rise style={{ "--i": 2 }}>
              <Link to="/story" className="link link-under">
                {t("How it started")}
              </Link>
            </p>
          </div>
          <div className="what-side" data-settle style={{ "--i": 1 }}>
            <figure className="what-picture">
              <img
                src="/site/shots/what-field-atlas-600.webp"
                srcSet="/site/shots/what-field-atlas-600.webp 1x, /site/shots/what-field-atlas-1200.webp 2x"
                alt={t("Chernozem’s pin and name above two screens of the app: Field, with the demo farm’s fields outlined on satellite imagery and Field 12’s water, plant health, stress and harvest readings beside them; and Atlas, with Ukraine’s cropland in squares shaded by priority for September 2026, the weights on the left and the top areas on the right.")}
                width="600"
                height="800"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <p className="window-caption muted">
              {t("Field, above, on the demo farm near Kupiansk; Atlas, below, across Ukraine.")}{" "}
              <Link to={SITE.demoPath} className="link link-under">
                {t("Open the demo")}
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* 3. Why Chernozem: the eight reasons as a bulleted list, the photograph beside them */}
      <section className="why section" aria-labelledby="why-title" ref={reveal}>
        <div className="wrap grid">
          <h2 id="why-title" className="head why-head" data-rise>
            {t("Why Chernozem")}
          </h2>
          {/* role="list": Safari stops calling a list a list once its markers are styled away */}
          <ul className="why-list" role="list">
            {WHY.map((item, i) => (
              <li className="why-item" key={item.claim} data-rise style={{ "--i": i + 1 }}>
                <strong className="why-claim">{t(item.claim, whyVars)}</strong> {lastTwoTogether(digitsTogether(t(item.text, whyVars)))}
              </li>
            ))}
          </ul>
          <figure className="why-photo" data-rise style={{ "--i": 1 }}>
            <img src={PHOTO.small} srcSet={`${PHOTO.small} 1x, ${PHOTO.large} 2x`} alt={t(PHOTO.alt)} width="600" height="582" loading="lazy" decoding="async" />
            <figcaption className="window-caption muted">
              {t("Spent artillery shell casings left in a field. Photo: {credit}, as published in {article}.", {
                credit: PHOTO.credit,
                article: (
                  <a href={PHOTO.article} className="link link-under" target="_blank" rel="noreferrer">
                    {PHOTO.publication}
                  </a>
                ),
              })}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 4. Field and 5. Atlas: the held, sideways stories */}
      <ScrollStory id="field-story" title={t("Field, for one farm")} link={{ to: "/field", label: t("Open Field in the demo") }} steps={FIELD_STEPS} />
      <ScrollStory id="atlas-story" title={t("Atlas, for a whole region")} link={{ to: "/atlas", label: t("Open Atlas in the demo") }} steps={ATLAS_STEPS} surface />

      {/* 6. One field, one pass, one answer */}
      <section className={`showcase section${tail}`} aria-labelledby="showcase-title" ref={showcaseRef}>
        <div className="wrap grid">
          <h2 id="showcase-title" className="head showcase-head" data-rise>
            {t("One field, one pass, one answer")}
          </h2>
          <FieldRowStates />
        </div>
      </section>

      {/* 7. The proof */}
      <section className={`proof section${tail}`} aria-labelledby="proof-title">
        <div className="wrap">
          <h2 id="proof-title" className="display proof-head lines">
            <span className="line">
              <span data-rise style={{ "--i": 0 }}>
                {t("Checked against")}
              </span>
            </span>{" "}
            <span className="line proof-head-step">
              <span data-rise style={{ "--i": 1 }}>
                {t("the record")}
              </span>
            </span>
          </h2>
          <div className="proof-body" data-rise style={{ "--i": 3 }}>
            <ProofTable />
          </div>
        </div>
      </section>

      {/* 8. The demo: built when the visitor comes near the end of the page */}
      <section className={`demo-section on-sage section${tail}`} aria-labelledby="demo-title">
        <div className="wrap grid">
          <div className="demo-copy">
            <h2 id="demo-title" className="head" data-rise>
              {t("The demo is Ukraine")}
            </h2>
            <p className="lead demo-statement" data-rise style={{ "--i": 1 }}>
              {t("Chernozem started there. This is the real {month} reading of {squares} squares, rolled up to oblasts. The same app works anywhere.", { month: t(NUMBERS.ukraineMonth), squares: formatInt(NUMBERS.ukraineSquares) })}
            </p>
            <div data-rise style={{ "--i": 2 }}>
              <Link to={SITE.demoPath} className="btn">
                {t("Try the demo")}
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

      {/* 9. The close: the action tile beside a satellite view, then the disclaimer and the small print */}
      <section className={`close${tail}`} aria-labelledby="close-title" ref={closeRef}>
        <div className="close-row frame">
          <div className="close-tile close-tile-main on-accent" data-rise style={{ "--i": 0 }}>
            <h2 id="close-title" className="close-head">
              {t("See your land from space")}
            </h2>
            <p className="close-text">{t("Register, drop your pin or choose a region, and read what the satellites saw.")}</p>
            <div className="close-actions">
              <Link to={SITE.registerPath} className="btn btn-light">
                {t("Register for Chernozem")}
              </Link>
              <Link to={SITE.demoPath} className="link">
                {t("Try the demo")}
              </Link>
            </div>
          </div>
          <div className="close-tile close-tile-photo" data-slide="right" style={{ "--i": 1 }}>
            <img src="/site/shots/crops/atlas-map-satellite-sea.webp" alt={t("Satellite view of southern Ukraine, Crimea and the Black Sea, as Atlas shows it.")} width="730" height="520" loading="lazy" decoding="async" />
          </div>
        </div>
        <div className="wrap small-print-wrap">
          {/* What the readings are and are not (the owner's request): a readable size, above the small print */}
          <p className="caveat">
            <strong>{t("A detection framework.")}</strong> {t("Chernozem reads farmland from space. It cannot take soil samples in a disaster zone, and it has no hardware on the ground to confirm what it sees. In our tests its readings were roughly {percent}% accurate: close, for a tool of its kind, but not 100%. Use them as a guide, check on the ground before acting, and know that Chernozem is not responsible for decisions made from them.", { percent: NUMBERS.testAccuracyPercent })}
          </p>
          <p className="small-print">
            {t("The maps in the pictures of the app: Esri World Imagery (Esri, Maxar, Earthstar Geographics) and Esri’s light grey canvas (Esri, HERE, Garmin, © OpenStreetMap contributors). The satellite view above: Esri World Imagery.")}
          </p>
        </div>
      </section>
    </>
  );
}
