// WHAT THIS FILE DOES
// The website's Contact page (chernozem.app/contact): a short form whose
// messages go to chernozem.app@gmail.com, and that address as a plain
// e-mail link for anyone who prefers their own mail program.
//
// The form: who you are (one row of four plain choices; the message's
// prompt follows the choice), name, e-mail, organisation (optional) and
// the message. It is sent to the server (POST /api/contact,
// src/api/siteApi.js sendContact), which keeps it and e-mails it to the
// address above (one that could not be sent yet is tried again later).
// The chosen role travels as its own field ("role"; the e-mail prints it).
// A hidden "website" field catches robots; the server takes at most five
// messages an hour from one visitor, and when the form as a whole is too
// busy it says so and gives the address (its words are shown as they are,
// with the address made a link).
//
// Once a message is sent, the form gives way to "Thank you.", which takes
// the keyboard's place (so the next Tab continues from there), and says
// the message was received and where a reply would go. Nothing here says
// the e-mail is already on its way: until the owner has set up e-mail on
// the server, a message waits there and is sent later.
//
// On a wide screen the four phone screens of the product stand under the
// choice, beside the fields. A phone's or a tablet's screen shows the form
// alone (the pictures are hidden there and, being loading="lazy", never
// downloaded), so the message and Send come right after the choice.
//
// WHO EDITS IT
// Whoever changes the contact page. The address is CONTACT_EMAIL in
// src/site/content/site.js; the server side is server/messages.js and
// server/mail.js.

import { useEffect, useRef, useState } from "react";
import { sendContact } from "../../api/siteApi.js";
import { CONTACT_EMAIL } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

// The four choices, and the prompt the message box shows for each.
const ROLES = [
  { value: "Farmer", prompt: "Where is your farm, and what do you grow?" },
  { value: "Government or NGO", prompt: "Which country or region, and what do you need to decide?" },
  { value: "Researcher", prompt: "What are you working on, and what would help?" },
  { value: "Something else", prompt: "What would you like to say?" },
];
const DEFAULT_PROMPT = "Where is your land, and what would you like to do with Chernozem?";

// The product on a phone, beside the form on wide screens only.
const PHONES = [
  { src: "/site/shots/phone-field-overview.webp", alt: "Field on a phone: the demo farm's overview, with the fields to watch and the weather" },
  { src: "/site/shots/phone-field-fields.webp", alt: "Field on a phone: the farm's fields outlined on the satellite map" },
  { src: "/site/shots/phone-atlas-overview.webp", alt: "Atlas on a phone: Ukraine in September 2026, with the cropland analysed and the damage" },
  { src: "/site/shots/phone-atlas-map.webp", alt: "Atlas on a phone: the map of Ukraine by priority, with the weights under it" },
];

const MAX = 2000; // the server's limits for the message (server/messages.js)
const MIN = 10;
const EMPTY = { name: "", email: "", organization: "", message: "", website: "" };

// The server's own words, with the address made a link wherever it
// appears ("The form is busy right now. Please write to ...").
function withMailLink(text) {
  return String(text)
    .split(CONTACT_EMAIL)
    .flatMap((part, index) => (index ? [<a key={index} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, part] : [part]));
}

export default function ContactPage() {
  usePageTitle("Contact");
  // The form's entrance. Called on every render, whichever state shows
  // (a hook inside a branch once crashed this page).
  const reveal = useReveal();
  const doneTitle = useRef(null);
  const [role, setRole] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  // Sent: the form and its button are gone, so the keyboard's place moves
  // to "Thank you." instead of falling back to the top of the page.
  useEffect(() => {
    if (sentTo) doneTitle.current?.focus();
  }, [sentTo]);

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

  // Another message: an empty form, the keyboard back on Name.
  function again() {
    setSentTo("");
    setForm(EMPTY);
    setRole("");
    window.setTimeout(() => document.getElementById("ct-name")?.focus(), 0);
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
              <h2 className="pg-h2 ct-done-title" tabIndex={-1} ref={doneTitle}>
                Thank you.
              </h2>
              <p className="pg-lead">Your message was received. Any reply will go to {sentTo}.</p>
              <div className="pg-actions">
                <button type="button" className="pg-btn" onClick={again}>
                  Send another
                </button>
              </div>
            </div>
          ) : (
            <form className="ct-form" onSubmit={submit} aria-labelledby="ct-title">
              <fieldset className="ct-roles">
                <legend className="ct-legend" data-rise="">
                  Who you are <small>(optional)</small>
                </legend>
                <div className="ct-role-row">
                  {ROLES.map((item, index) => (
                    <label key={item.value} className="ct-role" data-rise="" style={{ "--i": index + 1 }}>
                      <input className="ct-role-input" type="radio" name="role" value={item.value} checked={role === item.value} onChange={() => setRole(item.value)} />
                      <span>{item.value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="ct-fields">
                <div className="pg-row-2" data-rise="" style={{ "--i": 1 }}>
                  <label className="pg-field">
                    <span>Name</span>
                    <input id="ct-name" type="text" name="name" autoComplete="name" required maxLength={80} value={form.name} onChange={set("name")} />
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
                    {withMailLink(error)}
                  </p>
                )}
                <div className="ct-send" data-rise="" style={{ "--i": 4 }}>
                  <button type="submit" className="pg-btn" disabled={busy}>
                    {busy ? "Sending…" : "Send the message"}
                  </button>
                </div>
              </div>

              <figure className="ct-phones">
                <div className="ct-phones-row">
                  {PHONES.map((phone, index) => (
                    <img key={phone.src} className="ct-phone" src={phone.src} width="780" height="1688" alt={phone.alt} loading="lazy" decoding="async" data-settle="" style={{ "--i": index + 1 }} />
                  ))}
                </div>
                <figcaption>Field and Atlas on a phone.</figcaption>
              </figure>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
