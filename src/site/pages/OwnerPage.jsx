// WHAT THIS FILE DOES
// The owner's own sign-in (chernozem.app/owner). It is linked from
// nowhere, and while it is open it asks search engines not to list it (a
// "robots: noindex" line in the page's head, removed when the visitor
// leaves).
//
// The owner signs in with the Chernozem Google account. One button opens
// Google's sign-in window (Firebase, src/lib/firebase.js loadFirebaseAuth);
// Google's signed answer goes to our server (POST /api/auth/firebase,
// src/api/accountApi.js postFirebaseToken), which sets the account cookie.
// Then the page asks the server who this browser is (GET /api/auth/status,
// getStatus) and shows one of these:
//   - mode "owner": the Google account is the owner's (its e-mail is
//     verified and listed in OWNER_EMAILS on the server, normally
//     chernozem.app@gmail.com; server/auth.js decides, never this page).
//     The two doors below become "Open Field" and "Open Atlas". The tab
//     leaves the demo view first (leaveDemo(), src/lib/demoMode.js), so
//     the app does not ask for the read-only demo and the owner can change
//     it.
//   - mode "open": the owner's own computer with no sign-in set up at all
//     (local development): the two doors straight away.
//   - any other account: "This Google account is not the owner's." and
//     Sign out (it ends the server's cookie and Firebase's sign-in).
// There is no code field: the old access code was handed out to visitors,
// so it opens nothing any more (the server answers the old address with
// 410 owner_key_retired).
//
// The two doors are the Demo page's (DEMO_DOORS in src/site/content/
// site.js, pages.css ".dm-door"): pictures of Field and Atlas. They are
// links only for the owner; before that they show what the sign-in opens.
//
// WHO EDITS IT
// The owner, rarely. Nothing on the website links here on purpose. Who
// counts as the owner is set on the server (OWNER_EMAILS on Render).

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getStatus, logoutEverywhere, postFirebaseToken } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import { leaveDemo } from "../../lib/demoMode.js";
import { DEMO_DOORS } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

// While this page is open, search engines are asked not to list it.
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

// What the server's answer means here: "owner" (may change the demo),
// "open" (this computer needs no sign-in), "other" (signed in, but not as
// the owner) or "out" (not signed in).
function stageOf(status) {
  if (status?.mode === "owner") return "owner";
  if (status?.mode === "open") return "open";
  if (status?.account) return "other";
  return "out";
}

// Firebase's and our server's errors, in plain words.
const NOT_SET_UP = "This server does not take Google sign-ins yet.";
const PROBLEMS = {
  "auth/popup-closed-by-user": "The Google window was closed before you signed in. Try again.",
  "auth/cancelled-popup-request": "The Google window was closed before you signed in. Try again.",
  "auth/popup-blocked": "The browser blocked the Google window. Allow pop-ups for this site and try again.",
  "auth/network-request-failed": "Could not reach Google. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/user-disabled": "This Google account has been switched off.",
  "auth/configuration-not-found": NOT_SET_UP,
  "auth/operation-not-allowed": NOT_SET_UP,
  "auth/admin-restricted-operation": NOT_SET_UP,
  accounts_off: NOT_SET_UP,
  bad_token: "Our server could not check the sign-in. Try again.",
};

