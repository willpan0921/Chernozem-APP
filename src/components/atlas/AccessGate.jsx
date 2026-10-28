// WHAT THIS FILE DOES
// The access screen, and who the visitor is. It asks the server once when
// the app loads (/api/auth/status) and then knows two kinds of visitor:
//
//   The demo visitor   typed the access code the owner set on the server
//                      (ATLAS_ACCESS_CODE in .env): both products, the
//                      shared Ukraine data. Without a code set, the app
//                      opens straight away, as before.
//   An account         registered on the website (/register) and signed in
//                      there (/signin): one product, their own workspace.
//                      Their profile (GET /api/account: name, country, the
//                      place to watch) is read once here too, so the first
//                      screens can start near home.
//
// When nobody is signed in and a code is required, the card asks for the
// code and offers the website's "Sign in" and "Register" pages (plain
// links: the website owns those pages and the Firebase sign-in; nothing
// here loads Firebase). An account that has not finished its profile on
// the website is sent back to /register to finish it.
//
// If any later server call says "not signed in" (the code was changed,
// the account's sign-in ran out, or "Sign out" was pressed), the card
// comes back. If the server cannot be reached at all, the app opens and
// shows its own message, as before.
//
// Everything learned is given to the rest of the app through useAccess()
// (src/state/useAccess.js) as { shared, account, profile }.
//
// Also here: <AccountCard />, the "Account" card on both Settings pages
// (name, e-mail, edition, place, "Sign out"), shown only for an account.
//
// WHAT IT RECEIVES
// children - the whole app, shown once the visitor may use it.
//
// WHO EDITS IT
// Nobody, normally. The server side is server/auth.js; the rules are in
// src/lib/access.js.

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import Logo from "../ui/Logo.jsx";

import { Button, Card } from "../ui/index.js";
import { AUTH_REQUIRED_EVENT, getAccount, getAuthStatus, signIn, signOut } from "../../api/atlasApi.js";
import { accountLabel, isShared, needsProfile, registerPathFor } from "../../lib/access.js";
import { profilePlace } from "../../lib/profile.js";
import { AccessContext, useAccess } from "../../state/useAccess.js";
import "./atlas.css";

const NOBODY = { shared: null, account: null, profile: null };

export default function AccessGate({ children }) {
  // "checking" (asking the server), "open" (show the app), "locked" (show
  // the card), "profile" (an account that must finish its profile first)
  const [state, setState] = useState("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // What the server said about the visitor; NOBODY while not known.
  const [access, setAccess] = useState(NOBODY);
  const inputRef = useRef(null);

  // Asks the server whether this browser may use the app, and who it is.
  const check = useCallback(async () => {
    let status;
    try {
      status = await getAuthStatus();
    } catch {
      // Server not reachable: open the app, which shows its own message.
      setState("open");
      return;
    }
    const account = status?.account && typeof status.account === "object" ? status.account : null;
    let profile = null;
    if (account) {
      // The profile is a comfort, not a condition: without it the app still opens.
      try {
        profile = (await getAccount())?.profile || null;
      } catch {
        profile = null;
      }
    }
    setAccess({ shared: isShared(status), account, profile });
    if (status.required && !status.signedIn) setState("locked");
    else if (needsProfile(status)) setState("profile");
    else setState("open");
  }, []);

  useEffect(() => {
    check();
    // A server call answered "not signed in": check again.
    window.addEventListener(AUTH_REQUIRED_EVENT, check);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, check);
  }, [check]);

  useEffect(() => {
    if (state === "locked") inputRef.current?.focus();
  }, [state]);

  async function submit(event) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await signIn(code);
      // The code is the demo: no account, the shared data.
      setAccess({ shared: isShared(answer) ?? true, account: null, profile: null });
      setCode("");
      setState("open");
    } catch (err) {
      setError(err?.message || "Could not sign in. Try again.");
      inputRef.current?.select();
    } finally {
      setBusy(false);
    }
  }

  if (state === "open") return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
  if (state === "checking") return <div className="access-gate" aria-busy="true" />;
  // The website's register page finishes the profile (brief §8, part three).
  if (state === "profile") return <Navigate to={registerPathFor(access)} replace />;

  return (
    <main className="access-gate">
      <form className="access-card" onSubmit={submit}>
        <span className="access-logo" aria-hidden="true">
          <Logo size={44} />
        </span>
        <h1 className="access-title">Chernozem</h1>
        <p className="access-lead">Enter the access code you were given.</p>
        <label className="field-label" htmlFor="access-code">
          Access code
        </label>
        <input
          id="access-code"
          ref={inputRef}
          className="input access-input"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "access-error" : undefined}
        />
        {error && (
          <p id="access-error" className="access-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" block type="submit" disabled={busy || !code.trim()}>
          {busy ? "Checking..." : "Enter"}
        </Button>
        {/* Plain links: the website's pages handle the account sign-in. */}
        <p className="access-links">
          <span>
            Have an account? <a href="/signin">Sign in</a>
          </span>
          <span>
            No account? <a href="/register">Register</a>
          </span>
        </p>
        <p className="access-foot">
          No code yet? <a href="/">Read about Chernozem</a> or <a href="/contact">ask for access</a>.
        </p>
      </form>
    </main>
  );
}

// ---------- The Settings pages' account card ----------

const EDITIONS = { field: "Chernozem Field", atlas: "Chernozem Atlas" };

// The "Account" card: who is signed in, from the server's answer and the
// profile. Nothing for the demo visitor (the demo has no account).
export function AccountCard() {
  const { account, profile } = useAccess();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!account) return null;

  const who = accountLabel(account);
  const place = profilePlace(profile);
  const where = place?.label || [profile?.address, profile?.country].filter((part) => typeof part === "string" && part.trim()).join(", ");
  const rows = [
    ["Name", account.name || profile?.name],
    ["E-mail", account.email],
    ["Edition", EDITIONS[account.product]],
    ["Organisation", profile?.organization],
    ["Place", where],
  ].filter(([, text]) => typeof text === "string" && text.trim());

  async function leave() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // On success the access card replaces the whole app.
      await signOut({ account: true });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className="account-card"
      title="Account"
      subtitle="Only you see this workspace."
      actions={
        <Button size="sm" icon={<LogOut size={14} />} onClick={leave} disabled={busy}>
          {busy ? "Signing out…" : "Sign out"}
        </Button>
      }
    >
      <div className="account-who">
        <span className={`avatar avatar-${account.product === "atlas" ? "atlas" : "farm"}`} aria-hidden="true">
          {who.initials}
        </span>
        <span className="account-who-name">{who.label}</span>
      </div>
      <dl className="account-rows">
        {rows.map(([name, text]) => (
          <div key={name} className="account-row">
            <dt>{name}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      {failed && (
        <p className="access-error" role="alert">
          Could not reach the server, so this browser is still signed in. Try again.
        </p>
      )}
    </Card>
  );
}
