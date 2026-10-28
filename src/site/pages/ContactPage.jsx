// WHAT THIS FILE DOES
// The website's Contact page (chernozem.app/contact): a form that sends a
// message to the owner. The message lands on Chernozem's own server (Atlas
// > Settings, "Messages from the website"; the route is POST /api/contact,
// server/messages.js); no e-mail is sent and nothing is shared. Beside the
// form: what to write about, with pictures of the parts of the app people
// ask about, and where else the project lives (the code, the paper).
//
// WHO EDITS IT
// Whoever changes the contact page. The server side is server/messages.js;
// the request is src/api/siteApi.js sendContact.

import { useState } from "react";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { sendContact } from "../../api/siteApi.js";
import { LINKS } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

const ROLES = ["Farmer", "Government", "NGO", "Demining", "Researcher", "Investor", "Press", "Other"];
const MAX = 2000;
const EMPTY = { name: "", email: "", organization: "", message: "", website: "" };

// What people write about, each with the part of the app it concerns.
const TOPICS = [
  { src: "/site/shots/atlas-overview.webp", alt: "The Atlas overview of Ukraine, September 2026", caption: "A demo code: the Ukraine reading in Field and Atlas." },
  { src: "/site/shots/field-overview.webp", alt: "The Field overview of a twelve-field farm", caption: "A pilot on your own farm or region." },
  { src: "/site/shots/field-fields-detail.webp", alt: "Field 11 up close with its four readings", caption: "Ground truth: what the satellites got right or wrong on your land." },
  { src: "/site/shots/atlas-report.webp", alt: "The donor report for Ukraine with the top ten areas", caption: "A report, a question, or something that is wrong." },
];

export default function ContactPage() {
  usePageTitle("Contact");
  // The form's entrance: the hook runs on every render, whichever branch shows.
  const formReveal = useReveal();
  const [role, setRole] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function set(key) {
    return (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const message = role ? `[${role}] ${form.message}` : form.message;
      await sendContact({ ...form, message });
      setDone(true);
    } catch (err) {
      setError(err?.message || "The message could not be sent. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setDone(false);
    setForm(EMPTY);
    setRole("");
  }

  return (
    <div className="pg">
      <section className="pg-sec" aria-labelledby="ct-title">
        <div className="pg-grid">
          <div className="ct-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="ct-title">
                Write to Chernozem
              </h1>
            </div>
            <p className="pg-lead pg-fade">Ask for a demo code, propose a pilot, share what you know about your land, or tell us what is wrong.</p>
            <div className="ct-aside pg-fade-2">
              <p>Your message is saved on Chernozem’s own server, where the person who builds it reads it. No mailing list, no third parties. You will hear back by e‑mail.</p>
            </div>
          </div>

          <div className="ct-open-form pg-fade-2">
            {done ? (
              <div className="ct-done" role="status">
                <h2 className="pg-h2">Thank you.</h2>
                <p style={{ marginTop: 18 }}>Your message has arrived. We will write back to {form.email}.</p>
                <div className="pg-actions">
                  <button type="button" className="pg-btn" onClick={again}>
                    Send another
                  </button>
                </div>
              </div>
            ) : (
              <form className="pg-form" onSubmit={submit} noValidate={false} ref={formReveal}>
                <label className="pg-field" data-rise style={{ "--i": 0 }}>
                  <span>Who you are</span>
                  <select name="role" value={role} onChange={(event) => setRole(event.target.value)}>
                    <option value="">Choose one</option>
                    {ROLES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="pg-row-2" data-rise style={{ "--i": 1 }}>
                  <label className="pg-field">
                    <span>Name</span>
                    <input type="text" name="name" autoComplete="name" required maxLength={80} value={form.name} onChange={set("name")} />
                  </label>
                  <label className="pg-field">
                    <span>E‑mail</span>
                    <input type="email" name="email" autoComplete="email" required maxLength={120} value={form.email} onChange={set("email")} />
                  </label>
                </div>
                <label className="pg-field" data-rise style={{ "--i": 2 }}>
                  <span>
                    Organisation <small>(optional)</small>
                  </span>
                  <input type="text" name="organization" autoComplete="organization" maxLength={120} value={form.organization} onChange={set("organization")} />
                </label>
                <label className="pg-field" data-rise style={{ "--i": 3 }}>
                  <span>
                    Message <small id="ct-message-limit">(10 to {MAX} characters)</small>
                  </span>
                  <textarea name="message" required minLength={10} maxLength={MAX} value={form.message} onChange={set("message")} aria-describedby="ct-message-limit ct-message-count" placeholder="Where is your land, and what would you like to do with Chernozem?" />
                </label>
                <span className="pg-form-note" id="ct-message-count" aria-live="polite">
                  {form.message.length} of {MAX} characters
                </span>
                {/* A trap for robots: people never see this field. */}
                <div className="pg-hp" aria-hidden="true">
                  <label>
                    Website
                    <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                  </label>
                </div>
                {error && (
                  <p className="pg-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="ct-foot" data-rise style={{ "--i": 4 }}>
                  <span className="pg-form-note">Saved privately; never shared.</span>
                  <button type="submit" className="pg-btn" disabled={busy}>
                    {busy ? "Sending…" : "Send the message"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="pg-sec pg-sec-surface" aria-labelledby="ct-topics">
        <div className="pg-grid">
          <Reveal className="ct-pics-head">
            <h2 className="pg-h2" id="ct-topics">
              What to write about
            </h2>
          </Reveal>
        </div>
        <Stagger className="pg-grid" style={{ marginTop: 28 }}>
          {TOPICS.map((item) => (
            <StaggerItem key={item.src} as="figure" className="pg-fig ct-pic">
              <img className="pg-pic" src={item.src} width="1920" height="1200" alt={item.alt} loading="lazy" decoding="async" />
              <figcaption>{item.caption}</figcaption>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="pg-sec" aria-labelledby="ct-else">
        <div className="pg-grid">
          <Reveal className="ct-else-head">
            <h2 className="pg-h2" id="ct-else">
              Elsewhere
            </h2>
          </Reveal>
          <Stagger as="ul" className="ct-else-list">
            <StaggerItem as="li">
              <a className="pg-link" href={LINKS.github} target="_blank" rel="noreferrer">
                The code is public on GitHub.
              </a>
            </StaggerItem>
            <StaggerItem as="li">
              <a className="pg-link" href={LINKS.paper} target="_blank" rel="noreferrer">
                The paper’s data and code are on Harvard Dataverse.
              </a>
            </StaggerItem>
            <StaggerItem as="li">
              <a className="pg-link" href={LINKS.cac} target="_blank" rel="noreferrer">
                Chernozem is an entry to the Congressional App Challenge 2026.
              </a>
            </StaggerItem>
          </Stagger>
        </div>
      </section>
    </div>
  );
}
