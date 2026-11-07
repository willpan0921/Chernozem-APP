// WHAT THIS FILE DOES
// The website's Story page (chernozem.app/story): where Chernozem comes
// from, in two parts and nothing else, in this order:
//   1. the roots, on the black-soil field (the dark band): the page's
//      title, "Forged in Three Generations", then the story in five steps
//      joined by drawn arrows pointing down: the story told at William's
//      family table; his visit to that land in northeastern China; the
//      same story in Ukraine; building the tool, for Ukraine and then for
//      everyone; and Penn, where he met some of his current partners. Each
//      step is one sentence set large with a smaller description under it.
//      The title stands above the steps at every width. On a wide screen
//      the steps start three columns in, on the page's second line of text
//      (the About page's text starts on the same two lines: the left edge,
//      or three columns in), so the band is never half empty; the arrows
//      run down one axis at their left edge. Below 1100 px the steps take
//      the whole width.
//   2. the first, second and third editions of the tool, each with a few
//      plain sentences and its pictures, large.
// While the editions pass, a bar of the three sticks to the top of the
// screen: each part fills with sage as the visitor reads through that
// edition, and a click takes them to any edition (plain links, so it also
// works without JavaScript).
//
// The steps' entrance: the first step fades in under the title as the
// page opens; each later step rises into place, and each arrow draws
// itself downwards, the first time it comes on screen. Every part above
// one that starts is finished at the same moment, so a fast scroll, a jump
// to an edition or a page opened further down never leaves part of the
// story half-shown. With reduced motion everything is simply there
// (pages.css, the "story-roots" rules).
//
// Every fact here is the founder's (the website brief); the numbers come
// from src/site/content/site.js so they are quoted once ("ten ways to rank
// damaged land" is NUMBERS.paperOperators, written as a word). Nothing
// here names who makes the app or asks the visitor to sign up: the page is
// the story only.
//
// The page's outer box is "story-page", not "story": the About page's
// sideways stories (components/scrollstory.css) style ".story", and their
// rules stay in the browser once the About page has been opened, so they
// would reach this page too.
//
// The Harvard Dataverse deposit is the Recovery Atlas's package (its
// server, page and tables), so its link sits under the Second edition; the
// First edition says only that the notebook became the research paper.
// The Second edition was the first Chernozem Atlas, the one the fourth
// step names: for Ukraine only, with no Field yet (the founder's words,
// 2026-11-03; Field came with the third).
// The old maps' base-map credits were cropped off with their corners, so
// the page carries them: OpenStreetMap under the First edition's maps
// (with ACLED for the attacks), OpenFreeMap in the Second edition's caption.
//
// Every word a visitor reads goes through t() (src/site/i18n/, namespace
// "story"), the English sentence being the dictionary key: the five steps
// stay English in ROOTS and are translated where they are rendered; the
// credits' names (OpenStreetMap, OpenFreeMap, OpenMapTiles, ACLED) stay as
// they are in every language. "Ten ways" is a word in English and a figure
// in the other languages, unless their dictionary writes the word itself.
//
// WHO EDITS IT
// The founder, for the words (the five steps are ROOTS, below). The
// pictures are in public/site/story/ and public/site/shots/; the layout is
// the "story-" block of pages.css.

import { useCallback, useEffect, useRef, useState } from "react";
import { LINKS, NUMBERS, formatInt } from "../content/site.js";
import { useMediaQuery, usePageTitle, useReveal } from "../hooks.js";
import { useT } from "../i18n/i18n.js";
// site.css before the page's own sheet, so it is always in the page first
// and pages.css's rules win their ties with it, however the page is loaded.
import "../site.css";
import "./pages.css";

// The three editions, in order: the address of each part of the page, the
// word the bar shows ("First" + " edition") and the whole name it reads out
// (the edition's heading, so the two are translated alike).
const EDITIONS = [
  { id: "first-edition", word: "First", label: "First edition" },
  { id: "second-edition", word: "Second", label: "Second edition" },
  { id: "third-edition", word: "Third", label: "Third edition" },
];

// A small count written as a word, the way the story is told ("ten
// ways"); the count itself comes from site.js. Larger ones stay figures.
const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function inWords(n) {
  return COUNT_WORDS[n] ?? formatInt(n);
}

