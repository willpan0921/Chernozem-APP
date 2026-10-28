// WHAT THIS FILE DOES
// The website's "Story" page (chernozem.app/story): why Chernozem exists
// and who made it. The family story, told in chapters as the reader
// scrolls; the founder; the timeline from a summer in northeastern China
// to the app; what the project stands for; and thanks.
//
// WHO EDITS IT
// The founder, for the words. Keep them true: every fact here is his.

import { Link } from "react-router-dom";
import PageHero from "../components/PageHero.jsx";
import { Arrow, Reveal, Spotlight, Stagger, StaggerItem } from "../components/motion.jsx";
import { HandHeart, Scale, Eye, Users, Compass, ShieldCheck, GraduationCap, BookOpen } from "../components/Icons.jsx";
import Logo from "../../components/ui/Logo.jsx";
import { LINKS, NUMBERS, SITE, formatInt } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

const CHAPTERS = [
  {
    label: "Northeastern China",
    title: "The meal",
    body: (
      <>
        <p>
          After the Sino-Japanese War, my great-grandparents were farmers on the black soil of northeastern China, and they were starving. Bombs, landmines and the remnants of the war had torn apart the fertile ground they lived from. In desperation they spent the last of their money on one final meal for the whole family.
        </p>
        <p>
          <strong>They survived.</strong> In the years that followed, the same black soil, chernozem, slowly fed them back to life. When the war ended, the world&apos;s attention moved on. The people who depended on the land were left to recover alone.
        </p>
      </>
    ),
  },
  {
    label: "The summer after freshman year",
    title: "Standing on the fields",
    body: (
      <>
        <p>
          The summer after my freshman year, I went back to visit my relatives in northeastern China. I walked the wide black-soil plains my family once farmed, saw what floods and droughts had done to their harvests, and met kids my age already working those fields.
        </p>
        <p>Hearing my family&apos;s story while standing on that soil made the link between land and survival personal. I came home wanting to do something for the people who still live from it.</p>
      </>
    ),
  },
  {
    label: "Debate, and the war in Ukraine",
    title: "The same soil, again",
    body: (
      <>
        <p>
          As a debater drawn to international relations, I followed the war in Ukraine, and realised it was being fought on the same black soil. Black soils cover about {NUMBERS.blackSoilCroplandPercent}% of the world&apos;s cropland and have grown around {NUMBERS.blackSoilWheatPercent}% of its wheat. Before the war, Ukraine&apos;s food exports fed about {NUMBERS.peopleFedMillions} million people a year.
        </p>
        <p>
          Shelling, fire and mines are damaging that soil now. The people hurt most are not the ones who started the war; they are ordinary farmers, and the families far away who eat what they grow. Yet those farmers rarely make the news. <strong>That happened to my family, and it is happening again.</strong>
        </p>
      </>
    ),
  },
  {
    label: "A year of research",
    title: "Where should recovery begin?",
    body: (
      <>
        <p>
          That question became a year of research on rehabilitating Ukraine&apos;s black soil, supervised by Professor Bo Zhao of the University of Washington&apos;s Humanistic GIS Laboratory. I compared {NUMBERS.paperOperators} ways of combining soil value, war damage and safe access, and designed <strong>gated aggregation</strong>: a ranking that works differently during a war and after it, because land behind the front cannot be entered at any price.
        </p>
        <p>
          The paper is <em>{LINKS.paperTitle}</em>; its data and code are archived on{" "}
          <a href={LINKS.paper} target="_blank" rel="noreferrer">
            Harvard Dataverse
          </a>
          .
        </p>
      </>
    ),
  },
  {
    label: "From a paper to an app",
    title: "Any place, any soil, any crisis",
    body: (
      <>
        <p>
          A paper helps researchers. I wanted something a farmer could open on a phone and a ministry could plan with. So I took the algorithms and systems from the research and scaled my single-country recovery atlas into an app that works for any place on Earth, any soil, and any disaster: war, flood, wildfire and drought, in a world with about {NUMBERS.armedConflicts} armed conflicts and ever more frequent climate disasters.
        </p>
        <p>
          A farmer needs to understand one field. A recovery organisation needs to compare thousands of places and decide where to begin. Those two needs became <strong>Chernozem Field</strong> and <strong>Chernozem Atlas</strong>.
        </p>
      </>
    ),
  },
];

const VALUES = [
  { icon: HandHeart, title: "People before pixels", text: "Every number is about a family's land. The app speaks in plain words, not indices, and counts the people living on damaged soil, not only the hectares." },
  { icon: Scale, title: "The user decides", text: "Chernozem gives the evidence and lets the people doing the work make the call. The weights are sliders: a demining agency, a food ministry and a reconstruction fund can each set their own." },
  { icon: Eye, title: "Honest about limits", text: "It says where its numbers are weaker, when something was not measured, and which crises are still provisional. A precise map can look certain when the evidence is not." },
  { icon: ShieldCheck, title: "Never declares land safe", text: "Whether a field is safe to walk on is a decision for certified deminers and local authorities. The app ranks and informs; it never certifies." },
  { icon: Users, title: "Both directions", text: "Recovery works best from both ends at once: one farmer's field from the bottom up, a whole country's plan from the top down." },
  { icon: Compass, title: "Open data, made usable", text: "The satellite data was always free. The work was turning it into something anyone can understand in seconds, with nothing to install." },
];

