// WHAT THIS FILE DOES
// The website's Register page (chernozem.app/register): one step, then
// straight into the product.
//
//   At the top   Field or Atlas: "Field, for my farm" or "Atlas, for a
//                region". ?product=field or ?product=atlas in the address
//                chooses in advance (the website's buttons add it); Field
//                otherwise. The pictures beside the form show the product
//                chosen and change with it.
//   Atlas only   the organisation and its kind (Government, NGO,
//                Corporation, Research, Other: Atlas is for governments,
//                NGOs and corporations; none is chosen until the person
//                picks one). Both are needed whichever way the person signs
//                up. The five kinds sit three above two (register.css).
//   Then         "Continue with Google", the one strong button (the name
//                comes from Google), or a name, an e-mail and one password
//                (8 characters or more, with a Show button) and the lighter
//                "Create account".
//
// Both ways go through Firebase Authentication (src/lib/firebase.js,
// downloaded only by this page, the Sign in page and the owner's page).
// Firebase's answers become plain words beside the right field
// (src/lib/registration.js). When Firebase accepts, its signed token goes
// to our server (POST /api/auth/firebase, src/api/accountApi.js), which
// sets the account cookie; the answers are saved (PUT /api/account) and the
// page goes straight into the product, with an empty workspace of its own.
// There the product's own setup asks where: Field's "Set up your farm"
// finds the land, Atlas's "Choose an area" the region. This page never asks
// for a place.
//
// Someone who comes back lands where they left off (registration.js
// nextStep): finished, "Signed in as ..." with a button into their product
// and "Not you? Sign out"; signed in with something still missing (Google
// gave no name, or the connection dropped before the answers were saved),
// only what is missing and "Open Field" or "Open Atlas". The owner (signed
// in with the Chernozem Google account) gets a way into both products. A
// browser Firebase already knows offers "Continue as ...". When Firebase
// Authentication is not switched on, or our server cannot check tokens, the
// page says "Registration is not open yet" with the demo and the contact
// page.
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
import { getAccount, getStatus, logoutEverywhere, postFirebaseToken, putAccount } from "../../api/accountApi.js";
import { loadFirebaseAuth } from "../../lib/firebase.js";
import { leaveDemo } from "../../lib/demoMode.js";
import {
  LIMITS,
  ORG_KINDS,
  PICTURES,
  PRODUCTS,
  SIGN_IN_ENDED,
  emailProblem,
  firebaseProblem,
  firstProblem,
  isOwner,
  nextStep,
  passwordProblem,
  productForRole,
  productFromParam,
  profileForServer,
  signInEnded,
  validateProfile,
} from "../../lib/registration.js";
import "./register.css";

// When a part of the page arrives (its entrance, register.css "Motion").
const rise = (ms) => (ms === undefined ? undefined : { "--d": `${ms}ms` });

const describedBy = (...ids) => ids.filter(Boolean).join(" ") || undefined;

const LOADING = "The sign-in is still loading. Try again in a moment.";
const NOT_LOADED = "The sign-in could not be downloaded. Check your connection and reload the page.";

// The pictures sit under the form in windows this narrow (register.css),
// below the first screen: there they load late and never hold up the form.
const PICTURES_BELOW = "(max-width: 1000px)";

