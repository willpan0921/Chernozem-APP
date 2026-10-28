// WHAT THIS FILE DOES
// The website's Sign in page (chernozem.app/signin): someone with an
// account comes back to Field or Atlas.
//
//   Google, or an e-mail and a password, through Firebase Authentication
//   (src/lib/firebase.js, downloaded only here and on the Register page).
//   When Firebase accepts, its signed token goes to our server (POST
//   /api/auth/firebase, src/api/accountApi.js), which sets the account
//   cookie. Then the page goes to /field or /atlas, whichever the account
//   chose, or to /register when the "About you" part was never finished.
//   "Forgot it?" beside the password sends Firebase's reset e-mail to the
//   address typed above it.
//
// Someone already signed in sees who they are, a button into their
// product and "Sign out". Firebase's error codes become plain words
// (src/lib/registration.js); when Authentication is not switched on, the
// page says registration is not open yet.
//
// WHO EDITS IT
// Whoever changes how people sign in. The look is in register.css, shared
// with the Register page.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Reveal } from "../components/motion.jsx";
import { usePageTitle } from "../hooks.js";
import { SITE_ACTIONS } from "../content/site.js";
import { getAuthStatus } from "../../api/atlasApi.js";
import { logoutEverywhere, postFirebaseToken } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import { LIMITS, emailProblem, firebaseProblem, passwordProblem } from "../../lib/registration.js";
import "./register.css";

// Real pictures of the product, from public/site/shots (manifest.json).
const SHOTS = {
  hero: { src: "/site/shots/field-overview.webp", alt: "Field's overview: the demo farm's twelve fields, their counts, the weather and the map", caption: "Field's overview, where a farmer lands after signing in." },
  back: [
    { src: "/site/shots/field-data-960.webp", alt: "Field's data page: every clear pass since March in a table", caption: "Every clear pass since you left, in a table you can download.", wide: true },
    { src: "/site/shots/field-ai-960.webp", alt: "Field's assistant, with suggested questions", caption: "Ask what changed; the answer names the field and the pass." },
    { src: "/site/shots/atlas-map-near-macro-960.webp", alt: "Atlas: Ukraine's oblasts ranked for the near term", caption: "Atlas: the region, ranked, as you set the weights." },
  ],
};

const productName = (product) => (product === "atlas" ? "Atlas" : "Field");
const productPath = (product) => (product === "atlas" ? "/atlas" : "/field");

