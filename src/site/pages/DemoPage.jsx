// WHAT THIS FILE DOES
// The website's demo page (chernozem.app/demo): the way into the Ukraine
// demo, which lives behind one access code. The page asks the server
// whether this browser already holds the code's session (GET
// /api/auth/status); if so it shows the two buttons, Open Field and Open
// Atlas. Otherwise it shows a form for the code, sends it (POST
// /api/auth/login, src/api/atlasApi.js signIn) and then shows the buttons.
// A wrong code is said plainly under the field. Below: what is in the
// demo, in pictures, and the way to an account of your own.
//
// WHO EDITS IT
// Whoever changes how the demo is reached. The code itself is set on the
// server (ATLAS_ACCESS_CODE); the owner hands it out from the contact
// page's messages.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthStatus, signIn } from "../../api/atlasApi.js";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { DEMO, NUMBERS, SITE, SITE_ACTIONS, SITE_PAGES } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

const CONTACT_PATH = SITE_PAGES.find((page) => page.label === "Contact")?.path || "/contact";

// Does this browser hold the demo's code session? An account session is
// not the demo (an account has its own, empty workspace).
function holdsDemo(status) {
  return Boolean(status && status.signedIn && !status.account);
}

export default function DemoPage() {
  usePageTitle("Demo");
  // The form's entrance: the hook runs on every render, whichever branch shows.
  const formReveal = useReveal();
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let on = true;
    getAuthStatus()
      .then((answer) => {
        if (!on) return;
        setStatus(answer);
        if (holdsDemo(answer)) setOpen(true);
      })
      .catch(() => {
        if (on) setStatus({ signedIn: false });
      });
    return () => {
      on = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const typed = code.trim();
    if (!typed) {
      setError("Type the code you were given.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signIn(typed);
      setOpen(true);
    } catch (err) {
      if (err?.code === "wrong_code") setError("That code is not right.");
      else setError(err?.message || "The code could not be checked. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg">
      <section className="pg-sec" aria-labelledby="dm-title">
        <div className="pg-grid">
          <div className="dm-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="dm-title">
                Try the demo
              </h1>
            </div>
            <p className="pg-lead pg-fade">
              The demo is Ukraine, where Chernozem started: twelve fields near Kupiansk in Field, and the whole country in Atlas.
            </p>
            <p className="pg-fade" style={{ marginTop: 14 }}>
              Real data, read from space, {NUMBERS.ukraineMonth}.
            </p>

            <div className="dm-gate pg-fade-2">
              {open ? (
                <div role="status">
                  <h2 className="pg-h3">The demo is open</h2>
                  <div className="dm-buttons">
                    <Link className="pg-btn" to={SITE.appPath}>
                      Open Field
                    </Link>
                    <Link className="pg-btn" to={SITE.atlasPath}>
                      Open Atlas
                    </Link>
                  </div>
                </div>
              ) : (
                <form className="pg-form" onSubmit={submit} aria-busy={status === null ? "true" : undefined} ref={formReveal}>
                  <label className="pg-field" htmlFor="dm-code" data-rise style={{ "--i": 0 }}>
                    <span>Access code</span>
                    <input id="dm-code" type="password" name="code" autoComplete="off" autoCapitalize="off" spellCheck="false" value={code} onChange={(event) => setCode(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "dm-code-error" : undefined} />
                  </label>
                  {error && (
                    <p className="pg-error" id="dm-code-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="pg-actions" data-rise style={{ "--i": 1, marginTop: 0 }}>
                    <button type="submit" className="pg-btn" disabled={busy}>
                      {busy ? "Checking…" : "Open the demo"}
                    </button>
                    <Link className="pg-link" to={CONTACT_PATH}>
                      No code yet? Ask for one.
                    </Link>
                  </div>
                </form>
              )}
            </div>
          </div>

          <div className="dm-open-pics pg-fade-2">
            <figure className="pg-fig">
              <img className="pg-pic" src="/site/shots/field-fields.webp" width="1920" height="1200" alt="Field: the demo farm's fields outlined on satellite imagery, Field 11 selected with its four readings" loading="eager" decoding="async" />
              <figcaption>
                Field: {DEMO.fields} fields near {DEMO.place}.
              </figcaption>
            </figure>
            <figure className="pg-fig">
              <img className="pg-pic" src="/site/shots/atlas-map-near-macro.webp" width="1920" height="1200" alt="Atlas: Ukraine by oblast, each filled by its near-term priority and ranked on the right" loading="lazy" decoding="async" />
              <figcaption>Atlas: Ukraine by oblast, ranked for the near term.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="pg-sec pg-sec-surface" aria-labelledby="dm-what">
        <div className="pg-grid">
          <Reveal className="dm-what-head">
            <h2 className="pg-h2" id="dm-what">
              What is in the demo
            </h2>
          </Reveal>
          <Reveal className="dm-what-text" delay={0.06}>
            <p data-rise style={{ "--i": 1 }}>In Field you open each of the twelve fields near Kupiansk, read the season against the normal years, ask the assistant about a field and export a report.</p>
            <p data-rise style={{ "--i": 2 }}>In Atlas you move the weights, switch between the near-term and the post-crisis reading, look at any square of Ukraine and open the report donors read.</p>
          </Reveal>
          <Reveal className="dm-big" delay={0.08} y={36}>
            <figure className="pg-fig">
              <img className="pg-pic" src="/site/shots/atlas-overview.webp" width="1920" height="1200" alt="The Atlas overview of Ukraine, September 2026: cropland analysed, black soil, heavy damage, people on damaged land, and the priority map" loading="lazy" decoding="async" />
              <figcaption>
                The Atlas overview: {NUMBERS.ukraineMonth}, {new Intl.NumberFormat("en-US").format(NUMBERS.ukraineSquares)} squares rolled up to oblasts, with the next steps.
              </figcaption>
            </figure>
          </Reveal>
          <Stagger className="dm-side">
            <StaggerItem as="figure" className="pg-fig">
              <img className="pg-pic" src="/site/shots/field-overview.webp" width="1920" height="1200" alt="The Field overview: the demo farm's latest pass, the field counts, the weather and the field list" loading="lazy" decoding="async" />
              <figcaption>The farm overview: every pass since March, the weather, what needs doing.</figcaption>
            </StaggerItem>
            <StaggerItem as="figure" className="pg-fig">
              <img className="pg-pic" src="/site/shots/atlas-report.webp" width="1920" height="1200" alt="The Atlas donor report for Ukraine with the top ten near-term areas" loading="lazy" decoding="async" />
              <figcaption>The report donors read: the top ten areas, PDF and CSV.</figcaption>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="pg-sec pg-sec-sage" aria-labelledby="dm-close">
        <div className="pg-grid">
          <Reveal className="dm-close-head">
            <h2 className="pg-h2" id="dm-close">
              Without a code
            </h2>
          </Reveal>
          <Reveal className="dm-close-act" delay={0.1}>
            <p>Register for Field or Atlas and start with an empty workspace of your own. An account is free.</p>
            <div className="pg-actions">
              <Link className="pg-btn" to={SITE_ACTIONS.register.path}>
                Register
              </Link>
              <Link className="pg-link" to={CONTACT_PATH}>
                Ask for a code
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
