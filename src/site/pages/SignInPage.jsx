// WHAT THIS FILE DOES
// The website's Sign in page (chernozem.app/signin): someone with an
// account comes back to Field or Atlas. It looks like the Register page:
// the form at the left, real pictures of the product at the right.
//
//   Google, or an e-mail and a password, through Firebase Authentication
//   (src/lib/firebase.js, downloaded only here, on the Register page and
//   on the owner's page).
//   When Firebase accepts, its signed token goes to our server (POST
//   /api/auth/firebase, src/api/accountApi.js), which sets the account
//   cookie. Then the page leaves the public demo (src/lib/demoMode.js
//   leaveDemo) and goes to /field or /atlas, whichever the account chose,
//   or to /register when registering was never finished
//   (src/lib/registration.js destinationFor). The owner (the Chernozem
//   Google account, which edits the demo) gets a button into each product.
//   "Forgot it?" beside the password sends Firebase's reset e-mail to the
//   address typed above it.
//
// Someone already signed in sees who they are, a button into their
// product and "Sign out". "Continue with Google" is the one strong button;
// "Sign in" (the e-mail way) is the light one. Firebase's error codes
// become plain words beside the right field (src/lib/registration.js); when
// Authentication is not switched on, the page says registration is not
// open yet.
//
// Every word a visitor reads goes through t() (src/site/i18n, namespace
// "signin"; the dictionaries are zh/signin.js and uk/signin.js, keyed by
// the English). The sentences of the checks and of Firebase stay English
// in src/lib/registration.js and in this page's state; each is said
// through t() where it is shown (useSaid below), so a change of language
// changes it too.
//
// WHO EDITS IT
// Whoever changes how people sign in. The fields and the pictures are the
// Register page's (RegisterPage.jsx); the look is in register.css.

// The site's base rules first, so ./register.css below wins every tie with them.
import "../site.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePageTitle } from "../hooks.js";
import { useT } from "../i18n/i18n.js";
import { SITE_ACTIONS } from "../content/site.js";
import { getStatus, logoutEverywhere, postFirebaseToken } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import { leaveDemo } from "../../lib/demoMode.js";
import { LIMITS, PRODUCTS, SIGN_IN_ENDED, destinationFor, emailProblem, firebaseProblem, isOwner, signInEnded } from "../../lib/registration.js";
import { AuthField, PasswordField, ShotSet } from "./RegisterPage.jsx";
import "./register.css";

// When a part of the page arrives (its entrance, register.css "Motion").
const rise = (ms) => ({ "--d": `${ms}ms` });

// The page's own sentences, kept in English like registration.js's and
// said through t() where they are shown (useSaid).
const LOADING = "The sign-in is still loading. Try again in a moment.";
const NOT_LOADED = "The sign-in could not be downloaded. Check your connection and reload the page.";
const NO_PASSWORD = "Enter your password.";
const EMAIL_FIRST = "Enter your e-mail first; the link goes there.";

// What the page can say beside a field or under a button, in the visitor's
// language. The checks, Firebase's codes and our server's answers become
// English sentences in src/lib/registration.js (emailProblem,
// firebaseProblem, SIGN_IN_ENDED) or above; the page keeps that English in
// its state and says it through this where it is shown. Every sentence the
// page can show is written out here once more as a plain t("...") key:
// the dictionaries are keyed by the sentence, and the language tests read
// this file, not registration.js. A sentence not listed stays English.
// The one with a limit in it carries the number as {n}, so one entry
// serves whatever the limit is; an unknown Firebase code
// ("Something went wrong (code). Try again.") keeps its code.
function useSaid() {
  const t = useT("signin");
  return useMemo(() => {
    const said = {
      [LOADING]: t("The sign-in is still loading. Try again in a moment."),
      [NOT_LOADED]: t("The sign-in could not be downloaded. Check your connection and reload the page."),
      [NO_PASSWORD]: t("Enter your password."),
      [EMAIL_FIRST]: t("Enter your e-mail first; the link goes there."),
      [SIGN_IN_ENDED]: t("That sign-in has ended. Sign in again with Google or your e-mail."),
      "Enter your e-mail address.": t("Enter your e-mail address."),
      "That e-mail address does not look right.": t("That e-mail address does not look right."),
      [`Keep the e-mail to ${LIMITS.email} characters or fewer.`]: t("Keep the e-mail to {n} characters or fewer.", { n: LIMITS.email }),
      "That e-mail and password do not match.": t("That e-mail and password do not match."),
      "That e-mail already has an account.": t("That e-mail already has an account."),
      "This account has been switched off. Write to us if that is a mistake.": t("This account has been switched off. Write to us if that is a mistake."),
      "Too many attempts. Wait a few minutes and try again.": t("Too many attempts. Wait a few minutes and try again."),
      "The Google window was closed before you signed in. Try again.": t("The Google window was closed before you signed in. Try again."),
      "The browser blocked the Google window. Allow pop-ups for this site and try again.": t("The browser blocked the Google window. Allow pop-ups for this site and try again."),
      "Could not reach Google to sign in. Check your connection and try again.": t("Could not reach Google to sign in. Check your connection and try again."),
      "Google sign-in is not switched on for this address yet. Use an e-mail and a password instead.": t("Google sign-in is not switched on for this address yet. Use an e-mail and a password instead."),
      "The sign-in could not be checked by our server. Try again.": t("The sign-in could not be checked by our server. Try again."),
      "Could not reach the server. Check your connection and try again.": t("Could not reach the server. Check your connection and try again."),
    };
    return (message) => {
      if (!message) return message;
      if (said[message]) return said[message];
      const unknown = /^Something went wrong(?: \((.+)\))?\. Try again\.$/.exec(message);
      if (!unknown) return message;
      return unknown[1] ? t("Something went wrong ({code}). Try again.", { code: unknown[1] }) : t("Something went wrong. Try again.");
    };
  }, [t]);
}

