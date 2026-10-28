// WHAT THIS FILE DOES
// The website's Register page (chernozem.app/register): a person makes an
// account in three parts on one page and gets Field or Atlas.
//
//   Part one   Who are you? Two big choices (radio buttons): a farmer or
//              landowner gets Field, an organisation gets Atlas.
//              ?product=field or ?product=atlas in the address chooses
//              one in advance (the website's buttons add it).
//   Part two   Your account: Google, or an e-mail and a password, through
//              Firebase Authentication (src/lib/firebase.js, downloaded
//              only on this page and the Sign in page). The e-mail and
//              passwords are checked here first, in plain words beside
//              the field; Firebase's own answers are turned into plain
//              words too (src/lib/registration.js). When Firebase accepts,
//              its signed token goes to our server (POST
//              /api/auth/firebase, src/api/accountApi.js), which sets the
//              account cookie.
//   Part three About you: name, age, organisation (needed for Atlas),
//              country, town, and the place to watch (a search through
//              GET /api/geocode, or typed coordinates). Saved with PUT
//              /api/account. Then "Your account is ready" and a button
//              into Field or Atlas, which open with an empty workspace.
//
// Someone who comes back signed in lands on the part that is next for
// them (src/lib/registration.js nextStep). When Firebase Authentication is
// not switched on, or our server cannot check tokens, the page says
// "Registration is not open yet" with the demo and the contact page.
//
// WHO EDITS IT
// Whoever changes how people register. The words of the checks live in
// src/lib/registration.js; the look in register.css.

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Reveal, Stagger, StaggerItem } from "../components/motion.jsx";
import { usePageTitle } from "../hooks.js";
import { SITE_ACTIONS } from "../content/site.js";
import { getAuthStatus } from "../../api/atlasApi.js";
import { getAccount, logoutEverywhere, postFirebaseToken, putAccount, searchPlace } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import {
  KINDS,
  LIMITS,
  ROLES,
  emailProblem,
  firebaseProblem,
  nextStep,
  parsePlace,
  passwordProblem,
  placeFromResult,
  placeOffer,
  productForRole,
  profileForServer,
  roleForProduct,
  validateProfile,
} from "../../lib/registration.js";
import "./register.css";

// Real pictures of the product, from public/site/shots (manifest.json).
const SHOTS = {
  hero: {
    src: "/site/shots/field-fields.webp",
    alt: "Field: the fields map of the demo farm, Field 11 selected, with its plant-health curve against the normal years",
    caption: "Field after a pass: Field 11, rapeseed, read against the normal years 2019 to 2021.",
  },
  farmer: "/site/shots/field-fields-detail-960.webp",
  organisation: "/site/shots/atlas-map-near-macro-960.webp",
  phone: { src: "/site/shots/phone-field-fields.webp", alt: "Field on a phone: the fields map", caption: "The same account on a phone." },
  field: { src: "/site/shots/field-overview-960.webp", alt: "Field's overview: the farm's fields, counts and the weather", caption: "What Field shows once your fields are drawn." },
  atlas: { src: "/site/shots/atlas-overview-960.webp", alt: "Atlas's overview of Ukraine: cropland, black soil, heavy damage and the priority map", caption: "What Atlas shows once an area has run." },
  demo: { src: "/site/shots/atlas-map-near-micro-960.webp", alt: "The demo: Ukraine's squares ranked for the near term", caption: "The demo is Ukraine, September 2026, behind an access code." },
};

const PRIVACY = "We keep your name, e-mail and the place you gave us on our own server. Google keeps the password. Nothing is sold or shared.";

const productName = (product) => (product === "atlas" ? "Atlas" : "Field");
const productPath = (product) => (product === "atlas" ? "/atlas" : "/field");

// One labelled input with its limit beside the label and its error under
// it, both tied to the input for screen readers (aria-describedby). Inside
// a <Stagger> the fields arrive one after another.
function Field({ id, label, hint, error, optional, ...input }) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <StaggerItem className={`reg-field${error ? " is-wrong" : ""}`}>
      <div className="reg-field-head">
        <label htmlFor={id}>
          {label}
          {optional && <span className="reg-opt"> (optional)</span>}
        </label>
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
    </StaggerItem>
  );
}

