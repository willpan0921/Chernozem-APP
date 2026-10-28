// WHAT THIS FILE DOES
// The website's "page not found" page, for any address that is neither a
// website page nor an app page: one line and a link back.
//
// WHO EDITS IT
// Nobody, normally.

import { Link } from "react-router-dom";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

export default function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <div className="pg">
      <section className="pg-sec nf" aria-labelledby="nf-title">
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
      </section>
    </div>
  );
}
