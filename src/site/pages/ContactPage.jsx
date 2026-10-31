// WHAT THIS FILE DOES
// The website's Contact page (chernozem.app/contact): a short form whose
// messages go to chernozem.app@gmail.com, and that address as a plain
// e-mail link for anyone who prefers their own mail program.
//
// The form: who you are (four choices, each with a map of the part of
// Chernozem that person would use; the message's prompt follows the
// choice), name, e-mail, organisation (optional) and the message. It is
// sent to the server (POST /api/contact, src/api/siteApi.js sendContact),
// which keeps it and e-mails it to the address above (one that could not be
// sent yet is tried again later).
// The chosen role travels as its own field ("role"; the e-mail prints it).
// A hidden "website" field catches robots; the server takes at most five
// messages an hour from one visitor and says so.
//
// WHO EDITS IT
// Whoever changes the contact page. The address is CONTACT_EMAIL in
// src/site/content/site.js; the server side is server/messages.js and
// server/mail.js.

import { useState } from "react";
import { sendContact } from "../../api/siteApi.js";
import { CONTACT_EMAIL } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

// The four choices: what each is called, the picture (a map of the part of
// Chernozem that person would use; "zoom" enlarges it a little where the
// screenshot has its own white margin), and the prompt the message box
// shows.
const ROLES = [
  { value: "Farmer", src: "/site/shots/phone-field-fields.webp", width: 780, height: 1688, position: "50% 26%", zoom: "1.1", prompt: "Where is your farm, and what do you grow?" },
  { value: "Government or NGO", src: "/site/shots/phone-atlas-map.webp", width: 780, height: 1688, position: "50% 40.5%", zoom: "1.05", prompt: "Which country or region, and what do you need to decide?" },
  { value: "Researcher", src: "/site/story/disturbance-map.webp", width: 1600, height: 964, position: "70% 50%", prompt: "What are you working on, and what would help?" },
  { value: "Something else", src: "/site/story/edition-1-colab.webp", width: 1340, height: 892, position: "62% 50%", prompt: "What would you like to say?" },
];
const DEFAULT_PROMPT = "Where is your land, and what would you like to do with Chernozem?";

const MAX = 2000; // the server's limits for the message (server/messages.js)
const MIN = 10;
const EMPTY = { name: "", email: "", organization: "", message: "", website: "" };

export default function ContactPage() {
  usePageTitle("Contact");
  // The form's entrance. Called on every render, whichever state shows
  // (a hook inside a branch once crashed this page).
  const reveal = useReveal();
  const [role, setRole] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const prompt = ROLES.find((item) => item.value === role)?.prompt || DEFAULT_PROMPT;

  function set(key) {
    return (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await sendContact({ ...form, role, message: form.message.trim() });
      setSentTo(form.email.trim());
    } catch (err) {
      setError(err?.message || "The message could not be sent. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setSentTo("");
    setForm(EMPTY);
    setRole("");
  }

  return (
    <div className="pg">
      <section className="pg-sec ct" aria-labelledby="ct-title">
        <div className="pg-grid">
          <div className="ct-head">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="ct-title">
                Write to Chernozem
              </h1>
            </div>
          </div>
          <div className="ct-intro">
            <p className="pg-lead pg-fade">Ask a question, propose a pilot on your land, or tell us what is wrong.</p>
            <p className="ct-address pg-fade-2">
              Messages go to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
          </div>
        </div>

        <div className="ct-body" ref={reveal}>
          {sentTo ? (
            <div className="ct-done" role="status">
              <h2 className="pg-h2">Thank you.</h2>
              <p className="pg-lead">
                Your message is on its way to {CONTACT_EMAIL}. The reply will come to {sentTo}.
              </p>
              <div className="pg-actions">
                <button type="button" className="pg-btn" onClick={again}>
                  Send another
                </button>
              </div>
            </div>
          ) : (
            <form className="ct-form" onSubmit={submit} aria-labelledby="ct-title">
              <fieldset className="ct-roles" data-rise="">
                <legend className="ct-legend">
                  Who you are <small>(optional)</small>
                </legend>
                <div className="ct-role-grid">
                  {ROLES.map((item) => (
                    <label key={item.value} className="ct-role">
                      <input className="ct-role-input" type="radio" name="role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} />
                      <span className="ct-role-frame" data-settle="">
                        <img className="ct-role-pic" src={item.src} width={item.width} height={item.height} alt="" loading="eager" decoding="async" style={{ objectPosition: item.position, scale: item.zoom }} />
                      </span>
                      <span className="ct-role-name">{item.value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="ct-fields">
                <div className="pg-row-2" data-rise="" style={{ "--i": 1 }}>
                  <label className="pg-field">
                    <span>Name</span>
                    <input type="text" name="name" autoComplete="name" required maxLength={80} value={form.name} onChange={set("name")} />
                  </label>
                  <label className="pg-field">
                    <span>E‑mail</span>
                    <input type="email" name="email" autoComplete="email" required maxLength={120} value={form.email} onChange={set("email")} />
                  </label>
                </div>
                <label className="pg-field" data-rise="" style={{ "--i": 2 }}>
                  <span>
                    Organisation <small>(optional)</small>
                  </span>
                  <input type="text" name="organization" autoComplete="organization" maxLength={120} value={form.organization} onChange={set("organization")} />
                </label>
                <label className="pg-field" data-rise="" style={{ "--i": 3 }}>
                  <span>
                    Message <small id="ct-message-limit">({MIN} to {MAX} characters)</small>
                  </span>
                  <textarea name="message" required minLength={MIN} maxLength={MAX} value={form.message} onChange={set("message")} aria-describedby="ct-message-limit ct-message-count" placeholder={prompt} />
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
                <div className="ct-send" data-rise="" style={{ "--i": 4 }}>
                  <button type="submit" className="pg-btn" disabled={busy}>
                    {busy ? "Sending…" : "Send the message"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
