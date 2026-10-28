// WHAT THIS FILE DOES
// The website's Story page (chernozem.app/story): where Chernozem comes
// from. The family meal, the black soil, the war in Ukraine, the three
// editions of the tool in pictures, who makes it (with the film), what it
// stands for, and a way in. Every fact here is the founder's; the numbers
// come from src/site/content/site.js so they are quoted once.
//
// WHO EDITS IT
// The founder, for the words. The pictures are in public/site/story/ and
// public/site/shots/.

import { Link } from "react-router-dom";
import Film from "../components/Film.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { LINKS, NUMBERS, SITE_ACTIONS, compactHa, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

// The three editions, in order, with what each picture shows.
const EDITIONS = [
  { src: "/site/story/edition-1-colab.webp", w: 1340, h: 892, alt: "The first edition: a green map of Ukraine's black soil by oblast on a plain base map", caption: "First edition: a Google Colab notebook over Earth Engine. The black-soil map of Ukraine, oblast by oblast, on a plain base map." },
  { src: "/site/story/disturbance-map.webp", w: 1600, h: 964, alt: "The disturbance layer: unusual change on the land in orange and red over Ukraine", caption: "The disturbance layer from the same notebook: unusual change on the land in orange and red." },
  { src: "/site/story/acled-events.webp", w: 1324, h: 942, alt: "ACLED's recorded attacks as orange and red dots laid over the damage map", caption: "The check: ACLED’s recorded attacks, in orange and red dots, laid over the damage." },
  { src: "/site/story/edition-2-atlas.webp", w: 1497, h: 1280, alt: "The second edition, the Chernozem Recovery Atlas web page with sliders, map layers and a ranked list", caption: "Second edition: the Chernozem Recovery Atlas, a web page with sliders for the weights, map layers and a ranked list." },
  { src: "/site/shots/atlas-overview.webp", w: 1920, h: 1200, alt: "The third edition: the Atlas overview of Ukraine in this app, with the headline figures and the priority map", caption: "Third edition: this app. Field and Atlas, accounts, any crisis, any country." },
];

