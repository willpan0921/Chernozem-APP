// WHAT THIS FILE DOES
// The website's menu bar: a plain bar on the page ground with the wordmark
// at the left, the four pages in the middle, and at the right the text
// link "Demo" and the button "Register". Nothing in it animates. On a
// phone it shows the wordmark, "Register" and a text button "Menu" that
// opens a full-screen sheet with all six links.
//
// WHO EDITS IT
// Whoever changes the website's menu. The pages and the two actions are
// listed in src/site/content/site.js.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { SITE, SITE_ACTIONS, SITE_PAGES } from "../content/site.js";
import "./nav.css";

export default function Nav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const menuButton = useRef(null);
  const sheet = useRef(null);

  // Close the phone menu when the page changes, keep the page from
  // scrolling behind it while it is open, let Esc close it and keep the
  // Tab key inside it.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle("site-menu-open", open);
    if (!open) return () => document.documentElement.classList.remove("site-menu-open");
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
      document.documentElement.classList.remove("site-menu-open");
    };
  }, [open]);

  const links = [...SITE_PAGES, SITE_ACTIONS.demo, SITE_ACTIONS.register];

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
          <Link to={SITE_ACTIONS.demo.path} className="sn-link sn-demo">
            {SITE_ACTIONS.demo.label}
          </Link>
          <Link to={SITE_ACTIONS.register.path} className="btn btn-sm sn-register">
            {SITE_ACTIONS.register.label}
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
              <li key={page.path}>
                <NavLink to={page.path} end={page.path === "/"} className={({ isActive }) => `sn-sheet-link${isActive ? " is-active" : ""}`} onClick={() => setOpen(false)}>
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