const TIMELINE = [
  { when: "Summer after freshman year", what: "A visit to family in northeastern China, and the story of the meal." },
  { when: "The following year", what: "Studying the war in Ukraine through debate; the same black soil." },
  { when: "Research year", what: "Gated aggregation: ten operators compared on identical inputs, a national prioritisation of Ukraine's chernozem. Supervised by Prof. Bo Zhao, UW Humanistic GIS Lab." },
  { when: "2026", what: "The paper's data and code archived on Harvard Dataverse (doi:10.7910/DVN/IYXPVS)." },
  { when: "Autumn 2026", what: "Chernozem Field and Atlas: the research turned into an app that runs on live satellite data, anywhere." },
  { when: "October 2026", what: "Checked against real floods, wildfires and crop records; entered in the Congressional App Challenge; online at chernozem.app." },
];

export default function StoryPage() {
  usePageTitle("Story");
  return (
    <>
      <PageHero eyebrow="Our story" title="There is a meal in my family that no one was supposed to *survive.*" lead="Chernozem began with a family story from northeastern China, and with the same black soil being torn apart in Ukraine today." />

      <section className="section">
        <div className="wrap wrap-narrow">
          {CHAPTERS.map((chapter, index) => (
            <Reveal key={chapter.title} className="story-chapter">
              <div>
                <div className="story-chapter-num">{String(index + 1).padStart(2, "0")}</div>
                <div className="story-chapter-label">{chapter.label}</div>
              </div>
              <div className="prose">
                <h2 className="h-2" style={{ marginBottom: "0.6em" }}>
                  {chapter.title}
                </h2>
                {chapter.body}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="founder">
        <div className="wrap">
          <div className="founder-card">
            <Reveal className="founder-portrait" y={40}>
              <span className="founder-initials" aria-hidden="true">
                WP
              </span>
              <span className="founder-portrait-pin">
                <Logo size={46} />
              </span>
            </Reveal>
            <div>
              <Reveal className="eyebrow">The founder</Reveal>
              <Reveal>
                <h2 className="h-1">William Pan</h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="lead">
                  A high school student in {SITE.madeIn}, at Polytechnic School and at Stanford Online High School, drawn to international relations, geography and debate. He leads Chernozem&apos;s research, method, product and design, and tests every result against independent records.
                </p>
              </Reveal>
              <Stagger className="founder-facts">
                <StaggerItem className="founder-fact">
                  <span>Research</span>
                  Gated aggregation for chernozem rehabilitation
                </StaggerItem>
                <StaggerItem className="founder-fact">
                  <span>Supervised by</span>
                  Prof. Bo Zhao, UW Humanistic GIS Lab
                </StaggerItem>
                <StaggerItem className="founder-fact">
                  <span>Published data</span>
                  Harvard Dataverse, 2026
                </StaggerItem>
                <StaggerItem className="founder-fact">
                  <span>Interests</span>
                  Geopolitics, the environment, humanistic GIS
                </StaggerItem>
              </Stagger>
              <Reveal delay={0.2} className="btn-row" style={{ marginTop: 32 }}>
                <a href={LINKS.paper} target="_blank" rel="noreferrer" className="btn btn-light">
                  <BookOpen size={18} /> The research data and code
                </a>
                <Link to="/contact" className="btn btn-ghost">
                  Get in touch <Arrow />
                </Link>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="split" style={{ alignItems: "start" }}>
            <div>
              <Reveal className="eyebrow">Timeline</Reveal>
              <Reveal>
                <h2 className="h-1">From a summer to a satellite app.</h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="lead" style={{ marginTop: 18 }}>
                  Debate taught me about the war. My family gave me the reason. Research and code gave me a way to act.
                </p>
              </Reveal>
            </div>
            <Stagger className="timeline">
              {TIMELINE.map((item) => (
                <StaggerItem key={item.when} className="timeline-item">
                  <div className="timeline-when">{item.when}</div>
                  <div>{item.what}</div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <section className="section section-cream-2">
        <div className="wrap">
          <div className="section-head">
            <Reveal className="eyebrow">What we stand for</Reveal>
            <Reveal>
              <h2 className="h-1">Humanistic by design.</h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="lead">Humanistic GIS asks how geographic technology shapes the way people experience the world. A farmer knows the soil through the hand; a ministry will know it through a ranking. Chernozem is built to respect both.</p>
            </Reveal>
          </div>
          <Stagger className="grid grid-3 values-grid">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <StaggerItem key={title}>
                <Spotlight>
                  <span className="card-icon">
                    <Icon size={22} />
                  </span>
                  <h3 className="card-title">{title}</h3>
                  <p className="card-text">{text}</p>
                </Spotlight>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="section">
        <div className="wrap wrap-narrow">
          <Reveal className="eyebrow">Thanks</Reveal>
          <Reveal>
            <div className="prose">
              <p>
                To my family, whose experiences and storytelling are the reason this exists, and especially to my relatives who still farm in northeastern China, for their first-hand observations and what they know about local black soil. To Professor Bo Zhao and the Humanistic GIS Laboratory at the University of Washington, for supervising the research. And to the open-data community behind ESA Copernicus, NASA, the FAO, ISRIC, WorldPop, ACLED and Google Earth Engine, without whom none of this would be possible.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="btn-row" style={{ marginTop: 32 }}>
            <Link to="/product" className="btn btn-primary">
              See what it does <Arrow />
            </Link>
            <Link to="/method" className="btn btn-ghost">
              Read the method
            </Link>
          </Reveal>
          <p className="muted" style={{ marginTop: 40, fontSize: "0.85rem" }}>
            <GraduationCap size={14} style={{ verticalAlign: -2 }} /> Ukraine is analysed every month across {formatInt(NUMBERS.ukraineSquares)} squares; the same pipeline runs for Iowa, Kenya, Heilongjiang, Buenos Aires, Saskatchewan and Kharkiv oblast.
          </p>
        </div>
      </section>
    </>
  );
}
