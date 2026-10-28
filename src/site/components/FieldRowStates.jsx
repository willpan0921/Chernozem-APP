// WHAT THIS FILE DOES
// The showcase on the About page, "One field, one pass": the app's field
// row shown three times, one under the other, in its three states:
//   Arrives    a new satellite pass is in, the row says "Reading"
//   Read       the pointer is on the row, its actions are showing, and the
//              button "Read this pass" really works: pressing it turns this
//              copy into the finished state
//   Answered   the pass is read: plant health, stress, water, the harvest
// Each copy is built in HTML at true size (640px wide) with the app's own
// look (white panel, its 1px borders, Inter at 13–15px), so its root
// carries data-ui. The numbers are the demo farm's real Field 11
// (src/site/content/site.js, DEMO). Styles: src/site/pages/home.css
// (.showcase, .frow).
//
// WHO EDITS IT
// Whoever changes the showcase. Keep the numbers true to the demo farm.

import { useState } from "react";
import { DEMO } from "../content/site.js";

const FIELD = `${DEMO.field11.name} · ${DEMO.field11.crop}`;

function RowArrives() {
  return (
    <div className="frow" data-ui>
      <span className="frow-mark is-reading" aria-hidden="true" />
      <div className="frow-main">
        <strong className="frow-name">{FIELD}</strong>
        <span className="frow-meta">New pass · Sentinel-2 · {DEMO.field11.latestPass} · clear sky</span>
      </div>
      <span className="frow-chip">Reading</span>
    </div>
  );
}

function RowAnswered() {
  return (
    <div className="frow is-done" data-ui>
      <span className="frow-mark is-good" aria-hidden="true" />
      <div className="frow-main">
        <strong className="frow-name">{FIELD}</strong>
        <span className="frow-meta">
          Plant health {DEMO.field11.plantHealth} · Stress {DEMO.field11.stress} · Water {DEMO.field11.water}
        </span>
        <span className="frow-answer">Past peak; greenest on {DEMO.field11.peakDate}</span>
      </div>
      <span className="frow-chip is-good">Growing well</span>
    </div>
  );
}

// The live copy: hovered, with its actions showing, until its button is pressed.
function RowRead() {
  const [read, setRead] = useState(false);
  if (read) return <RowAnswered />;
  return (
    <div className="frow is-hover" data-ui>
      <span className="frow-mark is-reading" aria-hidden="true" />
      <div className="frow-main">
        <strong className="frow-name">{FIELD}</strong>
        <span className="frow-meta">New pass · Sentinel-2 · {DEMO.field11.latestPass} · clear sky</span>
        <span className="frow-actions" aria-label="Row actions">
          <button type="button" className="frow-action" onClick={() => setRead(true)}>
            Open
          </button>
          <button type="button" className="frow-action" onClick={() => setRead(true)}>
            Ask
          </button>
          <button type="button" className="frow-action" onClick={() => setRead(true)}>
            Export
          </button>
        </span>
      </div>
      <button type="button" className="frow-button" onClick={() => setRead(true)}>
        Read this pass
      </button>
    </div>
  );
}

const STATES = [
  { word: "Arrives", Row: RowArrives },
  { word: "Read", Row: RowRead },
  { word: "Answered", Row: RowAnswered },
];

export default function FieldRowStates() {
  return (
    <div className="showcase-rows">
      {STATES.map(({ word, Row }, i) => (
        <div className="showcase-pair" key={word}>
          <span className="showcase-word muted" data-slide style={{ "--i": i * 2 }}>
            {word}
          </span>
          <div className="showcase-copy" data-rise style={{ "--i": i * 2 + 1 }}>
            <Row />
          </div>
        </div>
      ))}
    </div>
  );
}