const EMPTY_PROFILE = { name: "", age: "", organization: "", country: "", address: "", placeText: "" };

export default function RegisterPage() {
  usePageTitle("Register");
  const [params] = useSearchParams();

  // Which part is on screen: "wait" (asking the server who this is),
  // "account" (parts one and two), "profile" (part three), "done", or
  // "closed" (registration is not open).
  const [stage, setStage] = useState("wait");
  const [role, setRole] = useState(() => roleForProduct(params.get("product")) || "");
  // The exact role the server keeps (farmer, landowner, government, ngo,
  // research, other), asked in part three.
  const [kind, setKind] = useState("");
  const [account, setAccount] = useState(null);

  // Firebase: the module once downloaded, and the person it knows.
  const [fb, setFb] = useState(null);
  const [fbUser, setFbUser] = useState(null);
  const [fbFailed, setFbFailed] = useState("");

  // Part two.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);

  // Part three.
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [place, setPlace] = useState(null); // { lat, lng, label } once chosen
  const [offer, setOffer] = useState(null); // the first search result, to accept
  const [placeNote, setPlaceNote] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeSearchHidden, setPlaceSearchHidden] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const product = account?.product || productForRole(role) || null;
  // "A farmer or landowner" is a farmer unless they say otherwise; an
  // organisation must say what kind it is.
  const kindForSave = kind || (product === "field" ? "farmer" : "");

  // Fill part three from what the server already has for this account.
  const prefillProfile = useCallback(async (fromAccount) => {
    let saved = null;
    try {
      saved = (await getAccount())?.profile || null;
    } catch {
      // A fresh account has nothing saved yet; the form starts empty.
    }
    if (!alive.current) return;
    setProfile({
      name: saved?.name || fromAccount?.name || "",
      age: saved?.age ? String(saved.age) : "",
      organization: saved?.organization || "",
      country: saved?.country || "",
      address: saved?.address || "",
      placeText: saved?.place?.label || "",
    });
    if (saved?.place) setPlace(placeFromResult(saved.place));
    const savedProduct = productForRole(saved?.role);
    if (savedProduct) {
      setKind(saved.role);
      setRole(roleForProduct(savedProduct) || "");
    }
  }, []);

  // Ask the server who this browser is, and download Firebase meanwhile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let status = null;
      try {
        status = await getAuthStatus();
      } catch {
        // No server answer: start from the beginning; errors show on submit.
      }
      if (cancelled) return;
      const step = nextStep(status, null);
      if (status?.account) {
        setAccount(status.account);
        if (status.account.product) setRole(roleForProduct(status.account.product) || "");
      }
      if (step === "profile") await prefillProfile(status.account);
      if (cancelled) return;
      setStage(step === "done" ? "done" : step === "profile" ? "profile" : "account");
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillProfile]);

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

  // The role must be chosen before an account is made.
  function requireRole() {
    if (ROLES[role]) return true;
    setErrors((value) => ({ ...value, role: "Choose who you are." }));
    document.getElementById("reg-role-farmer")?.focus();
    return false;
  }

  // Firebase accepted the person: hand the token to our server, then on
  // to part three (or straight to "done" for someone who finished before).
  async function afterFirebase(user) {
    const idToken = await fb.getIdToken(user);
    const answer = await postFirebaseToken(idToken);
    if (!alive.current) return;
    const made = answer?.account || null;
    setAccount(made);
    if (made?.product) setRole(roleForProduct(made.product) || role);
    if (made?.profileComplete) {
      setStage("done");
      return;
    }
    await prefillProfile({ ...made, name: user.displayName || made?.name || "" });
    if (alive.current) setStage("profile");
  }

  function showProblem(error) {
    const problem = firebaseProblem(error);
    if (problem.field === "closed") {
      setStage("closed");
      return;
    }
    setEmailTaken(error?.code === "auth/email-already-in-use" || error?.code === "auth/account-exists-with-different-credential");
    setErrors({ [problem.field]: problem.message });
  }

  async function continueWithGoogle() {
    if (busy || !requireRole()) return;
    if (!fb) {
      setErrors({ form: fbFailed || "The sign-in code is still loading. Try again in a moment." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const credential = await fb.signInWithPopup(fb.auth, new fb.GoogleAuthProvider());
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    if (busy) return;
    const problems = {};
    if (!ROLES[role]) problems.role = "Choose who you are.";
    const emailWrong = emailProblem(email);
    if (emailWrong) problems.email = emailWrong;
    const passwordWrong = passwordProblem(password, repeat);
    if (passwordWrong) problems[passwordWrong === "Repeat the password." || passwordWrong === "The passwords do not match." ? "repeat" : "password"] = passwordWrong;
    setEmailTaken(false);
    if (Object.keys(problems).length) {
      setErrors(problems);
      const first = problems.role ? "reg-role-farmer" : problems.email ? "reg-email" : problems.password ? "reg-password" : "reg-repeat";
      document.getElementById(first)?.focus();
      return;
    }
    if (!fb) {
      setErrors({ form: fbFailed || "The sign-in code is still loading. Try again in a moment." });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const credential = await fb.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // Firebase already knows this person (they signed in before in this
  // browser): one press carries on from there.
  async function continueAs() {
    if (busy || !fbUser || !requireRole()) return;
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

  // Signs out of our server and of Firebase, back to the beginning.
  async function signOutAll() {
    setBusy(true);
    try {
      await logoutEverywhere();
    } catch {
      // Already out, or no server: the browser forgets the person anyway.
    }
    try {
      if (fb) await fb.signOut(fb.auth);
    } catch {
      // Nothing to sign out of.
    }
    if (!alive.current) return;
    setAccount(null);
    setFbUser(null);
    setKind("");
    setProfile(EMPTY_PROFILE);
    setPlace(null);
    setOffer(null);
    setErrors({});
    setBusy(false);
    setStage("account");
  }

  const setField = (key) => (event) => {
    const value = event.target.value;
    setProfile((current) => ({ ...current, [key]: value }));
    if (key === "placeText") {
      setOffer(null);
      setPlace(null);
      setPlaceNote("");
    }
  };

  // The place to watch: typed coordinates are read here; a name goes to
  // the server's place search. The search needs the account cookie; a 401
  // hides the button and keeps the text as it is.
  async function findPlace() {
    const textTyped = profile.placeText.trim();
    if (!textTyped) {
      setPlaceNote("Type a village, a farm or coordinates first.");
      return;
    }
    const typed = parsePlace(textTyped);
    if (typed) {
      setPlace(typed);
      setOffer(null);
      setPlaceNote(`Watching ${typed.label}.`);
      return;
    }
    setPlaceBusy(true);
    setPlaceNote("");
    setOffer(null);
    try {
      const { results } = await searchPlace(textTyped);
      if (!alive.current) return;
      const first = Array.isArray(results) ? results.find((r) => placeFromResult(r)) : null;
      if (first) setOffer(first);
      else setPlaceNote(`Nothing found for “${textTyped}”. Try the nearest town, or coordinates.`);
    } catch (error) {
      if (!alive.current) return;
      if (error?.status === 401) {
        setPlaceSearchHidden(true);
        setPlaceNote("The place search is not available right now. The text you typed is kept.");
      } else {
        setPlaceNote(error?.message || "The place search did not answer. Try again, or type coordinates.");
      }
    } finally {
      if (alive.current) setPlaceBusy(false);
    }
  }

  function usePlace() {
    const chosen = placeFromResult(offer);
    if (!chosen) return;
    setPlace(chosen);
    setOffer(null);
    setProfile((current) => ({ ...current, placeText: chosen.label }));
    setPlaceNote(`Watching ${chosen.label} (${chosen.lat.toFixed(2)}, ${chosen.lng.toFixed(2)}).`);
  }

  async function finish(event) {
    event.preventDefault();
    if (busy) return;
    const fields = { ...profile, role: kindForSave, product, email: account?.email || fbUser?.email || "", place };
    const check = validateProfile(fields);
    if (!check.ok) {
      setErrors(check.problems);
      const first = Object.keys(check.problems)[0];
      const target = first === "role" ? "reg-role-farmer" : first === "kind" ? `reg-kind-${KINDS[product || "field"][0].role}` : `reg-${first}`;
      document.getElementById(target)?.focus();
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const answer = await putAccount(profileForServer(fields));
      if (!alive.current) return;
      if (answer?.account) setAccount(answer.account);
      setStage("done");
    } catch (error) {
      if (!alive.current) return;
      if (error?.status === 401) {
        setAccount(null);
        setStage("account");
        setErrors({ form: "Your sign-in ran out. Sign in again to finish." });
      } else if (error?.status === 503) {
        setStage("closed");
      } else {
        setErrors({ form: error?.message || "Could not save. Try again." });
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const signedInAs = account?.email || fbUser?.email || "";
  const shown = SHOTS[product === "atlas" ? "atlas" : "field"];

  return (
    <div className="reg">
      <section className="reg-hero" aria-labelledby="reg-title">
        <div className="reg-hero-text">
          <h1 id="reg-title" className="reg-title">
            <span className="reg-line">
              <span className="reg-line-in">Register</span>
            </span>
          </h1>
          <p className="reg-lead" data-rise style={{ "--d": "420ms" }}>
            An account is free. Choose who you are, and you get Field or Atlas.
          </p>
        </div>
        <figure className="reg-hero-pic" data-rise style={{ "--d": "520ms" }}>
          <img src={SHOTS.hero.src} alt={SHOTS.hero.alt} width="1920" height="1200" fetchPriority="high" />
          <figcaption>{SHOTS.hero.caption}</figcaption>
        </figure>
      </section>

      {stage === "wait" && <div className="reg-wait" aria-busy="true" />}

      {stage === "closed" && (
        <section className="reg-part" aria-labelledby="reg-closed">
          <Reveal className="reg-part-text">
            <h2 id="reg-closed">Registration is not open yet.</h2>
            <p>Try the demo, or write to us and we will tell you when it opens.</p>
            <p className="reg-actions">
              <Link className="reg-btn reg-btn-primary" to="/demo">
                Try the demo
              </Link>
              <Link to="/contact">Write to us</Link>
            </p>
          </Reveal>
          <Reveal as="figure" className="reg-done-pic" delay={0.1}>
            <img src={SHOTS.demo.src} alt={SHOTS.demo.alt} width="960" height="600" />
            <figcaption>{SHOTS.demo.caption}</figcaption>
          </Reveal>
        </section>
      )}

      {stage === "account" && (
        <>
          <section className="reg-part" aria-labelledby="reg-who">
            <Reveal className="reg-part-text">
              <h2 id="reg-who">Who are you?</h2>
              <p>The answer decides the product. Field is for one farm, Atlas for a whole region.</p>
              {errors.role && (
                <p className="reg-error" role="alert" id="reg-role-error">
                  {errors.role}
                </p>
              )}
            </Reveal>
            <fieldset className="reg-tiles" aria-labelledby="reg-who" aria-describedby={errors.role ? "reg-role-error" : undefined}>
              {Object.entries(ROLES).map(([key, item], index) => (
                <Reveal key={key} as="label" className="reg-tile" delay={0.08 * (index + 1)}>
                  <input
                    id={`reg-role-${key}`}
                    className="reg-sr-only reg-radio"
                    type="radio"
                    name="role"
                    value={key}
                    checked={role === key}
                    onChange={() => {
                      setRole(key);
                      setErrors((value) => ({ ...value, role: undefined }));
                    }}
                  />
                  <img src={SHOTS[key]} alt="" width="960" height="600" />
                  <span className="reg-tile-title">{item.title}</span>
                  <span className="reg-tile-text">{item.text}</span>
                  <span className="reg-tile-state" aria-hidden="true">
                    {role === key ? "Chosen" : ""}
                  </span>
                </Reveal>
              ))}
            </fieldset>
          </section>

          <section className="reg-part" aria-labelledby="reg-account">
            <Reveal className="reg-part-text">
              <h2 id="reg-account">Your account</h2>
              <p>Google, or an e-mail and a password. The password stays with Google; we never see it.</p>
              <figure className="reg-side-pic is-phone">
                <img src={SHOTS.phone.src} alt={SHOTS.phone.alt} width="780" height="1688" loading="lazy" />
                <figcaption>{SHOTS.phone.caption}</figcaption>
              </figure>
            </Reveal>
            <Stagger>
            <form className="reg-form" onSubmit={createAccount} noValidate>
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
              <Field id="reg-email" label="E-mail" type="email" name="email" autoComplete="email" inputMode="email" spellCheck={false} maxLength={LIMITS.email} value={email} onChange={(e) => setEmail(e.target.value)} hint={`Up to ${LIMITS.email} characters`} error={errors.email} />
              {emailTaken && (
                <p className="reg-note">
                  <Link to={SITE_ACTIONS.signin.path}>Go to sign in</Link>
                </p>
              )}
              <Field id="reg-password" label="Password" type="password" name="password" autoComplete="new-password" maxLength={LIMITS.password.max} value={password} onChange={(e) => setPassword(e.target.value)} hint={`${LIMITS.password.min} characters or more`} error={errors.password} />
              <Field id="reg-repeat" label="Repeat password" type="password" name="repeat" autoComplete="new-password" maxLength={LIMITS.password.max} value={repeat} onChange={(e) => setRepeat(e.target.value)} error={errors.repeat} />
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>
                {busy ? "Making your account…" : "Create account"}
              </button>
              <p className="reg-aside">
                Already registered? <Link to={SITE_ACTIONS.signin.path}>Sign in.</Link>
              </p>
              <p className="reg-privacy">{PRIVACY}</p>
            </form>
            </Stagger>
          </section>
        </>
      )}

      {stage === "profile" && (
        <section className="reg-part" aria-labelledby="reg-about">
          <Reveal className="reg-part-text">
            <h2 id="reg-about">About you</h2>
            <p>
              Signed in as {signedInAs || "you"}. {productName(product)} is yours once this is saved.
            </p>
            <figure className="reg-side-pic">
              <img src={shown.src} alt={shown.alt} width="960" height="600" loading="lazy" />
              <figcaption>{shown.caption}</figcaption>
            </figure>
            <p>
              <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                Not you? Sign out
              </button>
            </p>
          </Reveal>
          <Stagger>
          <form className="reg-form" onSubmit={finish} noValidate>
            {!ROLES[role] && (
              <fieldset className="reg-field reg-choices" aria-describedby={errors.role ? "reg-role-error" : undefined}>
                <legend className="reg-label">Who are you?</legend>
                <div className="reg-actions">
                  {Object.entries(ROLES).map(([key, item]) => (
                    <label key={key} className="reg-choice">
                      <input id={`reg-role-${key}`} type="radio" name="role" value={key} checked={role === key} onChange={() => setRole(key)} />
                      {item.title}
                    </label>
                  ))}
                </div>
                {errors.role && (
                  <span id="reg-role-error" className="reg-error" role="alert">
                    {errors.role}
                  </span>
                )}
              </fieldset>
            )}
            {product && (
              <fieldset className="reg-field reg-choices" aria-describedby={errors.kind ? "reg-kind-error" : undefined}>
                <legend className="reg-label">{product === "atlas" ? "What kind of organisation?" : "Farmer or landowner?"}</legend>
                <div className="reg-actions">
                  {KINDS[product].map((item) => (
                    <label key={item.role} className="reg-choice">
                      <input id={`reg-kind-${item.role}`} type="radio" name="kind" value={item.role} checked={kindForSave === item.role} onChange={() => setKind(item.role)} />
                      {item.label}
                    </label>
                  ))}
                </div>
                {errors.kind && (
                  <span id="reg-kind-error" className="reg-error" role="alert">
                    {errors.kind}
                  </span>
                )}
              </fieldset>
            )}
            <Field id="reg-name" label="Name" type="text" name="name" autoComplete="name" maxLength={LIMITS.name} value={profile.name} onChange={setField("name")} hint={`Up to ${LIMITS.name} characters`} error={errors.name} />
            <Field id="reg-email" label="E-mail" type="email" name="email" value={signedInAs} readOnly hint="From your sign-in" error={errors.email} />
            <Field id="reg-age" label="Age" optional type="text" name="age" inputMode="numeric" autoComplete="off" maxLength={3} value={profile.age} onChange={setField("age")} hint={`${LIMITS.age.min} to ${LIMITS.age.max}`} error={errors.age} />
            <Field id="reg-organization" label="Organisation" optional={product !== "atlas"} type="text" name="organization" autoComplete="organization" maxLength={LIMITS.organization} value={profile.organization} onChange={setField("organization")} hint={product === "atlas" ? `Needed for Atlas, up to ${LIMITS.organization} characters` : `Up to ${LIMITS.organization} characters`} error={errors.organization} />
            <Field id="reg-country" label="Country" optional type="text" name="country" autoComplete="country-name" maxLength={LIMITS.country} value={profile.country} onChange={setField("country")} hint={`Up to ${LIMITS.country} characters`} error={errors.country} />
            <Field id="reg-address" label="Town or address" optional type="text" name="address" autoComplete="street-address" maxLength={LIMITS.address} value={profile.address} onChange={setField("address")} hint={`Up to ${LIMITS.address} characters`} error={errors.address} />
            <div className={`reg-field${errors.place ? " is-wrong" : ""}`}>
              <div className="reg-field-head">
                <label htmlFor="reg-place">
                  The place you want to watch<span className="reg-opt"> (optional)</span>
                </label>
                <span id="reg-place-hint" className="reg-hint">
                  A village, a farm, or coordinates like 49.71, 37.62; up to {LIMITS.place} characters
                </span>
              </div>
              <div className="reg-place-row">
                <input id="reg-place" type="text" name="place" autoComplete="off" maxLength={LIMITS.place} value={profile.placeText} onChange={setField("placeText")} aria-describedby={`reg-place-hint reg-place-note${errors.place ? " reg-place-error" : ""}`} aria-invalid={errors.place ? true : undefined} />
                {!placeSearchHidden && (
                  <button type="button" className="reg-btn reg-btn-quiet" onClick={findPlace} disabled={placeBusy}>
                    {placeBusy ? "Searching…" : "Search"}
                  </button>
                )}
              </div>
              {offer && (
                <button type="button" className="reg-offer" onClick={usePlace}>
                  {placeOffer(offer)}
                </button>
              )}
              <span id="reg-place-note" className="reg-note" aria-live="polite">
                {placeNote}
              </span>
              {errors.place && (
                <span id="reg-place-error" className="reg-error" role="alert">
                  {errors.place}
                </span>
              )}
            </div>
            {errors.form && (
              <p className="reg-error" role="alert">
                {errors.form}
              </p>
            )}
            <button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Finish"}
            </button>
            <p className="reg-privacy">{PRIVACY}</p>
          </form>
          </Stagger>
        </section>
      )}

      {stage === "done" && (
        <section className="reg-part" aria-labelledby="reg-ready">
          <Reveal className="reg-part-text">
            <h2 id="reg-ready">Your account is ready.</h2>
            <p>
              {productName(product)} opens with an empty workspace. {product === "atlas" ? "Pick a country, a region or a box, and run the first twelve months." : "Find your farm, draw your fields, and read the first pass."}
            </p>
            <p className="reg-actions">
              <Link className="reg-btn reg-btn-primary" to={productPath(product)}>
                Open {productName(product)}
              </Link>
              <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                Sign out
              </button>
            </p>
            <p className="reg-privacy">{PRIVACY}</p>
          </Reveal>
          <Reveal as="figure" className="reg-done-pic" delay={0.1}>
            <img src={shown.src} alt={shown.alt} width="960" height="600" />
            <figcaption>{shown.caption}</figcaption>
          </Reveal>
        </section>
      )}
    </div>
  );
}