// The story, in five steps: the sentence set large ("say") and the smaller
// description under it ("tell", one paragraph or two). A line never breaks
// where it should not: "Dr. Bo" has a no-break space (U+00A0, the title
// stays with the name), and "black‑soil" and "great‑grandparents" have
// non-breaking hyphens (U+2011, as the Methodology's "Sentinel‑2"). They
// look like a plain space and hyphen: keep them (site-pages.test.js checks).
// The fourth step's "{ways}" is filled where the step is rendered (the
// count of ways compared, from site.js); the texts are the dictionary keys.
const ROOTS = [
  {
    say: "For three generations, one story was told at William’s family table.",
    tell: [
      "After the Sino-Japanese War, his great‑grandparents were starving: bombs, landmines and the remnants of war had torn apart the black soil they farmed in northeastern China. They survived, and in time that same soil fed them back to life.",
    ],
  },
  {
    say: "The summer after his freshman year, William went to see that land.",
    tell: [
      "He visited his relatives in northeastern China and walked the black‑soil plains his family once farmed. He saw what floods and droughts had done to their harvests, and met kids his age already working those fields. He wanted to build a tool for them.",
    ],
  },
  {
    say: "Then he saw the same story on the same black soil, in Ukraine.",
    tell: [
      "Drawn to international relations, geopolitics and peace, he watched the same kind of war tear up Ukraine’s farmland. He chose to build for its farmers first, so they would not go through what his great‑grandparents did.",
    ],
  },
  {
    say: "He built it for Ukraine, then for everyone.",
    tell: [
      "He learned the basics of Google Earth Engine, its libraries and how to code. He spent a year researching chernozem rehabilitation with Dr. Bo Zhao of the University of Washington: he compared {ways} ways to rank damaged land, designed gated aggregation and built the first Chernozem Atlas, bringing experience from an internship at ZBDL Land and Resources in Beijing, where he worked on recovering land after disasters.",
      "Over three editions, the same method grew to work for any soil, anywhere on Earth, after any war or natural disaster, and for anyone, even as everyday monitoring. Now the farmers of Ukraine, his family in northeastern China and any farmer anywhere can use it.",
    ],
  },
  {
    say: "William took that story with him to a business program at the University of Pennsylvania.",
    tell: [
      "There he met some of his current partners. They have worked on Chernozem together ever since, with support from people at Penn and in the industry, and have gradually scaled it.",
    ],
  },
];

// A description's last two words share a line: Safari before 26 has no
// text-wrap: pretty, and a phone then left "it." or "them." alone on the
// last line (the About page joins its reasons' last words the same way).
const lastTwoTogether = (text) => text.replace(/ (?=\S*$)/, "\u00a0");

// -0.8 printed with a true minus sign, as in the paper.
function signed(n) {
  return String(n).replace("-", "−");
}

// The roots' entrance (see the top of this file). One observer for the
// band: a step starts once a little of it is on screen, an arrow once most
// of it is (so it is seen drawing), and every part above the one that
// starts is finished with it. A part already above the screen when the
// page opens is finished at once. The parts on the first screen wait for
// the title and the first step, then come one at a time in reading order
// (OPENING_MS, then STAGGER_MS apart), so the second step never appears
// before the first. Without an observer everything is simply there.
const OPENING_MS = 600;
const STAGGER_MS = 400;

function useRootsReveal() {
  const watch = useRef(null);
  return useCallback((node) => {
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("is-in");
      return undefined;
    }
    if (!watch.current) {
      const opened = performance.now();
      const timers = new Set();
      let queued = 0;
      // This part and every part above it.
      const finish = (target) => {
        const band = target.closest(".story-roots");
        const parts = band ? [...band.querySelectorAll("[data-roots]")] : [target];
        for (const part of parts.slice(0, parts.indexOf(target) + 1)) {
          part.classList.add("is-in");
          io.unobserve(part);
        }
      };
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const target = entry.target;
            if (entry.boundingClientRect.bottom < 0) {
              finish(target);
              continue;
            }
            const need = target.classList.contains("story-roots-next") ? 0.6 : 0.15;
            if (entry.intersectionRatio < need) continue;
            if (performance.now() - opened > OPENING_MS) {
              finish(target);
              continue;
            }
            io.unobserve(target);
            const timer = window.setTimeout(() => {
              timers.delete(timer);
              finish(target);
            }, OPENING_MS + STAGGER_MS * queued++);
            timers.add(timer);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: [0, 0.15, 0.6] }
      );
      watch.current = {
        io,
        stop() {
          timers.forEach((timer) => window.clearTimeout(timer));
          timers.clear();
          queued = 0;
        },
      };
    }
    const { io, stop } = watch.current;
    io.observe(node);
    return () => {
      io.unobserve(node);
      stop();
    };
  }, []);
}