function Field({ id, label, hint, error, after, ...input }) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`reg-field${error ? " is-wrong" : ""}`}>
      <div className="reg-field-head">
        <label htmlFor={id}>{label}</label>
        {after}
        {hint && (
          <span id={`${id}-hint`} className="reg-hint">
            {hint}
          </span>
        )}
      </div>
      <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...input} />
      {error && (
        <span id={`${id}-error`} className="reg-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

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
        status = await getAuthStatus();
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
        if (!cancelled) setFbFailed("The sign-in code could not be downloaded. Check your connection and reload the page.");
      });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Where to go once our server has set the cookie.
  function goOn(made) {
    if (made?.profileComplete && made.product) navigate(productPath(made.product));
    else navigate(SITE_ACTIONS.register.path);
  }

  async function afterFirebase(user) {
    const idToken = await fb.getIdToken(user);
    const answer = await postFirebaseToken(idToken);
    if (!alive.current) return;
    setAccount(answer?.account || null);
    goOn(answer?.account);
  }

  function showProblem(error) {
    const problem = firebaseProblem(error);
    if (problem.field === "closed") {
      setStage("closed");
      return;
    }
    setErrors({ [problem.field]: problem.message });
  }

  function needFirebase() {
    if (fb) return true;
    setErrors({ form: fbFailed || "The sign-in code is still loading. Try again in a moment." });
    return false;
  }

  async function continueWithGoogle() {
    if (busy || !needFirebase()) return;
    setBusy(true);
    setErrors({});
    setNote("");
    try {
      const credential = await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider());
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error);
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
    if (!needFirebase()) return;
    setBusy(true);
    setErrors({});
    setNote("");
    try {
      const credential = await fb.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function continueAs() {
    if (busy || !fbUser) return;
    setBusy(true);
    setErrors({});
    try {
      await afterFirebase(fbUser);
    } catch (error) {
      if (alive.current) showProblem(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // The reset e-mail goes to the address typed above the password.
  async function forgot() {
    if (busy) return;
    const emailWrong = emailProblem(email);
    if (emailWrong) {
      setErrors({ email: emailWrong === "Enter your e-mail address." ? "Enter your e-mail address first; the reset link goes there." : emailWrong });
      document.getElementById("sgn-email")?.focus();
      return;
    }
    if (!needFirebase()) return;
    setBusy(true);
    setErrors({});
    try {
      await fb.sendPasswordResetEmail(fb.auth, email.trim());
      if (alive.current) setNote(`If ${email.trim()} has an account, a link to choose a new password is on its way.`);
    } catch (error) {
      if (!alive.current) return;
      // An unknown address gets the same sentence: the page does not say
      // who has an account.
      if (error?.code === "auth/user-not-found") setNote(`If ${email.trim()} has an account, a link to choose a new password is on its way.`);
      else showProblem(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function signOutAll() {
    setBusy(true);
    try {
      await logoutEverywhere();
    } catch {
      // Already out, or no server.
    }
    try {
      if (fb) await fb.signOut(fb.auth);
    } catch {
      // Nothing to sign out of.
    }
    if (!alive.current) return;
    setAccount(null);
    setFbUser(null);
    setErrors({});
    setNote("");
    setBusy(false);
    setStage("form");
  }

  const product = account?.product || null;

  return (
    <div className="reg sgn">
      <section className="reg-hero" aria-labelledby="sgn-title">
        <div className="reg-hero-text">
          <h1 id="sgn-title" className="reg-title">
            <span className="reg-line">
              <span className="reg-line-in">Sign in</span>
            </span>
          </h1>
          <p className="reg-lead" data-rise style={{ "--d": "420ms" }}>
            Your fields or your region, as you left them.
          </p>

          {stage === "wait" && <div className="reg-wait" aria-busy="true" />}

          {stage === "closed" && (
            <div className="reg-form" data-rise style={{ "--d": "520ms" }}>
              <p className="reg-aside">
                <strong>Registration is not open yet.</strong> Try the demo, or write to us.
              </p>
              <p className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to="/demo">
                  Try the demo
                </Link>
                <Link to="/contact">Write to us</Link>
              </p>
            </div>
          )}

          {stage === "signed" && (
            <div className="reg-form" data-rise style={{ "--d": "520ms" }}>
              <p className="reg-aside">
                You are signed in as <strong>{account.email}</strong>.
              </p>
              <p className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={productPath(product)}>
                  Open {productName(product)}
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  Sign out
                </button>
              </p>
            </div>
          )}

          {stage === "unfinished" && (
            <div className="reg-form" data-rise style={{ "--d": "520ms" }}>
              <p className="reg-aside">
                You are signed in as <strong>{account.email}</strong>, but your registration is not finished.
              </p>
              <p className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={SITE_ACTIONS.register.path}>
                  Finish registering
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  Sign out
                </button>
              </p>
            </div>
          )}

          {stage === "form" && (
            <form className="reg-form" onSubmit={signIn} noValidate data-rise style={{ "--d": "520ms" }}>
              {fbUser && (
                <div className="reg-known">
                  <p>
                    This browser is already signed in as <strong>{fbUser.email}</strong>.
                  </p>
                  <div className="reg-actions">
                    <button type="button" className="reg-btn reg-btn-primary" onClick={continueAs} disabled={busy}>
                      Continue as {fbUser.email}
                    </button>
                    <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                      Not you? Sign out
                    </button>
                  </div>
                </div>
              )}
              <button type="button" className="reg-btn reg-btn-second reg-btn-wide" onClick={continueWithGoogle} disabled={busy}>
                Continue with Google
              </button>
              <p className="reg-or" aria-hidden="true">
                or
              </p>
              <Field id="sgn-email" label="E-mail" type="email" name="email" autoComplete="email" inputMode="email" spellCheck={false} maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
              <Field
                id="sgn-password"
                label="Password"
                type="password"
                name="password"
                autoComplete="current-password"
                maxLength={LIMITS.password.max}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                after={
                  <button type="button" className="reg-textbtn" onClick={forgot} disabled={busy}>
                    Forgot it?
                  </button>
                }
              />
              {note && (
                <p className="reg-note" aria-live="polite">
                  {note}
                </p>
              )}
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <p className="reg-aside">
                New here? <Link to={SITE_ACTIONS.register.path}>Register.</Link>
              </p>
            </form>
          )}
        </div>
        <figure className="reg-hero-pic" data-rise style={{ "--d": "560ms" }}>
          <img src={SHOTS.hero.src} alt={SHOTS.hero.alt} width="1920" height="1200" fetchPriority="high" />
          <figcaption>{SHOTS.hero.caption}</figcaption>
        </figure>
      </section>

      <section className="reg-part" aria-labelledby="sgn-back">
        <Reveal className="reg-part-text">
          <h2 id="sgn-back">What you come back to</h2>
          <p>Every clear pass since you left has been read. Open a field, ask the assistant what changed, or export the report.</p>
        </Reveal>
        <div className="sgn-pics">
          {SHOTS.back.map((shot, index) => (
            <Reveal key={shot.src} as="figure" className={`sgn-pic${shot.wide ? " is-wide" : ""}`} delay={0.08 * index}>
              <img src={shot.src} alt={shot.alt} width="960" height="600" loading="lazy" />
              <figcaption>{shot.caption}</figcaption>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