function problemOf(error) {
  const code = error?.code || "";
  if (PROBLEMS[code]) return PROBLEMS[code];
  if (error?.status === 503) return NOT_SET_UP;
  if (code === "offline" || error?.status === 0) return error?.message || "Could not reach the server. Check your connection and try again.";
  return `Something went wrong${code ? ` (${code.replace(/^auth\//, "")})` : ""}. Try again.`;
}

const LOADING = "The sign-in is still loading. Try again in a moment.";

export default function OwnerPage() {
  usePageTitle("Owner sign-in");
  useNoIndex();
  // The entrances of the doors (site.css, "Entrances").
  const reveal = useReveal();
  // "wait" (asking the server), "out", "owner", "open" or "other".
  const [stage, setStage] = useState("wait");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fb, setFb] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Who this browser is, from the server (without the demo's header:
  // accountApi.js never sends it).
  function show(status) {
    const next = stageOf(status);
    // The owner's links open the app itself, not the read-only demo view.
    if (next === "owner" || next === "open") leaveDemo();
    setEmail(status?.account?.email || "");
    setStage(next);
  }

  useEffect(() => {
    let cancelled = false;
    getStatus()
      .then((status) => {
        if (!cancelled) show(status);
      })
      .catch(() => {
        // No answer: the button still works; the server is asked again then.
        if (!cancelled) setStage("out");
      });
    // Firebase is fetched now, so the Google window opens at once on a click
    // (a browser may block a window that opens long after the click).
    loadFirebaseAuth()
      .then((module) => {
        if (!cancelled) setFb(module);
      })
      .catch(() => {
        // Fetched again on the click.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const module = fb || (await loadFirebaseAuth().catch(() => null));
      if (!module) throw Object.assign(new Error(LOADING), { code: "loading" });
      const credential = await module.signInWithPopup(module.auth, module.googleProvider());
      const idToken = await module.getIdToken(credential.user);
      await postFirebaseToken(idToken);
      const status = await getStatus();
      if (alive.current) show(status);
    } catch (err) {
      if (alive.current) setError(err?.code === "loading" ? LOADING : problemOf(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await logoutEverywhere();
    } catch {
      // Already out, or no server.
    }
    try {
      const module = fb || (await loadFirebaseAuth());
      await module.signOut(module.auth);
    } catch {
      // Nothing to sign out of.
    }
    if (!alive.current) return;
    setEmail("");
    setError("");
    setBusy(false);
    setStage("out");
  }

  const canEdit = stage === "owner" || stage === "open";

  return (
    <div className="pg">
      <section className="pg-sec ow" aria-labelledby="ow-title">
        <div className="pg-grid">
          <div className="ow-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="ow-title">
                Owner sign-in
              </h1>
            </div>
            <p className="pg-lead pg-fade">Sign in with the Chernozem Google account to change the Ukraine demo. Everyone else can only look at it.</p>

            <div className="ow-act pg-fade-2" aria-live="polite" aria-busy={stage === "wait" ? "true" : undefined}>
              {stage === "out" && (
                <button type="button" className="pg-btn" onClick={signIn} disabled={busy}>
                  {busy ? "Signing in…" : "Sign in with the Chernozem Google account"}
                </button>
              )}

              {stage === "owner" && (
                <>
                  <p>
                    Signed in as {email ? <strong>{email}</strong> : "the owner"}. The demo can be changed from this browser.
                  </p>
                  <button type="button" className="pg-textbtn" onClick={signOut} disabled={busy}>
                    Sign out
                  </button>
                </>
              )}

              {stage === "open" && <p>This computer needs no sign-in: the demo can be changed from here.</p>}

              {stage === "other" && (
                <>
                  <p className="ow-refused">This Google account is not the owner’s.</p>
                  {email && (
                    <p>
                      Signed in as <strong>{email}</strong>.
                    </p>
                  )}
                  <button type="button" className="pg-btn" onClick={signOut} disabled={busy}>
                    {busy ? "Signing out…" : "Sign out"}
                  </button>
                </>
              )}

              {error && (
                <p className="pg-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>

          <div className="dm-doors ow-doors" ref={reveal}>
            {DEMO_DOORS.map((door, index) => {
              const pictures = (
                <span className="dm-door-pics" aria-hidden="true">
                  <span className="dm-door-pic dm-door-wide" data-settle="" style={{ "--i": index + 1 }}>
                    <img src={door.wide.src} width={door.wide.width} height={door.wide.height} alt="" loading="lazy" decoding="async" style={{ objectPosition: door.wide.position }} />
                  </span>
                  <span className="dm-door-pic dm-door-phone" data-settle="" style={{ "--i": index + 2 }}>
                    <img src={door.phone.src} width={door.phone.width} height={door.phone.height} alt="" loading="eager" decoding="async" />
                  </span>
                </span>
              );
              return canEdit ? (
                <Link key={door.key} className={`dm-door dm-door-${door.key}`} to={door.to} onClick={leaveDemo} data-rise="" style={{ "--i": index }}>
                  {pictures}
                  <span className="dm-door-label">{door.label}</span>
                </Link>
              ) : (
                <div key={door.key} className={`dm-door dm-door-${door.key} is-still`} data-rise="" style={{ "--i": index }}>
                  {pictures}
                  <span className="dm-door-caption">{door.caption}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