export default function SignInPage() {
  const t = useT("signin");
  const said = useSaid();
  usePageTitle(t("Sign in"));
  const navigate = useNavigate();

  // "wait" (asking the server), "form", "signed" (an account with a
  // finished profile), "unfinished" (an account without one), "owner",
  // "closed".
  const [stage, setStage] = useState("wait");
  const [account, setAccount] = useState(null);
  const [fb, setFb] = useState(null);
  const [fbUser, setFbUser] = useState(null);
  const [fbFailed, setFbFailed] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Messages beside the fields: google, known, email, password, form. In
  // English (registration.js's sentences); said in the visitor's language
  // where they are shown.
  const [errors, setErrors] = useState({});
  // The address the reset link went to; the sentence is said where shown.
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // After "Sign out" the keyboard goes to "Continue with Google", once the
  // page has drawn the form again.
  const [focusGoogle, setFocusGoogle] = useState(0);
  useEffect(() => {
    if (focusGoogle) document.getElementById("sgn-google")?.focus();
  }, [focusGoogle]);

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
      if (status?.account) setAccount(status.account);
      if (isOwner(status)) setStage("owner");
      else if (status?.account) setStage(status.account.profileComplete ? "signed" : "unfinished");
      else setStage("form");
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
  // account's product (or back to the Register page to finish). The owner
  // stays here with a button into each product.
  async function afterFirebase(user) {
    const idToken = await fb.getIdToken(user);
    const answer = await postFirebaseToken(idToken);
    // The server's own view of this browser now (the owner is told apart
    // here); the answer above is enough when it cannot be asked.
    let status = null;
    try {
      status = await getStatus();
    } catch {
      // Carry on with the sign-in's answer.
    }
    if (!alive.current) return;
    const account = status?.account || answer?.account || null;
    setAccount(account);
    if (isOwner(status) || account?.owner) {
      setStage("owner");
      return;
    }
    leaveDemo();
    navigate(destinationFor(account));
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
    setSentTo("");
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
    if (!password) problems.password = NO_PASSWORD;
    if (Object.keys(problems).length) {
      setErrors(problems);
      document.getElementById(problems.email ? "sgn-email" : "sgn-password")?.focus();
      return;
    }
    if (!needFirebase("form")) return;
    setBusy(true);
    setErrors({});
    setSentTo("");
    try {
      const credential = await fb.signInWithEmailAndPassword(fb.auth, email.trim(), password);
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error, "email");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // Firebase in this browser still knows the person. When that sign-in has
  // ended (they signed out, which ends every sign-in of the account), the
  // browser forgets it too and the form is left.
  async function continueAs() {
    if (busy || !fbUser || !fb) return;
    setBusy(true);
    setErrors({});
    try {
      await afterFirebase(fbUser);
    } catch (error) {
      if (!alive.current) return;
      if (signInEnded(error)) {
        try {
          await fb.signOut(fb.auth);
        } catch {
          // Already out.
        }
        if (alive.current) setErrors({ known: SIGN_IN_ENDED });
      } else {
        showProblem(error, "known");
      }
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
      setErrors({ email: emailWrong === "Enter your e-mail address." ? EMAIL_FIRST : emailWrong });
      setSentTo("");
      document.getElementById("sgn-email")?.focus();
      return;
    }
    if (!needFirebase("form")) return;
    setBusy(true);
    setErrors({});
    const address = email.trim();
    try {
      await fb.sendPasswordResetEmail(fb.auth, address);
      if (alive.current) setSentTo(address);
    } catch (error) {
      if (!alive.current) return;
      if (error?.code === "auth/user-not-found") setSentTo(address);
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
    setSentTo("");
    setPassword("");
    setBusy(false);
    setStage("form");
    setFocusGoogle((count) => count + 1);
  }

  const product = PRODUCTS[account?.product] ? account.product : "field";

  return (
    <div className="reg sgn">
      <section className="reg-stage" aria-labelledby="sgn-title">
        <div className="reg-main">
          <h1 id="sgn-title" className="reg-title">
            <span className="reg-line">
              <span className="reg-line-in">{t("Sign in")}</span>
            </span>
          </h1>
          <p className="reg-lead" data-arrive style={rise(120)}>
            {t("Your fields or your region, as you left them.")}
          </p>

          {stage === "wait" && <div className="reg-wait" aria-busy="true" />}

          {stage === "closed" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <h2 className="reg-panel-title">{t("Registration is not open yet.")}</h2>
              <p>{t("Try the demo, or write to us.")}</p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={SITE_ACTIONS.demo.path}>
                  {t("Try the demo")}
                </Link>
                <Link to="/contact">{t("Write to us")}</Link>
              </div>
            </div>
          )}

          {stage === "signed" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <p>{t("Signed in as {email}.", { email: <strong>{account.email}</strong> })}</p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={PRODUCTS[product].path} onClick={leaveDemo}>
                  {t("Open {product}", { product: PRODUCTS[product].name })}
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  {t("Sign out")}
                </button>
              </div>
            </div>
          )}

          {stage === "owner" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <p>{t("Signed in as {email}, the owner.", { email: <strong>{account?.email || t("the owner")}</strong> })}</p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={PRODUCTS.field.path} onClick={leaveDemo}>
                  {t("Open Field")}
                </Link>
                <Link className="reg-btn reg-btn-second" to={PRODUCTS.atlas.path} onClick={leaveDemo}>
                  {t("Open Atlas")}
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  {t("Sign out")}
                </button>
              </div>
            </div>
          )}

          {stage === "unfinished" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <p>{t("Signed in as {email}. Registering is not finished yet.", { email: <strong>{account.email}</strong> })}</p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={destinationFor(account)}>
                  {t("Finish registering")}
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  {t("Sign out")}
                </button>
              </div>
            </div>
          )}

          {stage === "form" && (
            <form className="reg-form" onSubmit={signIn} noValidate aria-label={t("Sign in")}>
              {fbUser && !busy && (
                <div className="reg-known">
                  <p>{t("This browser is signed in as {email}.", { email: <strong>{fbUser.email}</strong> })}</p>
                  <div className="reg-actions">
                    <button type="button" className="reg-btn reg-btn-second" onClick={continueAs}>
                      {t("Continue as {email}", { email: fbUser.email })}
                    </button>
                    <button type="button" className="reg-textbtn" onClick={signOutAll}>
                      {t("Not you? Sign out")}
                    </button>
                  </div>
                </div>
              )}
              {errors.known && (
                <p className="reg-error" role="alert">
                  {said(errors.known)}
                </p>
              )}
              <button id="sgn-google" type="button" className="reg-btn reg-btn-primary reg-btn-wide" onClick={continueWithGoogle} disabled={busy} data-arrive style={rise(200)}>
                {t("Continue with Google")}
              </button>
              {errors.google && (
                <p className="reg-error" role="alert">
                  {said(errors.google)}
                </p>
              )}
              <p className="reg-or" aria-hidden="true" data-arrive style={rise(240)}>
                {t("or")}
              </p>
              <AuthField
                id="sgn-email"
                label={t("E-mail")}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={LIMITS.email}
                value={email}
                onChange={edit(setEmail, "email")}
                error={said(errors.email)}
                delay={280}
              />
              <PasswordField
                id="sgn-password"
                autoComplete="current-password"
                value={password}
                onChange={edit(setPassword, "password")}
                error={said(errors.password)}
                delay={320}
                after={
                  <button type="button" className="reg-textbtn reg-forgot" onClick={forgot} disabled={busy}>
                    {t("Forgot it?")}
                  </button>
                }
              />
              {sentTo && (
                <p className="reg-note" role="alert">
                  {t("If {email} has an account, a link to choose a new password is on its way.", { email: sentTo })}
                </p>
              )}
              {errors.form && (
                <p className="reg-error" role="alert">
                  {said(errors.form)}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-second reg-btn-wide" disabled={busy} data-arrive style={rise(360)}>
                {busy ? t("Signing in…") : t("Sign in")}
              </button>
              <p className="reg-aside" data-arrive style={rise(400)}>
                {t("New here? {register}", { register: <Link to={SITE_ACTIONS.register.path}>{t("Register")}</Link> })}
              </p>
            </form>
          )}
        </div>

        <ShotSet set="signin" />
      </section>
    </div>
  );
}
