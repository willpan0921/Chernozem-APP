// WHAT THIS FILE DOES
// Who the visitor is, asked of the server when the app opens
// (GET /api/auth/status). There is no access-code screen any more: the app
// always opens, as one of these (src/lib/access.js has the rules):
//
//   The demo      anyone without an account, and an account holder who
//                 chose "Open Field" or "Open Atlas" on the website's Demo
//                 page: the Ukraine demo, both products, read-only. A
//                 button that would change something opens the "This is the
//                 demo" dialog instead (src/components/DemoDialog.jsx, drawn
//                 here; src/state/useDemoGuard.js).
//   The owner     signed in with the owner's key on the hidden /owner page
//                 (or "open": one's own computer, no key set on the server):
//                 the demo's data, and every change is saved.
//   An account    registered on the website: one product, their own
//                 workspace. Their profile (GET /api/account: name,
//                 country, the place to watch) is read here too, so the
//                 first screens start near home. An account that has not
//                 finished its profile is sent back to /register to finish it.
//
// An account holder looking at the demo: the server answers "demo" (this
// tab sends the demo's header, src/lib/demoMode.js); the gate then asks once
// more without it, and when an account is behind it, the sidebar offers
// "Open your own workspace" (ownHome).
//
// If the server cannot be reached, the app opens anyway, read-only, and
// shows its own messages; the gate asks again when the connection comes
// back (and every 20 seconds until it answers). When a later answer is a
// different visitor (signed out, the owner's key or the account's sign-in
// ran out), the whole app below starts again, so nothing of the one before
// stays on screen. The gate asks again when any call answers "not signed
// in" (401), and when the server refuses a change as the demo while the
// gate thought this was the owner or an account.
//
// Everything is given to the app through useAccess() (src/state/useAccess.js):
// { mode, readOnly, shared, account, profile, ownHome }.
//
// Also here: <AccountCard />, the "Account" card on both Settings pages
// (name, e-mail, edition, place, "Sign out"), shown only for an account.
//
// WHAT IT RECEIVES
// children - the whole app.
//
// WHO EDITS IT
// Nobody, normally. The server side is server/auth.js; the rules are in
// src/lib/access.js.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";

import { Button, Card } from "../ui/index.js";
import DemoDialog from "../DemoDialog.jsx";
import { AUTH_REQUIRED_EVENT, DEMO_READ_ONLY_EVENT, getAccount, getAuthStatus, signOut } from "../../api/atlasApi.js";
import {
  accountLabel,
  accountOf,
  backToWebsitePath,
  homePathFor,
  identityOf,
  isReadOnly,
  isShared,
  modeOf,
  needsProfile,
  registerPathFor,
} from "../../lib/access.js";
import { isDemoView } from "../../lib/demoMode.js";
import { profilePlace } from "../../lib/profile.js";
import { AccessContext, UNKNOWN_ACCESS, useAccess } from "../../state/useAccess.js";
import { DemoGuardContext } from "../../state/useDemoGuard.js";
import "./atlas.css";

// How often to ask again while the server could not be reached.
const RETRY_MS = 20000;

// Asks the server who this is, and everything the app needs about it.
// Throws when the server cannot be reached.
async function readAccess() {
  const status = await getAuthStatus();
  const mode = modeOf(status);
  const account = accountOf(status);
  let profile = null;
  if (account) {
    // The profile is a comfort, not a condition: without it the app still opens.
    try {
      profile = (await getAccount())?.profile || null;
    } catch {
      profile = null;
    }
  }
  // An account holder looking at the demo: where their own workspace is.
  let ownHome = null;
  if (mode === "demo" && isDemoView()) {
    try {
      const own = await getAuthStatus({ view: "own" });
      if (modeOf(own) === "account") ownHome = needsProfile(own) ? registerPathFor(own) : homePathFor(own);
    } catch {
      ownHome = null;
    }
  }
  return { mode, readOnly: isReadOnly(status), shared: isShared(status), account, profile, ownHome };
}

export default function AccessGate({ children }) {
  // "checking" (the first answer), "open" (show the app), "profile" (an
  // account that must finish its profile first)
  const [state, setState] = useState("checking");
  const [access, setAccess] = useState(UNKNOWN_ACCESS);
  // Counts the visitors seen: a new number starts the app below again.
  const [generation, setGeneration] = useState(0);
  // The "This is the demo" dialog.
  const [asking, setAsking] = useState(false);
  // Who the last answer was (src/lib/access.js identityOf); null until the
  // server has answered once.
  const known = useRef(null);
  const accessRef = useRef(access);
  accessRef.current = access;

  const check = useCallback(async () => {
    let next;
    try {
      next = await readAccess();
    } catch {
      // Server not reachable: open the app, which shows its own message,
      // read-only until the server answers. A visitor already known stays
      // as they were (one failed call is not a new visitor).
      if (known.current === null) setAccess(UNKNOWN_ACCESS);
      setState("open");
      return;
    }
    const who = identityOf(next);
    // Someone else now (signed out, a sign-in that ran out): start again.
    if (known.current !== null && known.current !== who) setGeneration((count) => count + 1);
    known.current = who;
    setAccess(next);
    // The website's register page finishes the profile.
    setState(needsProfile(next) ? "profile" : "open");
  }, []);

  useEffect(() => {
    check();
    // A server call answered "not signed in": ask again.
    window.addEventListener(AUTH_REQUIRED_EVENT, check);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, check);
  }, [check]);

  // A change refused because this is the demo: say so. If the gate thought
  // this was the owner or an account, the server sees the demo now (the
  // sign-in ran out): ask who this is again.
  useEffect(() => {
    const refused = () => {
      setAsking(true);
      if (!accessRef.current.readOnly) check();
    };
    window.addEventListener(DEMO_READ_ONLY_EVENT, refused);
    return () => window.removeEventListener(DEMO_READ_ONLY_EVENT, refused);
  }, [check]);

  // Not known yet (the server could not be reached): ask again when the
  // connection is back, and every little while.
  const unknown = state === "open" && access.mode === null;
  useEffect(() => {
    if (!unknown) return undefined;
    const timer = setInterval(check, RETRY_MS);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, [unknown, check]);

  const ask = useCallback(() => setAsking(true), []);
  const guard = useMemo(() => ({ ask }), [ask]);
  const close = useCallback(() => setAsking(false), []);

  if (state === "checking") return <div className="access-gate" aria-busy="true" />;
  if (state === "profile") return <Navigate to={registerPathFor(access)} replace />;

  return (
    <AccessContext.Provider value={access}>
      <DemoGuardContext.Provider value={guard}>
        <Fragment key={generation}>{children}</Fragment>
        <DemoDialog open={asking} mode={access.mode} onClose={close} />
      </DemoGuardContext.Provider>
    </AccessContext.Provider>
  );
}

// ---------- The Settings pages' account card ----------

const EDITIONS = { field: "Chernozem Field", atlas: "Chernozem Atlas" };

// The "Account" card: who is signed in, from the server's answer and the
// profile. Nothing for the demo (it has no account).
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
      await signOut({ account: true });
      // Signed out: back to the website, with nothing of the account left
      // in this tab (the page loads afresh).
      window.location.assign(backToWebsitePath());
    } catch {
      setFailed(true);
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
