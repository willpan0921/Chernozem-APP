// WHAT THIS FILE DOES
// The website's Story page (chernozem.app/story): where Chernozem comes
// from, in five parts and nothing else, in this order:
//   1. the meal: the story told at William's family table (the first
//      screen, under the page's title);
//   2. the meeting: Penn, where William met some of his current partners;
//   3-5. the first, second and third editions of the tool, each with a few
//      plain sentences and its pictures, large.
// While the editions pass, a bar of the three sticks to the top of the
// screen: each part fills with sage as the visitor reads through that
// edition, and a click takes them to any edition (plain links, so it also
// works without JavaScript).
//
// Every fact here is the founder's (the website brief); the numbers come
// from src/site/content/site.js so they are quoted once. Nothing here
// names who makes the app or asks the visitor to sign up: the page is the
// story only.
//
// The Harvard Dataverse deposit is the Recovery Atlas's package (its
// server, page and tables), so its link sits under the Second edition; the
// First edition says only that the notebook became the research paper.
// The old maps' base-map credits were cropped off with their corners, so
// the page carries them: OpenStreetMap under the First edition's maps
// (with ACLED for the attacks), OpenFreeMap in the Second edition's caption.
//
// WHO EDITS IT
// The founder, for the words. The pictures are in public/site/story/ and
// public/site/shots/; the layout is the "story-" block of pages.css.

import { useEffect, useRef, useState } from "react";
import { LINKS, NUMBERS, formatInt } from "../content/site.js";
import { useMediaQuery, usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

// The three editions, in order: the address of each part of the page and
// the word the bar shows ("First" + " edition").
const EDITIONS = [
  { id: "first-edition", word: "First" },
  { id: "second-edition", word: "Second" },
  { id: "third-edition", word: "Third" },
];

// -0.8 printed with a true minus sign, as in the paper.
function signed(n) {
  return String(n).replace("-", "−");
}

// Follows the reading: which edition is in the middle of the screen, and
// how far through each one the visitor is (0 to 1). The fills are moved
// directly (no re-render on every scroll); only the current edition is
// React state. With reduced motion a part fills whole once it is reached,
// instead of growing with the scroll.
function useEditionProgress() {
  const [active, setActive] = useState(null);
  const fills = useRef({});
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = window.innerHeight * 0.5;
      let current = null;
      for (const { id } of EDITIONS) {
        const part = document.getElementById(id);
        if (!part) continue;
        const box = part.getBoundingClientRect();
        const through = Math.max(0, Math.min(1, (line - box.top) / Math.max(1, box.height)));
        if (box.top <= line && box.bottom > line) current = id;
        const fill = fills.current[id];
        if (fill) fill.style.transform = `scaleX(${reduced ? (through > 0 ? 1 : 0) : through.toFixed(3)})`;
      }
      setActive((before) => (before === current ? before : current));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced]);

  return { active, fills };
}

