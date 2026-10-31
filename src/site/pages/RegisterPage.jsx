// WHAT THIS FILE DOES
// The website's Register page (chernozem.app/register): two short steps
// on one page, named in words under the title ("Account · About you").
//
//   At the top   Field or Atlas: "Field, for my farm" or "Atlas, for a
//                region". ?product=field or ?product=atlas in the address
//                chooses in advance (the website's buttons add it); Field
//                otherwise. The pictures beside the form show the product
//                chosen and change with it.
//   Account      "Continue with Google", or an e-mail and one password
//                (8 characters or more, with a Show button), through
//                Firebase Authentication (src/lib/firebase.js, downloaded
//                only by this page and the Sign in page). Firebase's answers
//                become plain words beside the right field
//                (src/lib/registration.js). When Firebase accepts, its
//                signed token goes to our server (POST /api/auth/firebase,
//                src/api/accountApi.js), which sets the account cookie.
//   About you    The name (Google's, when there is one); for Atlas also the
//                organisation and its kind; one optional place, found with
//                the place search (GET /api/geocode), which also gives the
//                country. "Open Field" or "Open Atlas" saves it (PUT
//                /api/account) and goes straight into the product, with an
//                empty workspace of its own.
//
// Someone who comes back lands where they left off (registration.js
// nextStep): "About you" when it is not finished; when it is, "Signed in
// as ..." with a button into their product and "Not you? Sign out". A
// browser Firebase already knows offers "Continue as ...". When Firebase
// Authentication is not switched on, or our server cannot check tokens,
// the page says "Registration is not open yet" with the demo and the
// contact page.
//
// Going into Field or Atlas from here always leaves the public demo first
// (src/lib/demoMode.js leaveDemo), so the account sees its own workspace.
//
// The Sign in page (SignInPage.jsx) uses three parts exported here: the
// labelled field, the password field and the pictures.
//
// WHO EDITS IT
// Whoever changes how people register. The words of the checks and the
// list of pictures live in src/lib/registration.js; the look in register.css.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePageTitle } from "../hooks.js";
import { SITE_ACTIONS } from "../content/site.js";
import { getAccount, getStatus, logoutEverywhere, postFirebaseToken, putAccount, searchPlace } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import { leaveDemo } from "../../lib/demoMode.js";
import {
  DEFAULT_ORG_KIND,
  LIMITS,
  ORG_KINDS,
  PICTURES,
  PRODUCTS,
  STEPS,
  emailProblem,
  firebaseProblem,
  nextStep,
  parsePlace,
  passwordProblem,
  placeFromResult,
  productForRole,
  productFromParam,
  profileForServer,
  validateProfile,
} from "../../lib/registration.js";
import "./register.css";

// When a part of the page arrives (its entrance, register.css "Motion").
const rise = (ms) => (ms === undefined ? undefined : { "--d": `${ms}ms` });

const describedBy = (...ids) => ids.filter(Boolean).join(" ") || undefined;

const LOADING = "The sign-in is still loading. Try again in a moment.";
const NOT_LOADED = "The sign-in could not be downloaded. Check your connection and reload the page.";