export default function StoryPage() {
  usePageTitle("Story");
  return (
    <div className="pg">
      {/* The first screen: the title, the lead, and the first edition's map, large. */}
      <section className="pg-sec" aria-labelledby="story-title">
        <div className="pg-grid">
          <div className="story-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1" id="story-title">
                Where Chernozem comes from
              </h1>
            </div>
            <p className="pg-lead pg-fade">A family meal, a summer on the fields, a war on the same soil, and three editions of a tool.</p>
          </div>
          <figure className="pg-fig story-open-pic pg-fade-2">
            <img className="pg-pic" src="/site/story/edition-1-colab.webp" width="1340" height="892" alt="The first edition of Chernozem: a map of Ukraine with its black soil shaded green, oblast by oblast" loading="eager" decoding="async" />
            <figcaption>The first edition, 2025: Ukraine’s black soil, oblast by oblast.</figcaption>
          </figure>
        </div>
      </section>

      <section className="pg-sec" aria-labelledby="story-meal">
        <div className="pg-grid">
          <Reveal className="story-row-head">
            <h2 className="pg-h2" id="story-meal">
              The meal
            </h2>
          </Reveal>
          <Reveal className="story-row-body" delay={0.08}>
            <p>There is a meal in William’s family that no one was supposed to have. His great-grandparents farmed black soil in northeastern China; a war went through it and left the land unusable, and for a while there was nothing to eat. The story was told at the table for three generations.</p>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec" aria-labelledby="story-soil">
        <div className="pg-grid">
          <Reveal className="story-soil-pic" y={36}>
            <figure className="pg-fig">
              <img className="pg-pic" src="/site/shots/atlas-map-satellite.webp" width="1920" height="1200" alt="Satellite imagery of Ukraine and the Black Sea in the Atlas, with the squares and borders switched off" loading="lazy" decoding="async" />
              <figcaption>Ukraine from orbit in the Atlas: the largest black-soil belt on Earth.</figcaption>
            </figure>
          </Reveal>
          <div className="story-soil-text">
            <Reveal>
              <h2 className="pg-h2" id="story-soil">
                The soil
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p style={{ marginTop: 22 }}>
                Chernozem means black earth: deep, dark and full of carbon. It makes up about {NUMBERS.blackSoilCroplandPercent}% of the world’s cropland and grows about {NUMBERS.blackSoilWheatPercent}% of its wheat (FAO, 2022). The two largest belts are in Ukraine and northeastern China.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="pg-sec pg-sec-dark" aria-labelledby="story-ukraine">
        <div className="pg-grid">
          <Reveal className="story-ua-head">
            <h2 className="pg-h2" id="story-ukraine">
              Ukraine
            </h2>
          </Reveal>
          <Reveal className="story-ua-col" delay={0.08}>
            <p>
              On 24 February 2022 the war came to the largest black-soil belt on Earth. By 2025 the FAO counted {compactHa(NUMBERS.cratersHa).replace("M", " million")} hectares of cratered land; before the war, Ukraine’s food exports fed about {NUMBERS.peopleFedMillions} million people a year.
            </p>
          </Reveal>
          <Reveal className="story-ua-col" delay={0.16}>
            <p>
              William’s paper ranked {NUMBERS.paperOblasts} oblasts with a gated aggregation method and checked it against {formatInt(NUMBERS.acledEvents)} recorded attacks (rank correlation {NUMBERS.acledCorrelation}) and harvest figures (r = {NUMBERS.harvestCorrelation}). The data and code are on Harvard Dataverse.
            </p>
          </Reveal>
          <Reveal className="story-ua-link" delay={0.24}>
            <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
              The paper’s data and code on Harvard Dataverse
            </a>
          </Reveal>
        </div>
      </section>

      <section className="pg-sec" aria-labelledby="story-editions">
        <Reveal className="story-editions-head">
          <h2 className="pg-display" id="story-editions">
            Three editions
          </h2>
        </Reveal>
        <Stagger className="pg-grid">
          {EDITIONS.map((item, index) => (
            <StaggerItem key={item.src} as="figure" className={`pg-fig story-ed ${index < 3 ? "story-ed-3" : "story-ed-2"}`}>
              <img className="pg-pic" src={item.src} width={item.w} height={item.h} alt={item.alt} loading="lazy" decoding="async" />
              <figcaption>{item.caption}</figcaption>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="pg-sec pg-sec-dark" aria-labelledby="story-who">
        <div className="pg-grid">
          <div className="story-who-text">
            <Reveal>
              <h2 className="pg-h2" id="story-who">
                Who makes it
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p style={{ marginTop: 22 }}>William Pan, a high-school student in Pasadena, California (Polytechnic School and Stanford Online High School). Chernozem is his entry to the Congressional App Challenge 2026; this is the three-minute film from it.</p>
            </Reveal>
          </div>
          <Reveal className="story-who-film" delay={0.12} y={36}>
            <Film caption="" />
          </Reveal>
        </div>
      </section>

      <section className="pg-sec pg-sec-sage" aria-labelledby="story-stands">
        <div className="pg-grid">
          <Reveal className="story-stand-head">
            <h2 className="pg-h2" id="story-stands">
              What it stands for
            </h2>
          </Reveal>
          <Stagger as="ul" className="story-stand-list">
            <StaggerItem as="li">It never declares land safe.</StaggerItem>
            <StaggerItem as="li">You set the weights; the app shows the numbers and the sources.</StaggerItem>
            <StaggerItem as="li">It is honest about its limits: 10‑metre pixels, clouds, and years that were not calm.</StaggerItem>
            <StaggerItem as="li">Open data, read for people who are not scientists.</StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="pg-sec pg-sec-dark" aria-labelledby="story-close">
        <div className="pg-grid">
          <Reveal className="story-close-head">
            <h2 className="pg-h2" id="story-close">
              Try it on your own land
            </h2>
          </Reveal>
          <Reveal className="story-close-act" delay={0.1}>
            <p>Register, draw your fields, and read the first pass in about twenty seconds.</p>
            <div className="pg-actions">
              <Link className="pg-btn" to={SITE_ACTIONS.register.path}>
                Register
              </Link>
              <Link className="pg-link" to="/#letter">
                Read the founder’s letter
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
