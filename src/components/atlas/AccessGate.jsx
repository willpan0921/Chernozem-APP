// WHAT THIS FILE DOES
// The access screen. When the owner has set an access code on the server
// (ATLAS_ACCESS_CODE in .env), visitors see a small card asking for it
// before the app opens. Without a code the app opens straight away, as
// before.
//
// It asks the server once when the app loads (/api/auth/status). If any
// later server call says "not signed in" (for example after the code was
// changed), the card comes back.
//
// WHAT IT RECEIVES
// children - the whole app, shown once the visitor may use it.
//
// WHO EDITS IT
// Nobody, normally. The server side is server/auth.js.

import { useCallback, useEffect, useRef, useState } from "react";
import { Sprout } from "lucide-react";
import { Button } from "../ui/index.js";
import { AUTH_REQUIRED_EVENT, getAuthStatus, signIn } from "../../api/atlasApi.js";
import "./atlas.css";

export default function AccessGate({ children }) {
  // "checking" (asking the server), "open" (show the app), "locked" (show the card)
  const [state, setState] = useState("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Asks the server whether this browser may use the app.
  const check = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setState(status.required && !status.signedIn ? "locked" : "open");
    } catch {
      // Server not reachable: open the app, which shows its own message.
      setState("open");
    }
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
      await signIn(code);
      setCode("");
      setState("open");
    } catch (err) {
      setError(err?.message || "Could not sign in. Try again.");
      inputRef.current?.select();
    } finally {
      setBusy(false);
    }
  }

  if (state === "open") return children;
  if (state === "checking") return <div className="access-gate" aria-busy="true" />;

  return (
    <main className="access-gate">
      <form className="access-card" onSubmit={submit}>
        <span className="access-logo" aria-hidden="true">
          <Sprout size={18} strokeWidth={2.4} />
        </span>
        <h1 className="access-title">Chernozem Atlas</h1>
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
      </form>
    </main>
  );
}