// One labelled answer: the label, what it accepts beside it (hint), an
// extra control beside it (after: "Forgot it?"), and its error under it,
// both tied to the input for screen readers. children replaces the plain
// input (the password field brings its own).
export function AuthField({ id, label, hint, error, after, optional, delay, children, ...input }) {
  const ids = describedBy(hint && `${id}-hint`, error && `${id}-error`);
  return (
    <div className={`reg-field${error ? " is-wrong" : ""}`} data-arrive={delay === undefined ? undefined : ""} style={rise(delay)}>
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
        {after}
      </div>
      {children || <input id={id} aria-describedby={ids} aria-invalid={error ? true : undefined} {...input} />}
      {error && (
        <span id={`${id}-error`} className="reg-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// The one password field, with "Show" to read what was typed.
export function PasswordField({ id, hint, error, after, delay, autoComplete, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <AuthField id={id} label="Password" hint={hint} error={error} after={after} delay={delay}>
      <div className="reg-pass">
        <input
          id={id}
          type={shown ? "text" : "password"}
          name="password"
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LIMITS.password.max}
          value={value}
          onChange={onChange}
          aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
          aria-invalid={error ? true : undefined}
        />
        <button type="button" className="reg-show" aria-controls={id} aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown((value) => !value)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
    </AuthField>
  );
}

// The product's real pictures beside the form: one large, three small
// (src/lib/registration.js PICTURES). Give it a key of its set, so a new
// set arrives with its own entrance: each picture, then its caption.
export function ShotSet({ set, delay = 320 }) {
  const [big, ...small] = PICTURES[set] || PICTURES.field;
  return (
    <div className="reg-shots">
      <figure className="reg-shot is-big">
        <img src={big.src} alt={big.alt} width={big.width} height={big.height} fetchPriority="high" decoding="async" data-arrive style={rise(delay)} />
        <figcaption data-arrive style={rise(delay + 80)}>
          {big.caption}
        </figcaption>
      </figure>
      <div className="reg-shot-row">
        {small.map((shot, index) => (
          <figure key={shot.src} className={`reg-shot${shot.tall ? " is-tall" : ""}`}>
            <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" data-arrive style={rise(delay + 90 * (index + 1))} />
            <figcaption data-arrive style={rise(delay + 90 * (index + 1) + 80)}>
              {shot.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

// "Account · About you": where the person is, in words.
function Steps({ current }) {
  return (
    <ol className="reg-steps" aria-label="Steps">
      {STEPS.map((step, index) => (
        <li key={step.key} aria-current={step.key === current ? "step" : undefined} data-arrive style={rise(170 + 40 * index)}>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

// Field or Atlas: two radio buttons dressed as one compact switch. A
// screen reader hears "Field, for my farm"; the arrow keys move between them.
function ProductChoice({ value, onChange }) {
  return (
    <fieldset className="reg-choice">
      <legend className="reg-sr-only">Choose Field or Atlas</legend>
      {Object.entries(PRODUCTS).map(([key, item], index) => (
        <label key={key} className="reg-choice-item" data-arrive style={rise(230 + 40 * index)}>
          <input
            id={`reg-product-${key}`}
            className="reg-sr-only"
            type="radio"
            name="product"
            value={key}
            checked={value === key}
            onChange={() => onChange(key)}
            aria-label={`${item.name}, ${item.tagline}`}
          />
          <span className="reg-choice-name">{item.name}</span>
          <span className="reg-choice-tag">{item.tagline}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function RegisterPage() {
  usePageTitle("Register");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const product = productFromParam(params.get("product"));

  // What is on screen: "wait" (asking the server who this is), "account",
  // "profile" (About you), "signed" (finished before) or "closed"
  // (registration is not open).
  const [stage, setStage] = useState("wait");
  const [account, setAccount] = useState(null);

  // Firebase: the module once downloaded, and the person it knows.
  const [fb, setFb] = useState(null);
  const [fbUser, setFbUser] = useState(null);
  const [fbFailed, setFbFailed] = useState("");

  // Account.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Messages beside the fields: google, known, email, password, form, name,
  // organization, kind, place; takenAt names the one that gets "Sign in".
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // About you.
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [orgKind, setOrgKind] = useState(DEFAULT_ORG_KIND);
  const [fieldRole, setFieldRole] = useState("farmer");
  const [placeText, setPlaceText] = useState("");
  const [place, setPlace] = useState(null); // { lat, lng, label } once chosen
  const [found, setFound] = useState([]); // the places the search found
  const [placeNote, setPlaceNote] = useState("");
  const [placeBusy, setPlaceBusy] = useState(false);

  const alive = useRef(true);
  const focusNext = useRef("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // After a step changes, the keyboard goes to its first answer.
  useEffect(() => {
    if (!focusNext.current) return;
    const target = document.getElementById(focusNext.current);
    focusNext.current = "";
    target?.focus();
  }, [stage]);

  // Typing in a field takes its message away.
  function edit(setter, key) {
    return (event) => {
      setter(event.target.value);
      setErrors((value) => (value[key] ? { ...value, [key]: undefined, takenAt: value.takenAt === key ? "" : value.takenAt } : value));
    };
  }

  // The choice goes into the address too, so a reload keeps it.
  function chooseProduct(next) {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        copy.set("product", next);
        return copy;
      },
      { replace: true }
    );
    setErrors((value) => ({ ...value, organization: undefined, kind: undefined }));
  }

  // Fills About you from what the server already has for this account.
  async function prefill(fromAccount, googleName = "") {
    let saved = null;
    try {
      saved = (await getAccount())?.profile || null;
    } catch {
      // A fresh account has nothing saved yet; the form starts empty.
    }
    if (!alive.current) return;
    setName(saved?.name || fromAccount?.name || googleName || "");
    setOrganization(saved?.organization || "");
    if (productForRole(saved?.role) === "atlas") setOrgKind(saved.role);
    if (saved?.role === "landowner") setFieldRole("landowner");
    const savedPlace = placeFromResult(saved?.place);
    if (savedPlace) {
      setPlace(savedPlace);
      setPlaceText(savedPlace.label);
    }
    const savedProduct = PRODUCTS[saved?.product] ? saved.product : productForRole(saved?.role);
    if (savedProduct && !new URLSearchParams(window.location.search).has("product")) chooseProduct(savedProduct);
  }

  // Ask the server who this browser is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let status = null;
      try {
        status = await getStatus();
      } catch {
        // No server answer: start from the beginning; errors show on submit.
      }
      if (cancelled) return;
      const step = nextStep(status, null);
      if (status?.account) setAccount(status.account);
      if (step === "signed") {
        setStage("signed");
        return;
      }
      if (step === "profile") {
        await prefill(status.account);
        if (!cancelled) setStage("profile");
        return;
      }
      setStage("account");
    })();
    return () => {
      cancelled = true;
    };
  }, []); // once, when the page opens

  // Download Firebase meanwhile, and listen for the person it knows.
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

  // Into the product: out of the public demo first, so this tab shows the
  // account's own workspace.
  function enterProduct(key) {
    leaveDemo();
    navigate((PRODUCTS[key] || PRODUCTS.field).path);
  }

  // Firebase accepted the person: hand the token to our server, then About
  // you (or straight into the product for someone who finished before).
  async function afterFirebase(user) {
    const idToken = await fb.getIdToken(user);
    const answer = await postFirebaseToken(idToken);
    if (!alive.current) return;
    const made = answer?.account || null;
    setAccount(made);
    if (made?.profileComplete && PRODUCTS[made.product]) {
      enterProduct(made.product);
      return;
    }
    await prefill(made, user?.displayName || "");
    if (!alive.current) return;
    focusNext.current = "reg-name";
    setStage("profile");
  }

  // A Firebase or server answer, in plain words beside the right part.
  // where: "google", "known" (Continue as) or "email" (the e-mail form).
  function showProblem(error, where) {
    const problem = firebaseProblem(error);
    if (problem.field === "closed") {
      setStage("closed");
      return;
    }
    const spot = where === "email" ? problem.field : where;
    setErrors({ [spot]: problem.message, takenAt: problem.signIn ? spot : "" });
  }

  // A message, with "Sign in instead" when the e-mail already has an account.
  function errorText(spot) {
    if (!errors[spot]) return null;
    if (errors.takenAt !== spot) return errors[spot];
    return (
      <>
        {errors[spot]} <Link to={SITE_ACTIONS.signin.path}>Sign in instead</Link>
      </>
    );
  }

  async function continueWithGoogle() {
    if (busy) return;
    if (!fb) {
      setErrors({ google: fbFailed || LOADING });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const credential = await fb.signInWithPopup(fb.auth, fb.googleProvider());
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error, "google");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    if (busy) return;
    const problems = {};
    const emailWrong = emailProblem(email);
    if (emailWrong) problems.email = emailWrong;
    const passwordWrong = passwordProblem(password);
    if (passwordWrong) problems.password = passwordWrong;
    if (Object.keys(problems).length) {
      setErrors(problems);
      document.getElementById(problems.email ? "reg-email" : "reg-password")?.focus();
      return;
    }
    if (!fb) {
      setErrors({ form: fbFailed || LOADING });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const credential = await fb.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      await afterFirebase(credential.user);
    } catch (error) {
      if (alive.current) showProblem(error, "email");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // Firebase already knows this person (they signed in before in this
  // browser): one press carries on from there.
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

  // Signs out of our server and of Firebase, back to the Account step.
  async function signOutAll() {
    if (busy) return;
    setBusy(true);
    try {
      await logoutEverywhere();
    } catch {
      // Already out, or no server: the browser forgets the person anyway.
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
    setPassword("");
    setName("");
    setOrganization("");
    setOrgKind(DEFAULT_ORG_KIND);
    setFieldRole("farmer");
    setPlaceText("");
    setPlace(null);
    setFound([]);
    setPlaceNote("");
    setBusy(false);
    focusNext.current = "reg-google";
    setStage("account");
  }

  // ---- The place (About you) ----

  function editPlace(event) {
    setPlaceText(event.target.value);
    setPlace(null);
    setFound([]);
    setPlaceNote("");
    setErrors((value) => ({ ...value, place: undefined }));
  }

  // Typed coordinates are read here; a name goes to the server's place
  // search (it needs the account cookie, set by now). -> up to five places.
  async function lookUp(text) {
    const typed = text.trim();
    const coords = parsePlace(typed);
    if (coords) return [coords];
    const { results } = await searchPlace(typed);
    return (Array.isArray(results) ? results : []).map(placeFromResult).filter(Boolean).slice(0, 5);
  }

  const placeTrouble = (error) =>
    error?.status === 503
      ? "The place search is not answering. Try again, or type coordinates like 49.71, 37.62."
      : error?.status === 401
        ? "Your sign-in ran out. Sign out and in again to search."
        : error?.message || "The place search did not answer. Try again.";

  function choosePlace(chosen) {
    setPlace(chosen);
    setPlaceText(chosen.label);
    setFound([]);
    setPlaceNote(`Chosen (${chosen.lat.toFixed(2)}, ${chosen.lng.toFixed(2)}).`);
    setErrors((value) => ({ ...value, place: undefined }));
    document.getElementById("reg-place")?.focus();
  }

  async function findPlace() {
    const typed = placeText.trim();
    if (placeBusy) return;
    if (!typed) {
      setErrors((value) => ({ ...value, place: "Type a place first." }));
      document.getElementById("reg-place")?.focus();
      return;
    }
    setPlaceBusy(true);
    setPlaceNote("");
    setFound([]);
    setPlace(null);
    try {
      const places = await lookUp(typed);
      if (!alive.current) return;
      // One place found: it is the one. More: the person chooses.
      if (places.length === 1) choosePlace(places[0]);
      else if (places.length) {
        setFound(places);
        setPlaceNote("Choose one.");
      } else setPlaceNote(`Nothing found for “${typed}”. Try the nearest town, or coordinates.`);
    } catch (error) {
      if (alive.current) setPlaceNote(placeTrouble(error));
    } finally {
      if (alive.current) setPlaceBusy(false);
    }
  }

  // Enter in the place field searches, unless a place is already chosen.
  function placeKey(event) {
    if (event.key !== "Enter") return;
    if (place && placeText === place.label) return;
    event.preventDefault();
    findPlace();
  }

  // ---- Open Field / Open Atlas ----

  async function finish(event) {
    event.preventDefault();
    if (busy) return;
    const fields = { product, kind: product === "atlas" ? orgKind : fieldRole, name, organization, place };
    const check = validateProfile(fields);
    if (!check.ok) {
      setErrors(check.problems);
      const first = ["name", "organization", "kind", "place"].find((key) => check.problems[key]);
      document.getElementById(first === "kind" ? `reg-kind-${orgKind}` : `reg-${first}`)?.focus();
      return;
    }
    // Several places were found and none chosen: the person picks one.
    if (!place && found.length > 1) {
      setErrors({ place: "Choose one of the places found, or clear the field." });
      document.querySelector(".reg-found-item")?.focus();
      return;
    }
    setBusy(true);
    setErrors({});
    let chosen = place;
    if (!chosen && placeText.trim()) {
      // Typed but never searched: the first place found is the one.
      try {
        chosen = (await lookUp(placeText))[0] || null;
      } catch (error) {
        if (!alive.current) return;
        setErrors({ place: placeTrouble(error) });
        setBusy(false);
        document.getElementById("reg-place")?.focus();
        return;
      }
      if (!alive.current) return;
      if (!chosen) {
        setErrors({ place: `Nothing found for “${placeText.trim()}”. Try the nearest town, or clear the field.` });
        setBusy(false);
        document.getElementById("reg-place")?.focus();
        return;
      }
      setPlace(chosen);
      setPlaceText(chosen.label);
    }
    try {
      await putAccount(profileForServer({ ...fields, place: chosen }));
      if (!alive.current) return;
      enterProduct(product);
    } catch (error) {
      if (!alive.current) return;
      if (error?.status === 401) {
        setAccount(null);
        setStage("account");
        setErrors({ form: "Your sign-in ran out. Sign in again to finish." });
      } else if (error?.code === "accounts_off") {
        setStage("closed");
      } else {
        setErrors({ form: error?.message || "Could not save. Try again." });
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const signedInAs = account?.email || fbUser?.email || "";
  const own = stage === "signed" && PRODUCTS[account?.product] ? account.product : product;
  const item = PRODUCTS[own];

  return (
    <div className="reg">
      <section className="reg-stage" aria-labelledby="reg-title">
        <div className="reg-main">
          <h1 id="reg-title" className="reg-title">
            <span className="reg-line">
              <span className="reg-line-in">Register</span>
            </span>
          </h1>
          <p className="reg-lead" data-arrive style={rise(120)}>
            An account is free and takes two short steps.
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
                Signed in as <strong>{signedInAs}</strong>.
              </p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={item.path} onClick={leaveDemo}>
                  Open {item.name}
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  Not you? Sign out
                </button>
              </div>
            </div>
          )}

          {(stage === "account" || stage === "profile") && (
            <>
              <Steps current={stage} />
              <ProductChoice value={product} onChange={chooseProduct} />
            </>
          )}

          {stage === "account" && (
            <form className="reg-form" onSubmit={createAccount} noValidate aria-label="Account">
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
                      {errorText("known")}
                    </p>
                  )}
                </div>
              )}
              <button id="reg-google" type="button" className="reg-btn reg-btn-primary reg-btn-wide" onClick={continueWithGoogle} disabled={busy} data-arrive style={rise(310)}>
                Continue with Google
              </button>
              {errors.google && (
                <p className="reg-error" role="alert">
                  {errorText("google")}
                </p>
              )}
              <p className="reg-or" aria-hidden="true" data-arrive style={rise(340)}>
                or
              </p>
              <AuthField
                id="reg-email"
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
                error={errorText("email")}
                delay={370}
              />
              <PasswordField id="reg-password" hint={`${LIMITS.password.min} characters or more`} autoComplete="new-password" value={password} onChange={edit(setPassword, "password")} error={errors.password} delay={400} />
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-second reg-btn-wide" disabled={busy} data-arrive style={rise(430)}>
                {busy ? "Making your account…" : "Create account"}
              </button>
              <p className="reg-aside" data-arrive style={rise(460)}>
                Already have an account? <Link to={SITE_ACTIONS.signin.path}>Sign in</Link>
              </p>
            </form>
          )}

          {stage === "profile" && (
            <form className="reg-form" onSubmit={finish} noValidate aria-label="About you">
              <p className="reg-who" data-arrive style={rise(280)}>
                Signed in as <strong>{signedInAs || "you"}</strong>.{" "}
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={busy}>
                  Not you? Sign out
                </button>
              </p>
              <AuthField
                id="reg-name"
                label="Name"
                type="text"
                name="name"
                autoComplete="name"
                maxLength={LIMITS.name}
                value={name}
                onChange={edit(setName, "name")}
                error={errors.name}
                delay={320}
              />
              {product === "atlas" && (
                <>
                  <AuthField
                    id="reg-organization"
                    label="Organisation"
                    type="text"
                    name="organization"
                    autoComplete="organization"
                    maxLength={LIMITS.organization}
                    value={organization}
                    onChange={edit(setOrganization, "organization")}
                    error={errors.organization}
                    delay={360}
                  />
                  <fieldset className={`reg-kinds${errors.kind ? " is-wrong" : ""}`} data-arrive style={rise(400)} aria-describedby={errors.kind ? "reg-kind-error" : undefined}>
                    <legend>Kind of organisation</legend>
                    <div className="reg-kind-row">
                      {ORG_KINDS.map((kind) => (
                        <label key={kind.role} className="reg-kind">
                          <input
                            id={`reg-kind-${kind.role}`}
                            className="reg-sr-only"
                            type="radio"
                            name="kind"
                            value={kind.role}
                            checked={orgKind === kind.role}
                            onChange={() => {
                              setOrgKind(kind.role);
                              setErrors((value) => ({ ...value, kind: undefined }));
                            }}
                          />
                          <span>{kind.label}</span>
                        </label>
                      ))}
                    </div>
                    {errors.kind && (
                      <span id="reg-kind-error" className="reg-error" role="alert">
                        {errors.kind}
                      </span>
                    )}
                  </fieldset>
                </>
              )}
              <AuthField id="reg-place" label={PRODUCTS[product].placeLabel} optional error={errors.place} delay={product === "atlas" ? 440 : 360}>
                <div className="reg-place-row">
                  <input
                    id="reg-place"
                    type="text"
                    name="place"
                    autoComplete="off"
                    maxLength={LIMITS.place}
                    placeholder={PRODUCTS[product].placeHint}
                    value={placeText}
                    onChange={editPlace}
                    onKeyDown={placeKey}
                    aria-describedby={describedBy("reg-place-note", errors.place && "reg-place-error")}
                    aria-invalid={errors.place ? true : undefined}
                  />
                  <button type="button" className="reg-btn reg-btn-quiet" onClick={findPlace} disabled={placeBusy}>
                    {placeBusy ? "Searching…" : "Search"}
                  </button>
                </div>
                <span id="reg-place-note" className="reg-note" aria-live="polite">
                  {placeNote}
                </span>
                {found.length > 0 && (
                  <ul className="reg-found" aria-label="Places found">
                    {found.map((spot) => (
                      <li key={`${spot.lat},${spot.lng},${spot.label}`}>
                        <button type="button" className="reg-found-item" onClick={() => choosePlace(spot)}>
                          {spot.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </AuthField>
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-primary reg-btn-wide" disabled={busy} data-arrive style={rise(product === "atlas" ? 480 : 400)}>
                {busy ? "Opening…" : `Open ${PRODUCTS[product].name}`}
              </button>
            </form>
          )}
        </div>

        <ShotSet key={own} set={own} />
      </section>
    </div>
  );
}
