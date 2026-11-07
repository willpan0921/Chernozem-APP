// WHAT THIS FILE DOES
// The website's footer: a single quiet line after a stretch of empty
// ground. Left, what this is; centre, the four page links (the GitHub and
// "Data and code" links that stood here were removed at the owner's
// request on 6 November 2026; the Methodology page still links the code
// and the Story the research package); right, the place and the year. On
// a phone it is three short lines. No logo, no columns, no background.
//
// WHO EDITS IT
// Whoever changes the website's footer. Links come from
// src/site/content/site.js.

import { Link } from "react-router-dom";
import { SITE, SITE_PAGES } from "../content/site.js";
import { useT } from "../i18n/i18n.js";
import LanguageSwitch from "./LanguageSwitch.jsx";
import "./footer.css";

export default function Footer() {
  const t = useT("common");
  return (
    <footer className="sf">
      <div className="sf-line wrap">
        <p className="sf-what">
          {SITE.name}, {t("satellite farmland monitoring")}
        </p>
        <nav className="sf-links" aria-label={t("Footer")}>
          {SITE_PAGES.map((page) => (
            <Link key={page.path} to={page.path} className="link">
              {t(page.label)}
            </Link>
          ))}
          <LanguageSwitch variant="buttons" className="sf-lang" />
        </nav>
        <p className="sf-where">
          {t(SITE.madeIn)}, {SITE.year}
        </p>
      </div>
    </footer>
  );
}
