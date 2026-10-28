// WHAT THIS FILE DOES
// The website's footer: the big name, the page links in columns, the
// research and code links, and the one promise the app makes everywhere:
// it never declares land safe.
//
// WHO EDITS IT
// Whoever changes the website's footer. Links come from
// src/site/content/site.js.

import { Link } from "react-router-dom";
import Logo from "../../components/ui/Logo.jsx";
import { LINKS, SITE, SITE_PAGES } from "../content/site.js";
import "./footer.css";

const learn = SITE_PAGES.filter((page) => ["/story", "/guide", "/method", "/technology", "/design"].includes(page.path));

export default function Footer() {
  return (
    <footer className="sf">
      <div className="wrap">
        <div className="sf-top">
          <div className="sf-brand">
            <Logo size={40} />
            <div>
              <div className="sf-name">{SITE.name}</div>
              <p className="sf-tag">{SITE.tagline}</p>
            </div>
          </div>
          <div className="sf-cols">
            <div className="sf-col">
              <h2 className="sf-head">Product</h2>
              <Link to="/product">Field and Atlas</Link>
              <Link to={SITE.appPath}>Open the app</Link>
              <Link to="/contact">Request access</Link>
            </div>
            <div className="sf-col">
              <h2 className="sf-head">Learn</h2>
              {learn.map((page) => (
                <Link key={page.path} to={page.path}>
                  {page.label}
                </Link>
              ))}
            </div>
            <div className="sf-col">
              <h2 className="sf-head">Research</h2>
              <a href={LINKS.paper} target="_blank" rel="noreferrer">
                The research data and code
              </a>
              <a href={LINKS.github} target="_blank" rel="noreferrer">
                Source code
              </a>
              <Link to="/contact">Contact</Link>
            </div>
          </div>
        </div>
        <div className="sf-word" aria-hidden="true">
          Chernozem
        </div>
        <div className="sf-bottom">
          <span>
            © {SITE.year} {SITE.name} · Made in {SITE.madeIn}
          </span>
          <span className="sf-promise">Chernozem never declares land safe. That decision belongs to certified deminers and local authorities.</span>
        </div>
      </div>
    </footer>
  );
}
