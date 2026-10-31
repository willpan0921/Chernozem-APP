// WHAT THIS FILE DOES
// The owner's own sign-in (chernozem.app/owner). It is linked from
// nowhere, and while it is open it asks search engines not to list it (a
// "robots: noindex" line in the page's head, removed when the visitor
// leaves). One field for the owner's code (the old access code, set on the
// server as ATLAS_ACCESS_CODE) and one button. The code is checked by the
// server (POST /api/auth/login, signIn in src/api/atlasApi.js); with it this
// browser may change the Ukraine demo, which everyone else only looks at.
// After signing in the tab leaves the demo view (leaveDemo(),
// src/lib/demoMode.js) and two links open Field and Atlas. A browser that
// is already signed in as the owner sees the two links straight away.
//
// WHO EDITS IT
// The owner, rarely. Nothing on the website links here on purpose.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAuthStatus, signIn } from "../../api/atlasApi.js";
import { leaveDemo } from "../../lib/demoMode.js";
import { SITE } from "../content/site.js";
import { usePageTitle } from "../hooks.js";
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

// Is this browser already the owner's? The server says so in "mode"
// ("owner", or "open" on a computer where no code is set at all). An older
// server without "mode": signed in with the code and not as an account.
function isOwner(status) {
  if (!status) return false;
  if (status.mode) return status.mode === "owner" || status.mode === "open";
  return status.required === false || Boolean(status.signedIn && !status.account);
}

export default function OwnerPage() {
  usePageTitle("Owner sign-in");
  useNoIndex();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let on = true;
    getAuthStatus()
      .then((status) => {
        if (on && isOwner(status)) {
          leaveDemo();
          setOwner(true);
        }
      })
      .catch(() => {
        // The form below still works; the server is asked again on sign-in.
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
      setError("Type the code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signIn(typed);
      leaveDemo();
      setCode("");
      setOwner(true);
    } catch (err) {
      if (err?.code === "wrong_code") setError("That code is not right.");
      else setError(err?.message || "The code could not be checked. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg">
      <section className="pg-sec ow" aria-labelledby="ow-title">
        <h1 className="pg-h2" id="ow-title">
          Owner sign-in
        </h1>
        {owner ? (
          <div className="ow-open" role="status">
            <p>Signed in. The demo can be changed from this browser.</p>
            <div className="pg-actions">
              <Link className="pg-btn" to={SITE.appPath}>
                Open Field
              </Link>
              <Link className="pg-btn" to={SITE.atlasPath}>
                Open Atlas
              </Link>
            </div>
          </div>
        ) : (
          <form className="pg-form ow-form" onSubmit={submit}>
            <label className="pg-field" htmlFor="ow-code">
              <span>Code</span>
              <input id="ow-code" type="password" name="code" autoComplete="current-password" autoCapitalize="off" spellCheck="false" value={code} onChange={(event) => setCode(event.target.value)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "ow-error" : undefined} />
            </label>
            {error && (
              <p className="pg-error" id="ow-error" role="alert">
                {error}
              </p>
            )}
            <div>
              <button type="submit" className="pg-btn" disabled={busy}>
                {busy ? "Checking…" : "Sign in"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
