// WHAT THIS FILE DOES
// The website's menu bar: the pin and the name on the left, the pages in
// the middle, "Open the app" on the right. It floats over the page as a
// dark glass strip and turns a little more solid once the page is scrolled.
// On a phone the pages fold into a full-screen menu behind the button at
// the right.
//
// WHO EDITS IT
// Whoever changes the website's menu. The pages are listed in
// src/site/content/site.js.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import Logo from "../../components/ui/Logo.jsx";
import { SITE, SITE_PAGES } from "../content/site.js";
import { useScrolled } from "../hooks.js";
import "./nav.css";

const menu = {
  closed: { opacity: 0, transition: { duration: 0.25, when: "afterChildren" } },
  open: { opacity: 1, transition: { duration: 0.3, staggerChildren: 0.06, delayChildren: 0.1 } },
};

const item = {
  closed: { opacity: 0, y: 18, transition: { duration: 0.18 } },
  open: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

export default function Nav() {
  const scrolled = useScrolled(16);
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const burgerRef = useRef(null);
  const menuRef = useRef(null);

  // Close the phone menu when the page changes, and keep the page from
  // scrolling behind it while it is open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.classList.toggle("site-menu-open", open);
    if (!open) return () => document.documentElement.classList.remove("site-menu-open");
    // Esc closes the menu; Tab stays inside it while it is open.
    function onKey(event) {
      if (event.key === "Escape") {
        setOpen(false);
        burgerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = [burgerRef.current, ...menuRef.current.querySelectorAll("a, button")].filter(Boolean);
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

  return (
    <header className={`sn${scrolled ? " is-scrolled" : ""}${open ? " is-open" : ""}`}>
      <div className="sn-inner wrap">
        <Link to="/" className="sn-brand" aria-label="Chernozem home">
          <Logo size={30} />
          <span className="sn-word">{SITE.name}</span>
        </Link>

        <nav className="sn-links" aria-label="Website pages">
          {SITE_PAGES.map((page) => (
            <NavLink key={page.path} to={page.path} className={({ isActive }) => `sn-link${isActive ? " is-active" : ""}`}>
              {page.label}
            </NavLink>
          ))}
        </nav>

        <div className="sn-right">
          <Link to={SITE.appPath} className="btn btn-light btn-sm sn-cta">
            Open the app
          </Link>
          <button
            type="button"
            ref={burgerRef}
            className="sn-burger"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close the menu" : "Open the menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav id="site-menu" ref={menuRef} className="sn-menu" variants={menu} initial="closed" animate="open" exit="closed" aria-label="Website pages">
            <motion.ul className="sn-menu-list">
              {[{ path: "/", label: "Home" }, ...SITE_PAGES].map((page) => (
                <motion.li key={page.path} variants={item}>
                  <NavLink to={page.path} end={page.path === "/"} className={({ isActive }) => `sn-menu-link${isActive ? " is-active" : ""}`} onClick={() => setOpen(false)}>
                    {page.label}
                  </NavLink>
                </motion.li>
              ))}
              <motion.li variants={item} className="sn-menu-cta">
                <Link to={SITE.appPath} className="btn btn-primary btn-lg" onClick={() => setOpen(false)}>
                  Open the app
                </Link>
              </motion.li>
            </motion.ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
