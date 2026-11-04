// WHAT THIS FILE DOES
// The website's "page not found" page, for any address that is neither a
// website page nor an app page: one line and a link back. Its words sit in
// the page's frame (pages.css ".pg-frame"), so on a wide screen they line
// up with the logo above them.
//
// WHO EDITS IT
// Nobody, normally.

// The site's base rules first, so ./pages.css below wins every tie with them.
import "../site.css";
import { Link } from "react-router-dom";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

export default function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <div className="pg">
      <section className="pg-sec nf" aria-labelledby="nf-title">
        <div className="pg-frame nf-text">
          <div className="pg-mask">
            <h1 className="pg-h1" id="nf-title">
              There is no page here
            </h1>
          </div>
          <p className="pg-lead pg-fade">
            That address does not exist.{" "}
            <Link className="pg-link" to="/">
              Back to the About page
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
