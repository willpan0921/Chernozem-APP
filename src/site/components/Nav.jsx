// WHAT THIS FILE DOES
// The website's menu bar: a plain bar on the page ground with the wordmark
// at the left, the four pages in the middle, and at the right the text
// links "Demo" and "Sign in" and the button "Register". Nothing in it
// animates. On a phone it shows the wordmark, the button and a text button
// "Menu" that opens a full-screen sheet with every link.
//
// The button depends on who is looking, asked once when the website opens
// (GET /api/auth/status, without the demo's header, so the server answers
// about this browser's own sign-in):
//   a stranger            "Register"
//   a registered account  "Open Field" or "Open Atlas" (its own workspace;
//                         leaving the demo view first, src/lib/demoMode.js),
//                         and no "Sign in"
//   the owner             "Open the demo" (the owner's workspace is the
//                         demo), and no "Sign in" (nor a second "Demo")
// Until the answer comes (or if it never does) the bar shows "Register".
//
// WHO EDITS IT
// Whoever changes the website's menu. The pages and the actions are
// listed in src/site/content/site.js.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { SITE, SITE_ACTIONS, SITE_PAGES } from "../content/site.js";
import { leaveDemo } from "../../lib/demoMode.js";
import "./nav.css";

// Who this browser is signed in as: the server's answer, or null.
function useSignedIn(pathname) {
  const [status, setStatus] = useState(null);
  // Read again whenever the page changes: a sign-in or sign-out on /owner,
  // /signin or /register must show in the bar at once.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((answer) => {
        if (alive && answer) setStatus(answer);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);
  return status;
}

// The bar's button for this visitor: { path, label, leave } (leave: step
// out of the demo view before opening), and whether to offer "Sign in".
function actionFor(status) {
  const account = status?.mode === "account" ? status.account : null;
  if (status?.mode === "owner") return { path: SITE.demoPath, label: "Open the demo", signedIn: true };
  if (account && account.profileComplete !== false && (account.product === "field" || account.product === "atlas")) {
    return account.product === "atlas" ? { path: SITE.atlasPath, label: "Open Atlas", leave: true, signedIn: true } : { path: SITE.appPath, label: "Open Field", leave: true, signedIn: true };
  }
  // Signed in but not finished registering: the Register page finishes it.
  if (account) return { ...SITE_ACTIONS.register, signedIn: true };
  return { ...SITE_ACTIONS.register, signedIn: false };
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const menuButton = useRef(null);
  const sheet = useRef(null);
  const action = actionFor(useSignedIn(pathname));

  // Close the phone menu when the page changes, keep the page from
  // scrolling behind it while it is open, let Esc close it and keep the
  // Tab key inside it. While it is open the page's root says so
  // (<html data-menu="open">): the About page's globe stops drawing then.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("site-menu-open", open);
    if (open) html.setAttribute("data-menu", "open");
    else html.removeAttribute("data-menu");
    if (!open) return () => html.classList.remove("site-menu-open");
    function onKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sheet.current) return;
      const focusable = [menuButton.current, ...sheet.current.querySelectorAll("a, button")].filter(Boolean);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      html.classList.remove("site-menu-open");
      html.removeAttribute("data-menu");
    };
  }, [open]);

  const onAction = action.leave ? leaveDemo : undefined;
  // The owner's button already leads to the demo: no second "Demo" link then.
  const demoLink = action.path !== SITE_ACTIONS.demo.path;
  const links = [...SITE_PAGES, ...(demoLink ? [SITE_ACTIONS.demo] : []), ...(action.signedIn ? [] : [SITE_ACTIONS.signin]), action];

  return (
    <header className={`sn${open ? " is-open" : ""}`}>
      <div className="sn-inner wrap">
        <Link to="/" className="sn-brand" aria-label={`${SITE.name} home`}>
          {/* The PNG, not the webp: only the PNG has a transparent background. */}
          <picture>
            <source srcSet="/site/wordmark.webp" type="image/webp" />
            <img src="/site/wordmark.png" alt={SITE.name} width="150" height="34" decoding="async" fetchPriority="high" />
          </picture>
        </Link>

        <nav className="sn-links" aria-label="Website pages">
          {SITE_PAGES.map((page) => (
            <NavLink key={page.path} to={page.path} end={page.path === "/"} className={({ isActive }) => `sn-link${isActive ? " is-active" : ""}`}>
              {page.label}
            </NavLink>
          ))}
        </nav>

        <div className="sn-right">
          {demoLink && (
            <Link to={SITE_ACTIONS.demo.path} className="sn-link sn-demo">
              {SITE_ACTIONS.demo.label}
            </Link>
          )}
          {!action.signedIn && (
            <Link to={SITE_ACTIONS.signin.path} className="sn-link sn-signin">
              {SITE_ACTIONS.signin.label}
            </Link>
          )}
          <Link to={action.path} className="btn btn-sm sn-register" onClick={onAction}>
            {action.label}
          </Link>
          <button type="button" ref={menuButton} className="sn-menu-button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open && (
        <nav id="site-menu" ref={sheet} className="sn-sheet" aria-label="Website pages">
          <ul className="sn-sheet-list">
            {links.map((page) => (
              <li key={`${page.path} ${page.label}`}>
                <NavLink
                  to={page.path}
                  end={page.path === "/"}
                  className={({ isActive }) => `sn-sheet-link${isActive ? " is-active" : ""}`}
                  onClick={() => {
                    if (page === action && onAction) onAction();
                    setOpen(false);
                  }}
                >
                  {page.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