// The arrow between two steps, pointing down to the next one: a line and
// its head, light on the dark band. Decoration only (aria-hidden): the
// list itself gives the order.
function DownArrow({ reveal }) {
  return (
    <span className="story-roots-next" aria-hidden="true" data-roots="" ref={reveal}>
      <svg className="story-roots-arrow" viewBox="0 0 20 88" focusable="false">
        <path className="story-roots-shaft" d="M10 1V86" />
        <path className="story-roots-tip" d="M2 78l8 8 8-8" />
      </svg>
    </span>
  );
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
  const t = useT("story");
  usePageTitle(t("Story"));
  // The entrances of each edition (site.css, "Entrances"): one observer
  // callback, attached to every edition's grid.
  const reveal = useReveal();
  const rootsReveal = useRootsReveal();
  const { active, fills } = useEditionProgress();
  // The one hole in the steps (the fourth step's "{ways}"): the count of
  // ways compared, as the story tells it, a word in English ("ten"); a
  // figure in the other languages, whose dictionaries may write the word
  // themselves (an entry that is a function is handed the count too).
  const steps = { ways: t.lang === "en" ? inWords(NUMBERS.paperOperators) : formatInt(NUMBERS.paperOperators), count: NUMBERS.paperOperators };

  return (
    <div className="pg story-page">
      {/* 1. The roots: the page's title and the story in five steps, on the black-soil field. */}
      <section className="pg-sec pg-sec-dark story-roots" aria-labelledby="story-title">
        <div className="pg-grid story-roots-grid">
          <div className="story-roots-head">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="story-title">
                {t("Forged in Three Generations")}
              </h1>
            </div>
          </div>
          {/* role="list": Safari stops calling a list a list once its markers are styled away */}
          <ol className="story-roots-steps" role="list">
            {ROOTS.map(({ say, tell }, n) => {
              const first = n === 0;
              return (
                <li className="story-roots-step" key={say}>
                  {/* The first step is on the first screen: it fades in with the title; the others rise as they come. */}
                  <div className="story-roots-words" data-roots={first ? undefined : ""} ref={first ? undefined : rootsReveal}>
                    <p className={first ? "story-statement pg-fade" : "story-statement"} data-rise={first ? undefined : ""}>
                      {t(say)}
                    </p>
                    {tell.map((text, i) => (
                      <p className={first ? "story-roots-tell pg-fade-2" : "story-roots-tell"} data-rise={first ? undefined : ""} style={first ? undefined : { "--i": i + 1 }} key={text}>
                        {lastTwoTogether(t(text, steps))}
                      </p>
                    ))}
                  </div>
                  {n < ROOTS.length - 1 ? <DownArrow reveal={rootsReveal} /> : null}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* 2. The editions, with the bar that follows the reading. */}
      <div className="story-editions">
        <nav className="story-mark" aria-label={t("The three editions")}>
          <ol className="story-mark-list">
            {EDITIONS.map(({ id, word, label }) => (
              <li key={id}>
                <a className="story-mark-link" href={`#${id}`} aria-label={t(label)} aria-current={active === id ? "true" : undefined}>
                  <span
                    className="story-mark-fill"
                    aria-hidden="true"
                    ref={(node) => {
                      fills.current[id] = node;
                    }}
                  />
                  {/* The space before "edition" is inside its sentence: Chinese writes none. */}
                  <span className="story-mark-label">
                    {t(word)}
                    <span className="story-mark-rest">{t(" edition")}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <section className="pg-sec story-ed story-ed-1" id="first-edition" aria-labelledby="first-edition-title">
          <div className="pg-grid" ref={reveal}>
            <h2 className="pg-h2 story-ed-head" id="first-edition-title" data-rise="">
              {t("First edition")}
            </h2>
            <div className="story-ed-text" data-rise="" style={{ "--i": 1 }}>
              <p>{t("A Google Colab notebook on Google Earth Engine that mapped Ukraine’s black soil, oblast by oblast, and the disturbance on it.")}</p>
              <p>
                {t("Checked against {events} recorded explosion and remote-violence events from ACLED (rank correlation {rho}) and against the change in harvests (r = {r}), it became a research paper ranking {oblasts} oblasts.", {
                  events: formatInt(NUMBERS.acledEvents),
                  rho: NUMBERS.acledCorrelation,
                  r: signed(NUMBERS.harvestCorrelation),
                  oblasts: NUMBERS.paperOblasts,
                })}
              </p>
            </div>
            <figure className="pg-fig story-ed1-main" data-settle="" style={{ "--i": 2 }}>
              <img className="pg-pic" src="/site/story/edition-1-colab.webp" width="1340" height="892" alt={t("The first edition's map: Ukraine's black soil shaded green, oblast by oblast, on a plain base map")} loading="lazy" decoding="async" />
              <figcaption>{t("Ukraine’s black soil in green, oblast by oblast.")}</figcaption>
            </figure>
            <div className="story-ed1-side">
              <figure className="pg-fig" data-settle="" style={{ "--i": 3 }}>
                <img className="pg-pic story-crop" src="/site/story/disturbance-map.webp" width="1600" height="964" alt={t("The disturbance layer: unusual change on Ukraine's land in orange and red, heaviest in the east and the south")} loading="lazy" decoding="async" />
                <figcaption>{t("The disturbance layer: unusual change on the land in orange and red.")}</figcaption>
              </figure>
              <figure className="pg-fig" data-settle="" style={{ "--i": 4 }}>
                <img className="pg-pic story-crop" src="/site/story/acled-events.webp" width="1324" height="942" alt={t("ACLED's recorded attacks across Ukraine as orange and red dots, crowded along the front line in the east and the south")} loading="lazy" decoding="async" />
                <figcaption>{t("The check: ACLED’s recorded attacks, as orange and red dots.")}</figcaption>
              </figure>
            </div>
            {/* The credit the maps' own corners do not carry (cropped away). */}
            <p className="story-credit" data-rise="" style={{ "--i": 5 }}>
              {t("Base maps © {osm} contributors. Attacks: {acled}.", {
                osm: (
                  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                    OpenStreetMap
                  </a>
                ),
                acled: (
                  <a href="https://acleddata.com/" target="_blank" rel="noreferrer">
                    ACLED
                  </a>
                ),
              })}
            </p>
          </div>
        </section>

        <section className="pg-sec pg-sec-surface story-ed story-ed-2" id="second-edition" aria-labelledby="second-edition-title">
          <div className="pg-grid" ref={reveal}>
            <div className="story-ed2-text">
              <h2 className="pg-h2 story-ed-head" id="second-edition-title" data-rise="">
                {t("Second edition")}
              </h2>
              <div className="story-ed2-words" data-rise="" style={{ "--i": 1 }}>
                {/* "Field yet" shares a line: a no-break space (U+00A0) inside the sentence. */}
                <p>{t("The Chernozem Recovery Atlas, a web page run on a laptop. It was the first Chernozem Atlas, for Ukraine only. There was no Field yet.")}</p>
                <p>{t("Near-term and postwar readings, sliders for soil value, disturbance and recovery context, about a dozen map layers and a ranked list of oblasts, in English or Chinese.")}</p>
                <p className="story-ed-link">
                  <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
                    {t("Its data and code are on Harvard Dataverse")}
                  </a>
                </p>
              </div>
            </div>
            <figure className="pg-fig story-ed2-pic" data-settle="" style={{ "--i": 2 }}>
              <img className="pg-pic" src="/site/story/edition-2-atlas.webp" width="1497" height="1280" alt={t("The second edition, the Chernozem Recovery Atlas in a browser on localhost: the weights and map layers on the left, Ukraine's oblasts coloured by priority, the top oblasts on the right")} loading="lazy" decoding="async" />
              <figcaption>
                {t("The Recovery Atlas on localhost: the weights and map layers on the left, the top oblasts on the right.")}{" "}
                {t("Base map: {openFreeMap}, © {openMapTiles}, © {osm} contributors.", {
                  openFreeMap: (
                    <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
                      OpenFreeMap
                    </a>
                  ),
                  openMapTiles: (
                    <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
                      OpenMapTiles
                    </a>
                  ),
                  osm: (
                    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                      OpenStreetMap
                    </a>
                  ),
                })}
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="pg-sec story-ed story-ed-3" id="third-edition" aria-labelledby="third-edition-title">
          <div className="pg-grid" ref={reveal}>
            <h2 className="pg-h2 story-ed-head" id="third-edition-title" data-rise="">
              {t("Third edition")}
            </h2>
            <div className="story-ed-text" data-rise="" style={{ "--i": 1 }}>
              <p>{t("This app, at chernozem.app.")}</p>
              <p>{t("Field reads a farmer’s own fields on every clear Sentinel-2 pass: plant health, water and stress against 2019 to 2021, and harvest timing.")}</p>
              <p>{t("Atlas scores any country or region square by square for governments, NGOs and corporations, after a war, flood, wildfire or drought.")}</p>
            </div>
            <figure className="pg-fig story-ed3-pic story-ed3-field" data-settle="" style={{ "--i": 2 }}>
              <img className="pg-pic story-crop story-crop-field" src="/site/shots/field-fields-detail.webp" width="1920" height="1369" alt={t("Field: the demo farm near Kupiansk on satellite imagery, Field 11 selected with its water, plant health, stress and harvest readings")} loading="lazy" decoding="async" />
              <figcaption>{t("Field: Field 11 on the demo farm near Kupiansk, with its four readings.")}</figcaption>
            </figure>
            <figure className="pg-fig story-ed3-pic story-ed3-atlas" data-settle="" style={{ "--i": 3 }}>
              <img className="pg-pic story-crop story-crop-atlas" src="/site/shots/atlas-overview.webp" width="1920" height="1200" alt={t("Atlas: the overview of Ukraine for September 2026, with the cropland analysed, the damage, and the map of where to start")} loading="lazy" decoding="async" />
              <figcaption>{t("Atlas: Ukraine in September 2026, with the places to start.")}</figcaption>
            </figure>
          </div>
        </section>
      </div>
    </div>
  );
}