const picturesBelow = () => {
  try {
    return typeof window !== "undefined" && Boolean(window.matchMedia?.(PICTURES_BELOW).matches);
  } catch {
    return false;
  }
};

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
// (src/lib/registration.js PICTURES, 960-pixel copies). Give it a key of
// its set, so a new set arrives with its own entrance: each picture, then
// its caption. Beside the form the large one is the first thing the page
// paints, so it is asked for at once, and the three small ones only once
// it has arrived (on a slow phone line they would otherwise share the line
// with it). Under the form (narrow windows) the large one waits until the
// visitor scrolls near, and a phone never shows the small ones.
export function ShotSet({ set, delay = 320 }) {
  const [below] = useState(picturesBelow);
  // When the large picture arrived, in milliseconds after this set
  // appeared (null before): the small ones keep their places in the
  // entrance, one after another after the large one.
  const [born] = useState(() => Date.now());
  const [bigDone, setBigDone] = useState(null);
  const arrived = () => setBigDone((value) => value ?? Date.now() - born);
  const smallDelay = (index, extra = 0) => Math.max(0, delay + 90 * (index + 1) + extra - bigDone);
  const [big, ...small] = PICTURES[set] || PICTURES.field;
  return (
    <div className="reg-shots">
      <figure className="reg-shot is-big">
        <img
          src={big.src}
          alt={big.alt}
          width={big.width}
          height={big.height}
          loading={below ? "lazy" : "eager"}
          fetchPriority={below ? "low" : "high"}
          decoding="async"
          onLoad={arrived}
          onError={arrived}
          data-arrive
          style={rise(delay)}
        />
        <figcaption data-arrive style={rise(delay + 80)}>
          {big.caption}
        </figcaption>
      </figure>
      {bigDone !== null && (
        <div className="reg-shot-row">
          {small.map((shot, index) => (
            <figure key={shot.src} className={`reg-shot${shot.tall ? " is-tall" : ""}`}>
              <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" data-arrive style={rise(smallDelay(index))} />
              <figcaption data-arrive style={rise(smallDelay(index, 80))}>
                {shot.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

// Field or Atlas: two radio buttons dressed as one compact switch. A
// screen reader hears "Field, for my farm"; the arrow keys move between them.
function ProductChoice({ value, onChange }) {
  return (
    <fieldset className="reg-choice">
      <legend className="reg-sr-only">Choose Field or Atlas</legend>
      {Object.entries(PRODUCTS).map(([key, item], index) => (
        <label key={key} className="reg-choice-item" data-arrive style={rise(170 + 40 * index)}>
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

// Atlas's two answers: the organisation, and its kind as five flat
// choices (ORG_KINDS) with none chosen at first. Enter in the organisation
// moves on to the kind rather than sending the form.
function OrganisationFields({ organization, onOrganization, kind, onKind, errors, delay }) {
  function next(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    document.getElementById(`reg-kind-${kind || ORG_KINDS[0].role}`)?.focus();
  }
  return (
    <>
      <AuthField
        id="reg-organization"
        label="Organisation"
        type="text"
        name="organization"
        autoComplete="organization"
        maxLength={LIMITS.organization}
        value={organization}
        onChange={onOrganization}
        onKeyDown={next}
        error={errors.organization}
        delay={delay}
      />
      <fieldset className={`reg-kinds${errors.kind ? " is-wrong" : ""}`} data-arrive style={rise(delay + 40)} aria-describedby={errors.kind ? "reg-kind-error" : undefined}>
        <legend>Kind of organisation</legend>
        <div className="reg-kind-row">
          {ORG_KINDS.map((item) => (
            <label key={item.role} className="reg-kind">
              <input id={`reg-kind-${item.role}`} className="reg-sr-only" type="radio" name="kind" value={item.role} checked={kind === item.role} onChange={() => onKind(item.role)} />
              <span>{item.label}</span>
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
  );
}

export default function RegisterPage() {
  usePageTitle("Register");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const product = productFromParam(params.get("product"));

  // What is on screen: "wait" (asking the server who this is), "form"
  // (the one step), "finish" (signed in, something still missing), "signed"
  // (finished before), "owner", or "closed" (registration is not open).
  const [stage, setStage] = useState("wait");
  const [account, setAccount] = useState(null);

  // Firebase: the module once downloaded, and the person it knows.
  const [fb, setFb] = useState(null);
  const [fbUser, setFbUser] = useState(null);
  const [fbFailed, setFbFailed] = useState("");

  // The answers.
  const [organization, setOrganization] = useState("");
  const [orgKind, setOrgKind] = useState(""); // none chosen yet
  const [fieldRole, setFieldRole] = useState("farmer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Messages beside the answers: organization, kind, name, email,
  // password, google, known, form; takenAt names the one that gets
  // "Sign in instead".
  const [errors, setErrors] = useState({});
  // Which way is at work: "google", "email", "known" (Continue as),
  // "finish", "out" (signing out), or "" for none.
  const [busy, setBusy] = useState("");
  // After the first entrance, parts that appear later (Atlas's answers
  // when the switch moves) arrive at once instead of waiting their turn.
  const [settled, setSettled] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // "The keyboard goes to ..." once the page has drawn what it changed (a
  // button disabled while busy can take the keyboard only after that).
  const focusNext = useRef("");
  const [focusAsked, setFocusAsked] = useState(0);
  function focusSoon(id) {
    focusNext.current = id;
    setFocusAsked((count) => count + 1);
  }
  useEffect(() => {
    if (!focusNext.current) return;
    const target = document.getElementById(focusNext.current);
    focusNext.current = "";
    target?.focus();
  }, [stage, focusAsked]);

  // Once the form has made its entrance, it counts as settled.
  useEffect(() => {
    if (stage !== "form" && stage !== "finish") return undefined;
    const timer = setTimeout(() => {
      if (alive.current) setSettled(true);
    }, 900);
    return () => clearTimeout(timer);
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

  function chooseKind(kind) {
    setOrgKind(kind);
    setErrors((value) => (value.kind ? { ...value, kind: undefined } : value));
  }

  // The answers as they stand, for the checks and the server.
  const answers = () => ({ product, kind: product === "atlas" ? orgKind : fieldRole, name, organization });

  // Where the keyboard goes for an answer with a problem.
  const fieldId = (key) => (key === "kind" ? `reg-kind-${orgKind || ORG_KINDS[0].role}` : key === "product" ? `reg-product-${product}` : `reg-${key}`);

  // Shows the problems beside their answers; the keyboard goes to the first.
  function stop(problems) {
    setErrors(problems);
    document.getElementById(fieldId(firstProblem(problems)))?.focus();
  }

  // Fills the answers from what the server already has for this account.
  async function prefill(fromAccount) {
    let saved = null;
    try {
      saved = (await getAccount())?.profile || null;
    } catch {
      // A fresh account has nothing saved yet; the answers start empty.
    }
    if (!alive.current) return;
    setName(saved?.name || fromAccount?.name || "");
    setOrganization(saved?.organization || "");
    if (productForRole(saved?.role) === "atlas") setOrgKind(saved.role);
    if (saved?.role === "landowner") setFieldRole("landowner");
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
      const step = nextStep(status);
      if (status?.account) setAccount(status.account);
      if (step === "finish") await prefill(status.account);
      if (!cancelled) setStage(step);
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
  // account's own workspace (and, for a new account, the product's setup).
  function enterProduct(key) {
    leaveDemo();
    navigate((PRODUCTS[key] || PRODUCTS.field).path);
  }

  // Saves the answers and goes in. When saving fails the person is signed
  // in already, so the page shows only what is left to do.
  async function save(fields) {
    try {
      await putAccount(profileForServer(fields));
      if (!alive.current) return;
      enterProduct(fields.product);
    } catch (error) {
      if (!alive.current) return;
      if (error?.status === 401) {
        setAccount(null);
        setStage("form");
        setErrors({ form: "Your sign-in ran out. Sign in again to finish." });
      } else if (error?.code === "accounts_off") {
        setStage("closed");
      } else {
        setStage("finish");
        setErrors({ form: error?.message || "Could not save. Try again." });
      }
    }
  }

  // Firebase accepted the person: hand the token to our server, then save
  // the answers and go in (someone who finished before goes straight into
  // their own product). fields: the answers when the button was pressed.
  async function afterFirebase(user, fields) {
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
    const made = status?.account || answer?.account || null;
    setAccount(made);
    if (isOwner(status) || made?.owner) {
      setStage("owner");
      return;
    }
    if (made?.profileComplete && PRODUCTS[made.product]) {
      enterProduct(made.product);
      return;
    }
    // The name typed, else Google's (the server keeps Google's too).
    const named = { ...fields, name: fields.name.trim() || (user?.displayName || "").trim() || made?.name || "" };
    const check = validateProfile(named);
    if (!check.ok) {
      // Google gave no name, or a known person's answers are not all in:
      // only what is missing is asked, then "Open Field" or "Open Atlas".
      setName(named.name);
      setErrors(check.problems);
      focusSoon(fieldId(firstProblem(check.problems)));
      setStage("finish");
      return;
    }
    await save(named);
  }

  // A Firebase or server answer, in plain words beside the right part.
  // where: "google", "known" (Continue as) or "email" (the e-mail way).
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

  // Google gives the name; Atlas's two answers are checked first. Nothing
  // waits before the Google window opens: browsers block a window that
  // does not open straight from the press.
  async function continueWithGoogle() {
    if (busy) return;
    const fields = answers();
    const check = validateProfile(fields, { nameFromGoogle: true });
    if (!check.ok) {
      stop(check.problems);
      return;
    }
    if (!fb) {
      setErrors({ google: fbFailed || LOADING });
      return;
    }
    setBusy("google");
    setErrors({});
    try {
      const credential = await fb.signInWithPopup(fb.auth, fb.googleProvider());
      await afterFirebase(credential.user, fields);
    } catch (error) {
      if (alive.current) showProblem(error, "google");
    } finally {
      if (alive.current) setBusy("");
    }
  }

  // The e-mail way: every answer is checked before Firebase is asked.
  async function createAccount(event) {
    event.preventDefault();
    if (busy) return;
    const fields = answers();
    const problems = { ...validateProfile(fields).problems };
    const emailWrong = emailProblem(email);
    if (emailWrong) problems.email = emailWrong;
    const passwordWrong = passwordProblem(password);
    if (passwordWrong) problems.password = passwordWrong;
    if (Object.keys(problems).length) {
      stop(problems);
      return;
    }
    if (!fb) {
      setErrors({ form: fbFailed || LOADING });
      return;
    }
    setBusy("email");
    setErrors({});
    try {
      const credential = await fb.createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      await afterFirebase(credential.user, fields);
    } catch (error) {
      if (alive.current) showProblem(error, "email");
    } finally {
      if (alive.current) setBusy("");
    }
  }

  // Firebase already knows this person (they signed in before in this
  // browser): one press carries on from there. When that sign-in has ended
  // (they signed out), this browser forgets it too and the form is left.
  async function continueAs() {
    if (busy || !fbUser || !fb) return;
    setBusy("known");
    setErrors({});
    try {
      await afterFirebase(fbUser, answers());
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
      if (alive.current) setBusy("");
    }
  }

  // "Open Field" or "Open Atlas" for someone signed in with something
  // still missing.
  async function finish(event) {
    event.preventDefault();
    if (busy) return;
    const fields = answers();
    const check = validateProfile(fields);
    if (!check.ok) {
      stop(check.problems);
      return;
    }
    setBusy("finish");
    setErrors({});
    await save(fields);
    if (alive.current) setBusy("");
  }

  // Signs out of our server and of Firebase, back to the form.
  async function signOutAll() {
    if (busy) return;
    setBusy("out");
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
    setOrgKind("");
    setFieldRole("farmer");
    setBusy("");
    // The keyboard goes to "Continue with Google" (also when the form was
    // on screen already: the box that held "Sign out" is gone).
    focusSoon("reg-google");
    setStage("form");
  }

  const signedInAs = account?.email || fbUser?.email || "";
  const own = stage === "signed" && PRODUCTS[account?.product] ? account.product : product;
  const item = PRODUCTS[own];
  const atlas = product === "atlas";
  // Entrance delays: the e-mail way comes after Atlas's two answers.
  const after = atlas ? 80 : 0;
  const late = (ms) => (settled ? 0 : ms);

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
            An account is free and takes one step.
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
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={Boolean(busy)}>
                  Not you? Sign out
                </button>
              </div>
            </div>
          )}

          {stage === "owner" && (
            <div className="reg-panel" data-arrive style={rise(160)}>
              <p>
                Signed in as <strong>{signedInAs || "the owner"}</strong>, the owner.
              </p>
              <div className="reg-actions">
                <Link className="reg-btn reg-btn-primary" to={PRODUCTS.field.path} onClick={leaveDemo}>
                  Open Field
                </Link>
                <Link className="reg-btn reg-btn-second" to={PRODUCTS.atlas.path} onClick={leaveDemo}>
                  Open Atlas
                </Link>
                <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={Boolean(busy)}>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {(stage === "form" || stage === "finish") && (
            <>
              {stage === "finish" && (
                <p className="reg-who" data-arrive style={rise(160)}>
                  Signed in as <strong>{signedInAs || "you"}</strong>.{" "}
                  <button type="button" className="reg-textbtn" onClick={signOutAll} disabled={Boolean(busy)}>
                    Not you? Sign out
                  </button>
                </p>
              )}
              <ProductChoice value={product} onChange={chooseProduct} />
            </>
          )}

          {stage === "form" && (
            <form className="reg-form" onSubmit={createAccount} noValidate aria-label="Register">
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
                </div>
              )}
              {errors.known && (
                <p className="reg-error" role="alert">
                  {errorText("known")}
                </p>
              )}
              {atlas && (
                <OrganisationFields
                  organization={organization}
                  onOrganization={edit(setOrganization, "organization")}
                  kind={orgKind}
                  onKind={chooseKind}
                  errors={errors}
                  delay={late(260)}
                />
              )}
              <button id="reg-google" type="button" className="reg-btn reg-btn-primary reg-btn-wide" onClick={continueWithGoogle} disabled={Boolean(busy)} data-arrive style={rise(late(260 + after))}>
                {busy === "google" ? `Opening ${PRODUCTS[product].name}…` : "Continue with Google"}
              </button>
              {errors.google && (
                <p className="reg-error" role="alert">
                  {errorText("google")}
                </p>
              )}
              <p className="reg-or" aria-hidden="true" data-arrive style={rise(late(290 + after))}>
                or
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
                delay={late(320 + after)}
              />
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
                delay={late(350 + after)}
              />
              <PasswordField
                id="reg-password"
                hint={`${LIMITS.password.min} characters or more`}
                autoComplete="new-password"
                value={password}
                onChange={edit(setPassword, "password")}
                error={errors.password}
                delay={late(380 + after)}
              />
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-second reg-btn-wide" disabled={Boolean(busy)} data-arrive style={rise(late(410 + after))}>
                {busy === "email" ? "Making your account…" : "Create account"}
              </button>
              <p className="reg-aside" data-arrive style={rise(late(440 + after))}>
                Already have an account? <Link to={SITE_ACTIONS.signin.path}>Sign in</Link>
              </p>
            </form>
          )}

          {stage === "finish" && (
            <form className="reg-form" onSubmit={finish} noValidate aria-label="Finish registering">
              {atlas && (
                <OrganisationFields
                  organization={organization}
                  onOrganization={edit(setOrganization, "organization")}
                  kind={orgKind}
                  onKind={chooseKind}
                  errors={errors}
                  delay={late(260)}
                />
              )}
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
                delay={late(260 + after)}
              />
              {errors.form && (
                <p className="reg-error" role="alert">
                  {errors.form}
                </p>
              )}
              <button type="submit" className="reg-btn reg-btn-primary reg-btn-wide" disabled={Boolean(busy)} data-arrive style={rise(late(300 + after))}>
                {busy === "finish" ? "Opening…" : `Open ${PRODUCTS[product].name}`}
              </button>
            </form>
          )}
        </div>

        <ShotSet key={own} set={own} />
      </section>
    </div>
  );
}
