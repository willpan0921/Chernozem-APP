// WHAT THIS FILE DOES
// The website's contact page (chernozem.app/contact): a form that sends a
// message to the owner (it lands in Atlas > Settings, "Messages from the
// website"; the server route is POST /api/contact, server/messages.js) and
// the other ways to find the project: the code, the paper.
//
// WHO EDITS IT
// Whoever changes the contact page. The server side is server/messages.js.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import PageHero from "../components/PageHero.jsx";
import { Arrow, Reveal, Spotlight } from "../components/motion.jsx";
import { CheckCircle2, BookOpen, Code2, Mail, Clock } from "../components/Icons.jsx";
import { sendContact } from "../../api/siteApi.js";
import { LINKS } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
import "./pages.css";

const ROLES = ["Farmer", "Government", "NGO", "Demining", "Researcher", "Investor", "Press", "Other"];
const MAX = 2000;

export default function ContactPage() {
  usePageTitle("Contact");
  const [role, setRole] = useState("");
  const [form, setForm] = useState({ name: "", email: "", organization: "", message: "", website: "" });
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

  return (
    <>
      <PageHero eyebrow="Contact" title="Tell us about *your* land." lead="Ask for an access code, propose a pilot, share ground truth, or just say hello. Messages go straight to the team that runs Chernozem." />

      <section className="section">
        <div className="wrap">
          <div className="contact-grid">
            <div className="contact-side">
              <Reveal>
                <h2 className="h-2">Who we want to hear from</h2>
                <p className="lead" style={{ marginTop: 14 }}>
                  Farmers with fields to watch. Ministries, reconstruction funds and NGOs planning recovery. Demining groups with clearance records. Researchers with ground data. Investors who want to see the live app.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <Spotlight className="card-flat">
                  <span className="card-icon">
                    <Clock size={20} />
                  </span>
                  <h3 className="card-title" style={{ fontSize: "1.2rem" }}>
                    What happens next
                  </h3>
                  <p className="card-text">Your message is saved privately on Chernozem&apos;s own server, where the team that runs it reads it. No mailing lists, no third parties. You will hear back by email.</p>
                </Spotlight>
              </Reveal>
              <Reveal delay={0.15}>
                <Spotlight className="card-flat">
                  <span className="card-icon">
                    <BookOpen size={20} />
                  </span>
                  <h3 className="card-title" style={{ fontSize: "1.2rem" }}>
                    The research
                  </h3>
                  <p className="card-text">The data and code of the research behind Atlas are archived on Harvard Dataverse.</p>
                  <a href={LINKS.paper} target="_blank" rel="noreferrer" className="text-link" style={{ marginTop: 12 }}>
                    doi:10.7910/DVN/IYXPVS <Arrow />
                  </a>
                </Spotlight>
              </Reveal>
              <Reveal delay={0.2}>
                <Spotlight className="card-flat">
                  <span className="card-icon">
                    <Code2 size={20} />
                  </span>
                  <h3 className="card-title" style={{ fontSize: "1.2rem" }}>
                    The code
                  </h3>
                  <p className="card-text">Chernozem&apos;s code is public on GitHub. Read it, run it on your own computer, or report a problem.</p>
                  <a href={LINKS.github} target="_blank" rel="noreferrer" className="text-link" style={{ marginTop: 12 }}>
                    github.com/willpan0921/Chernozem-APP <Arrow />
                  </a>
                </Spotlight>
              </Reveal>
            </div>

            <Reveal delay={0.1}>
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div key="done" className="contact-form contact-done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
                    <span className="contact-done-check">
                      <CheckCircle2 size={36} />
                    </span>
                    <h2 className="h-2">Thank you.</h2>
                    <p className="lead" style={{ maxWidth: "36ch" }}>
                      Your message has arrived. We will write back to {form.email}.
                    </p>
                    <button type="button" className="btn btn-ghost" onClick={() => { setDone(false); setForm({ name: "", email: "", organization: "", message: "", website: "" }); setRole(""); }}>
                      Send another
                    </button>
                  </motion.div>
                ) : (
                  <motion.form key="form" className="contact-form" onSubmit={submit} initial={false} exit={{ opacity: 0, y: -10 }}>
                    <div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 600, marginBottom: 10 }}>I am a…</div>
                      <div className="contact-roles" role="group" aria-label="Who you are">
                        {ROLES.map((item) => (
                          <button key={item} type="button" className={`contact-role${role === item ? " is-on" : ""}`} aria-pressed={role === item} onClick={() => setRole(role === item ? "" : item)}>
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="contact-row">
                      <label>
                        Name
                        <input type="text" name="name" autoComplete="name" required maxLength={80} value={form.name} onChange={set("name")} />
                      </label>
                      <label>
                        Email
                        <input type="email" name="email" autoComplete="email" required maxLength={120} value={form.email} onChange={set("email")} />
                      </label>
                    </div>
                    <label>
                      <span>
                        Organisation <small>(optional)</small>
                      </span>
                      <input type="text" name="organization" autoComplete="organization" maxLength={120} value={form.organization} onChange={set("organization")} />
                    </label>
                    <label>
                      Message
                      <textarea name="message" required minLength={10} maxLength={MAX} value={form.message} onChange={set("message")} placeholder="Where is your land, and what would you like to do with Chernozem?" />
                    </label>
                    <span className="contact-count" aria-live="polite">
                      {form.message.length} / {MAX}
                    </span>
                    {/* A trap for robots: people never see this field. */}
                    <div className="contact-hp" aria-hidden="true">
                      <label>
                        Website
                        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
                      </label>
                    </div>
                    {error && (
                      <p className="contact-error" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="btn-row" style={{ justifyContent: "space-between" }}>
                      <span className="muted" style={{ fontSize: "0.82rem" }}>
                        <Mail size={13} style={{ verticalAlign: -2 }} /> Saved privately; never shared.
                      </span>
                      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                        {busy ? "Sending…" : "Send message"} {!busy && <Arrow />}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
