// WHAT THIS FILE DOES
// The website's "page not found" page, for any address that is neither a
// website page nor an app page.
//
// WHO EDITS IT
// Nobody, normally.

import { Link } from "react-router-dom";
import { Arrow, Reveal } from "../components/motion.jsx";
import { SITE } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

export default function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <section className="nf">
      <div>
        <Reveal>
          <div className="nf-code" aria-hidden="true">
            404
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="h-2" style={{ marginTop: 24 }}>
            No square here.
          </h1>
        </Reveal>
        <Reveal delay={0.2}>
          <p className="lead" style={{ margin: "14px auto 28px" }}>
            That address does not exist. The satellites have looked.
          </p>
        </Reveal>
        <Reveal delay={0.3} className="btn-row" style={{ justifyContent: "center" }}>
          <Link to="/" className="btn btn-light">
            Back to the home page <Arrow />
          </Link>
          <Link to={SITE.appPath} className="btn btn-ghost btn-ghost-light">
            Open the app
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
