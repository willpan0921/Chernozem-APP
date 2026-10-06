// WHAT THIS FILE DOES
// The Home screen. At the top, a large photo of a field with the app name, a
// one-line description, a search box and a Search button on top of it. Below
// that, a short "How it works" section with three steps.
// There is no real searching yet. Whatever is typed is passed on and shown as
// the field name on the Field page.
//
// WHO EDITS IT
// Whoever builds the real search later, or anyone changing the Home wording.
//
// WHAT IT RECEIVES
// onSearch - a function from App.jsx. Call it with the typed text to open the
//            Field page.

import { useState } from "react";
import { currentPhoto } from "../config/photos.js";

// The background photo. The list of photos is in src/config/photos.js.
const HERO_PHOTO = currentPhoto;

// The clickable examples under the search bar. Clicking one opens the Field
// page with that text, the same as typing it and pressing Search.
const examples = ["Kherson", "Mykolaiv", "46.63, 32.61"];

// The three "How it works" steps. Edit the wording here.
const steps = [
  {
    title: "Value",
    text: "See what kind of soil the field has and what it is worth as farmland.",
  },
  {
    title: "Damage",
    text: "See how the war has damaged the field, based on satellite images.",
  },
  {
    title: "Access",
    text: "See whether the field can be reached and worked safely.",
  },
];

export default function HomePage({ onSearch }) {
  // The text currently in the search box.
  const [query, setQuery] = useState("");

  // Runs when Search is clicked or Enter is pressed.
  function handleSubmit(event) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <main className="home-page">
      <section className="hero" style={{ backgroundImage: `url(${HERO_PHOTO})` }}>
        {/* Top of the photo: the app name and description. */}
        <div className="hero-heading">
          <h1 className="home-title">
            Chernozem <span className="home-title-script">Field</span>
          </h1>
          <p className="home-description">
            Look up a field in Ukraine and see how the war has affected its soil.
          </p>
        </div>

        {/* Bottom middle of the photo: the search bar and examples. */}
        <div className="hero-search">
          <form className="search-form" onSubmit={handleSubmit}>
            {/* The magnifying glass icon, drawn directly so no icon library is needed. */}
            <svg
              className="search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
            <input
              className="search-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Place name or coordinates"
              aria-label="Search for a field"
            />
            <button className="search-button" type="submit">
              Search
            </button>
          </form>

          <div className="search-examples">
            <span>Try:</span>
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                className="search-example"
                onClick={() => onSearch(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="page">
          <h2>How it works</h2>
          <ol className="steps">
            {steps.map((step, index) => (
              <li key={step.title} className="step">
                <div className="step-head">
                  <h3 className="step-title">{step.title}</h3>
                  <span className="step-number">0{index + 1}</span>
                </div>
                <p className="step-text">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
