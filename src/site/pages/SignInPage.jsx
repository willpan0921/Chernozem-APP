// WHAT THIS FILE DOES
// The website's Sign in page (chernozem.app/signin): someone with an
// account comes back to Field or Atlas. It looks like the Register page:
// the form at the left, real pictures of the product at the right.
//
//   Google, or an e-mail and a password, through Firebase Authentication
//   (src/lib/firebase.js, downloaded only here and on the Register page).
//   When Firebase accepts, its signed token goes to our server (POST
//   /api/auth/firebase, src/api/accountApi.js), which sets the account
//   cookie. Then the page leaves the public demo (src/lib/demoMode.js
//   leaveDemo) and goes to /field or /atlas, whichever the account chose,
//   or to /register when "About you" was never finished
//   (src/lib/registration.js destinationFor).
//   "Forgot it?" beside the password sends Firebase's reset e-mail to the
//   address typed above it.
//
// Someone already signed in sees who they are, a button into their
// product and "Sign out". Firebase's error codes become plain words beside
// the right field (src/lib/registration.js); when Authentication is not
// switched on, the page says registration is not open yet.
//
// WHO EDITS IT
// Whoever changes how people sign in. The fields and the pictures are the
// Register page's (RegisterPage.jsx); the look is in register.css.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePageTitle } from "../hooks.js";
import { SITE_ACTIONS } from "../content/site.js";
import { getStatus, logoutEverywhere, postFirebaseToken } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import { leaveDemo } from "../../lib/demoMode.js";
import { LIMITS, PRODUCTS, destinationFor, emailProblem, firebaseProblem } from "../../lib/registration.js";
import { AuthField, PasswordField, ShotSet } from "./RegisterPage.jsx";
import "./register.css";

// When a part of the page arrives (its entrance, register.css "Motion").
const rise = (ms) => ({ "--d": `${ms}ms` });

const LOADING = "The sign-in is still loading. Try again in a moment.";
const NOT_LOADED = "The sign-in could not be downloaded. Check your connection and reload the page.";

