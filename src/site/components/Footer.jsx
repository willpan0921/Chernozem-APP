// WHAT THIS FILE DOES
// The website's footer: a single quiet line after a stretch of empty
// ground. Left, what this is; centre, the page links plus GitHub and the
// paper; right, the year and the place. On a phone it is three short
// lines. No logo, no columns, no background.
//
// WHO EDITS IT
// Whoever changes the website's footer. Links come from
// src/site/content/site.js.

import { Link } from "react-router-dom";
import { LINKS, SITE, SITE_PAGES } from "../content/site.js";
import "./footer.css";

export default function Footer() {
  return (
    <footer className="sf">
      <div className="sf-line wrap">
        <p className="sf-what">
          {SITE.name}, satellite farmland monitoring
        </p>
        <nav className="sf-links" aria-label="Footer">
          {SITE_PAGES.map((page) => (
            <Link key={page.path} to={page.path} className="link">
              {page.label}
            </Link>
          ))}
          <a href={LINKS.github} className="link" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={LINKS.paper} className="link" target="_blank" rel="noreferrer">
            Paper
          </a>
        </nav>
        <p className="sf-where">
          {SITE.year} · {SITE.madeIn}
        </p>
      </div>
    </footer>
  );
}