export default function StoryPage() {
  usePageTitle("Story");
  // The entrances of each part (site.css, "Entrances"): one observer
  // callback, attached to every part's grid.
  const reveal = useReveal();
  const { active, fills } = useEditionProgress();

  return (
    <div className="pg story">
      {/* 1. The meal: the page's title and the family story, on the black-soil field. */}
      <section className="pg-sec pg-sec-dark story-meal" aria-labelledby="story-title">
        <div className="pg-grid story-meal-grid">
          <div className="story-meal-title">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="story-title">
                Where Chernozem comes from
              </h1>
            </div>
          </div>
          <div className="story-meal-text">
            <p className="story-statement pg-fade">For three generations, one story was told at William’s family table.</p>
            <p className="pg-fade-2">His great-grandparents farmed black soil in northeastern China. The Sino-Japanese War left their land unusable, and for a while there was nothing to eat.</p>
          </div>
        </div>
      </section>

      {/* 2. The meeting. */}
      <section className="pg-sec story-penn" aria-labelledby="story-penn">
        <div className="pg-grid" ref={reveal}>
          <h2 className="pg-h2 story-penn-head" id="story-penn" data-rise="">
            At Penn
          </h2>
          <div className="story-penn-text">
            <p className="story-statement" data-rise="" style={{ "--i": 1 }}>
              William took that story with him to a business program at the University of Pennsylvania.
            </p>
            <p data-rise="" style={{ "--i": 2 }}>
              There he met some of his current partners. They have worked on Chernozem together since.
            </p>
          </div>
        </div>
      </section>

      {/* 3-5. The editions, with the bar that follows the reading. */}
      <div className="story-editions">
        <nav className="story-mark" aria-label="The three editions">
          <ol className="story-mark-list">
            {EDITIONS.map(({ id, word }) => (
              <li key={id}>
                <a className="story-mark-link" href={`#${id}`} aria-label={`${word} edition`} aria-current={active === id ? "true" : undefined}>
                  <span
                    className="story-mark-fill"
                    aria-hidden="true"
                    ref={(node) => {
                      fills.current[id] = node;
                    }}
                  />
                  <span className="story-mark-label">
                    {word}
                    <span className="story-mark-rest"> edition</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <section className="pg-sec story-ed story-ed-1" id="first-edition" aria-labelledby="first-edition-title">
          <div className="pg-grid" ref={reveal}>
            <h2 className="pg-h2 story-ed-head" id="first-edition-title" data-rise="">
              First edition
            </h2>
            <div className="story-ed-text" data-rise="" style={{ "--i": 1 }}>
              <p>A Google Colab notebook on Google Earth Engine that mapped Ukraine’s black soil, oblast by oblast, and the disturbance on it.</p>
              <p>
                Checked against {formatInt(NUMBERS.acledEvents)} recorded explosion and remote-violence events from ACLED (rank correlation {NUMBERS.acledCorrelation}) and against the change in harvests (r = {signed(NUMBERS.harvestCorrelation)}), it became a research paper ranking {NUMBERS.paperOblasts} oblasts.
              </p>
            </div>
            <figure className="pg-fig story-ed1-main" data-settle="" style={{ "--i": 2 }}>
              <img className="pg-pic" src="/site/story/edition-1-colab.webp" width="1340" height="892" alt="The first edition's map: Ukraine's black soil shaded green, oblast by oblast, on a plain base map" loading="lazy" decoding="async" />
              <figcaption>Ukraine’s black soil in green, oblast by oblast.</figcaption>
            </figure>
            <div className="story-ed1-side">
              <figure className="pg-fig" data-settle="" style={{ "--i": 3 }}>
                <img className="pg-pic story-crop" src="/site/story/disturbance-map.webp" width="1600" height="964" alt="The disturbance layer: unusual change on Ukraine's land in orange and red, heaviest in the east and the south" loading="lazy" decoding="async" />
                <figcaption>The disturbance layer: unusual change on the land in orange and red.</figcaption>
              </figure>
              <figure className="pg-fig" data-settle="" style={{ "--i": 4 }}>
                <img className="pg-pic story-crop" src="/site/story/acled-events.webp" width="1324" height="942" alt="ACLED's recorded attacks across Ukraine as orange and red dots, crowded along the front line in the east and the south" loading="lazy" decoding="async" />
                <figcaption>The check: ACLED’s recorded attacks, as orange and red dots.</figcaption>
              </figure>
            </div>
            {/* The credit the maps' own corners do not carry (cropped away). */}
            <p className="story-credit" data-rise="" style={{ "--i": 5 }}>
              Base maps ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                OpenStreetMap
              </a>{" "}
              contributors. Attacks:{" "}
              <a href="https://acleddata.com/" target="_blank" rel="noreferrer">
                ACLED
              </a>
              .
            </p>
          </div>
        </section>

        <section className="pg-sec pg-sec-surface story-ed story-ed-2" id="second-edition" aria-labelledby="second-edition-title">
          <div className="pg-grid" ref={reveal}>
            <div className="story-ed2-text">
              <h2 className="pg-h2 story-ed-head" id="second-edition-title" data-rise="">
                Second edition
              </h2>
              <div className="story-ed2-words" data-rise="" style={{ "--i": 1 }}>
                <p>The Chernozem Recovery Atlas, a web page run on a laptop.</p>
                <p>Near-term and postwar readings, sliders for soil value, disturbance and recovery context, about a dozen map layers and a ranked list of oblasts, in English or Chinese.</p>
                <p className="story-ed-link">
                  <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
                    Its data and code are on Harvard Dataverse
                  </a>
                </p>
              </div>
            </div>
            <figure className="pg-fig story-ed2-pic" data-settle="" style={{ "--i": 2 }}>
              <img className="pg-pic" src="/site/story/edition-2-atlas.webp" width="1497" height="1280" alt="The second edition, the Chernozem Recovery Atlas in a browser on localhost: the weights and map layers on the left, Ukraine's oblasts coloured by priority, the top oblasts on the right" loading="lazy" decoding="async" />
              <figcaption>
                The Recovery Atlas on localhost: the weights and map layers on the left, the top oblasts on the right. Base map:{" "}
                <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
                  OpenFreeMap
                </a>
                , ©{" "}
                <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
                  OpenMapTiles
                </a>
                , ©{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap
                </a>{" "}
                contributors.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="pg-sec story-ed story-ed-3" id="third-edition" aria-labelledby="third-edition-title">
          <div className="pg-grid" ref={reveal}>
            <h2 className="pg-h2 story-ed-head" id="third-edition-title" data-rise="">
              Third edition
            </h2>
            <div className="story-ed-text" data-rise="" style={{ "--i": 1 }}>
              <p>This app, at chernozem.app.</p>
              <p>Field reads a farmer’s own fields on every clear Sentinel-2 pass: plant health, water, stress and harvest timing, against 2019 to 2021.</p>
              <p>Atlas scores any country or region square by square for governments and NGOs, after a war, flood, wildfire or drought.</p>
            </div>
            <figure className="pg-fig story-ed3-pic story-ed3-field" data-settle="" style={{ "--i": 2 }}>
              <img className="pg-pic story-crop story-crop-field" src="/site/shots/field-fields-detail.webp" width="1920" height="1369" alt="Field: the demo farm near Kupiansk on satellite imagery, Field 11 selected with its water, plant health, stress and harvest readings" loading="lazy" decoding="async" />
              <figcaption>Field: Field 11 on the demo farm near Kupiansk, with its four readings.</figcaption>
            </figure>
            <figure className="pg-fig story-ed3-pic story-ed3-atlas" data-settle="" style={{ "--i": 3 }}>
              <img className="pg-pic story-crop story-crop-atlas" src="/site/shots/atlas-overview.webp" width="1920" height="1200" alt="Atlas: the overview of Ukraine for September 2026, with the cropland analysed, the damage, and the map of where to start" loading="lazy" decoding="async" />
              <figcaption>Atlas: Ukraine in September 2026, with the places to start.</figcaption>
            </figure>
          </div>
        </section>
      </div>
    </div>
  );
}