export default function SignInPage() {
  usePageTitle("Sign in");
  const navigate = useNavigate();

  // "wait" (asking the server), "form", "signed" (an account with a
  // finished profile), "unfinished" (an account without one), "closed".
  const [stage, setStage] = useState("wait");
  const [account, setAccount] = useState(null);
  const [fb, setFb] = useState(null);
  const [fbUser, setFbUser] = useState(null);
  const [fbFailed, setFbFailed] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Messages beside the fields: google, known, email, password, form.
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let status = null;
      try {
        status = await getStatus();
      } catch {
        // No answer: show the form; errors come when it is sent.
      }
      if (cancelled) return;
      if (status?.account) {
        setAccount(status.account);
        setStage(status.account.profileComplete ? "signed" : "unfinished");
      } else {
        setStage("form");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;
    loadFirebaseAuth()
      .then((module) => {
        if (cancelled) return;
        setFb(module);
        unsubscribe = module.onAuthStateChanged(module.auth, (user) => {
          if (!cancelled) setFbUser(user || null);
        });
      })
      .catch(() => {
        if (!cancelled) setFbFailed(NOT_LOADED);
      });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Typing in a field takes its message away.
  function edit(setter, key) {
    return (event) => {
      setter(event.target.value);
      setErrors((value) => (value[key] ? { ...value, [key]: undefined } : value));
    };
  }

  // Once our server has set the cookie: out of the public demo, into the
  // account's product (or back to the Register page to finish).
  async function afterFirebase(user) {
    const idToken = await fb.getIdToken(user);
    const answer = await postFirebaseToken(idToken);
    if (!alive.current) return;
    setAccount(answer?.account || null);
    leaveDemo();
    navigate(destinationFor(answer?.account));
  }

  // where: "google", "known" (Continue as) or "email" (the form).
  function showProblem(error, where) {
    const problem = firebaseProblem(error);
    if (problem.field === "closed") {
      setStage("closed");
      return;
    }
    setErrors({ [where === "email" ? problem.field : where]: problem.message });
  }

  function needFirebase(spot) {
    if (fb) return true;
    setErrors({ [spot]: fbFailed || LOADING });
    return false;
  }

  async function continueWithGoogle() {
    if (busy || !needFirebase("google")) return;
    setBusy(true);
    setErrors({});
    setNote("");
    try {
      const credential = await fb.signInWithPopup(fb.auth, fb.googleProvider());
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error, "google");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (busy) return;
    const problems = {};
    const emailWrong = emailProblem(email);
    if (emailWrong) problems.email = emailWrong;
    if (!password) problems.password = "Enter your password.";
    if (Object.keys(problems).length) {
      setErrors(problems);
      document.getElementById(problems.email ? "sgn-email" : "sgn-password")?.focus();
      return;
    }
    if (!needFirebase("form")) return;
    setBusy(true);
    setErrors({});
    setNote("");
    try {
      const credential = await fb.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error, "email");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function continueAs() {
    if (busy || !fbUser || !fb) return;
    setBusy(true);
    setErrors({});
    try {
      await afterFirebase(fbUser);
    } catch (error) {
      if (alive.current) showProblem(error, "known");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // The reset e-mail goes to the address typed above the password. The
  // same sentence whether or not the address has an account: the page
  // never says who has one.
  async function forgot() {
    if (busy) return;
    const emailWrong = emailProblem(email);
    if (emailWrong) {
      setErrors({ email: emailWrong === "Enter your e-mail address." ? "Enter your e-mail first; the link goes there." : emailWrong });
      setNote("");
      document.getElementById("sgn-email")?.focus();
      return;
    }
    if (!needFirebase("form")) return;
    setBusy(true);
    setErrors({});
    const sent = `If ${email.trim()} has an account, a link to choose a new password is on its way.`;
    try {
      await fb.sendPasswordResetEmail(fb.auth, email.trim());
      if (alive.current) setNote(sent);
    } catch (error) {
      if (!alive.current) return;
      if (error?.code === "auth/user-not-found") setNote(sent);
      else showProblem(error, "email");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function signOutAll() {
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
    setAccount(null);
    setFbUser(null);
    setErrors({});
    setNote("");
    setPassword("");
    setBusy(false);
    setStage("form");
  }

  const product = PRODUCTS[account?.product] ? account.product : "field";

  return (
    <div className="reg sgn">
      <section className="reg-stage" aria-labelledby="sgn-title">
        <div className="reg-main">
          <h1 id="sgn-title" className="reg-title">
            <span className="reg-line">
              <span className="reg-line-in">Sign in</span>
            </span>
          </h1>
          <p className="reg-lead" data-arrive style={rise(120)}>
            Your fields or your region, as you left them.
          </p>

          {stage === "wait" && <div className="reg-wait" aria-busy="true" />}

          {stage === "closed" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <h2 className="reg-panel-title">Registration is not open yet.</h2>
              <p>Try the demo, or write to us.</p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={SITE_ACTIONS.demo.path}>
                  Try the demo
                </Link>
                <Link to="/contact">Write to us</Link>
              </div>
            </div>
          )}

          {stage === "signed" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <p>
                Signed in as <strong>{account.email}</strong>.
              </p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={PRODUCTS[product].path} onClick={leaveDemo}>
                  Open {PRODUCTS[product].name}
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {stage === "unfinished" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <p>
                Signed in as <strong>{account.email}</strong>. About you is not finished yet.
              </p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={destinationFor(account)}>
                  Finish registering
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {stage === "form" && (
            <form className="reg-form" onSubmit={signIn} noValidate aria-label="Sign in">
              {fbUser && !busy && (
                <div className="reg-known">
                  <p>
                    This browser is signed in as <strong>{fbUser.email}</strong>.
                  </p>
                  <div className="reg-actions">
                    <button type="button" className="reg-btn reg-btn-second" onClick={continueAs}>
                      Continue as {fbUser.email}
                    </button>
                    <button type="button" className="reg-textbtn" onClick={signOutAll}>
                      Not you? Sign out
                    </button>
                  </div>
                  {errors.known && (
                    <p className="reg-error" role="alert">
                      {errors.known}
                    </p>
                  )}
                </div>
              )}
              <button type="button" className="reg-btn reg-btn-primary reg-btn-wide" onClick={continueWithGoogle} disabled={busy} data-arrive style={rise(200)}>
                Continue with Google
              </button>
              {errors.google && (
                <p className="reg-error" role="alert">
                  {errors.google}
                </p>
              )}
              <p className="reg-or" aria-hidden="true" data-arrive style={rise(240)}>
                or
              </p>
              <AuthField
                id="sgn-email"
                label="E-mail"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={LIMITS.email}
                value={email}
                onChange={edit(setEmail, "email")}
                error={errors.email}
                delay={280}
              />
              <PasswordField
                id="sgn-password"
                autoComplete="current-password"
                value={password}
                onChange={edit(setPassword, "password")}
                error={errors.password}
                delay={320}
                after={
                  <button type="button" className="reg-textbtn reg-forgot" onClick={forgot} disabled={busy}>
                    Forgot it?
                  </button>
                }
              />
              {note && (
                <p className="reg-note" role="alert">
                  {note}
                </p>
              )}
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-second reg-btn-wide" disabled={busy} data-arrive style={rise(360)}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <p className="reg-aside" data-arrive style={rise(400)}>
                New here? <Link to={SITE_ACTIONS.register.path}>Register</Link>
              </p>
            </form>
          )}
        </div>

        <ShotSet set="signin" />
      </section>
    </div>
  );
}
