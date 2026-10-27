// WHAT THIS FILE DOES
// The left sidebar: the Chernozem logo, the Field / Atlas switch, the "My
// farm" box or (in the Atlas) the current area, the page list, and the
// account row at the bottom. It draws itself from
// src/config/navigation.js and highlights whichever page is open.
//
// In the Atlas the area box is live: the current area's name and its
// cropland from the latest run (src/state/AtlasData.jsx), or "No area yet".
// Clicking it opens Atlas Settings, where the area is changed.
//
// On the Field side the box shows the farm: its name and "7 fields · 336 ha"
// (in the farm's unit) from src/state/FieldData.jsx, or "No farm yet".
// Clicking it opens Field Settings, where the farm is changed.
//
// The note above the account row says who sees the farm: "Your fields are
// private" on one's own computer, or "Shared with everyone who has the
// access code" when the owner set one (src/config/navigation.js,
// src/state/useAccess.js). No note while that is not known.
//
// "Sign out" under the account row, only when an access code is set (on a
// shared computer, so the next person needs the code again): the access
// card comes back (src/components/atlas/AccessGate.jsx). Without a code
// there is nothing to sign out of, so it is not shown.
//
// FOLDED TO A RAIL (wider screens): the button next to the logo folds the
// sidebar to a narrow rail of icons (and unfolds it again), so the pages,
// the maps above all, get nearly the whole screen. In the rail every item
// keeps its name for screen readers (aria-label) and shows it in a small
// tooltip on hover or keyboard focus; the Field / Atlas switch stacks its
// two words. The farm / area box becomes a grey map pin (its tooltip:
// "Demo farm · 10 fields · 437 ha · Change farm"), so it never looks like
// a second "Fields" or "Atlas" page. The choice is kept by AppShell.jsx. On
// a phone the sidebar sits above the page and never folds.
//
// WHAT IT RECEIVES
//   collapsed  true: drawn as the rail
//   onToggle   folds or unfolds it
//
// WHO EDITS IT
// Whoever changes how the sidebar looks. To add or rename a page, edit
// src/config/navigation.js instead.

import { useEffect, useState } from "react";
import Logo from "../components/ui/Logo.jsx";
import { NavLink, Link, useLocation } from "react-router-dom";
import { ChevronDown, Lock, LogOut, MapPin, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import { products, productForPath } from "../config/navigation.js";
import { signOut } from "../api/atlasApi.js";
import { canSignOut, privacyNoteFor } from "../lib/access.js";
import { useAccess } from "../state/useAccess.js";
import { useFieldData } from "../state/FieldData.jsx";
import { farmLine } from "../lib/field/format.js";
import { useAtlasData } from "../state/AtlasData.jsx";
import { formatHaShort } from "../lib/format.js";

// The rail's tooltips: one small label beside the item under the pointer
// (or focused with the keyboard). It is fixed to the window, so the
// sidebar's scrolling never cuts it off.
function useRailTips(on) {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    if (!on) setTip(null);
  }, [on]);
  const show = (element, text) => {
    const box = element.getBoundingClientRect();
    setTip({ text, top: box.top + box.height / 2, left: box.right + 10 });
  };
  // Spread on an item: tipFor("Fields").
  const tipFor = (text) =>
    on && text
      ? {
          onMouseEnter: (event) => show(event.currentTarget, text),
          onMouseLeave: () => setTip(null),
          onFocus: (event) => event.currentTarget.matches(":focus-visible") && show(event.currentTarget, text),
          onBlur: () => setTip(null),
        }
      : {};
  return { tip, tipFor, hideTip: () => setTip(null) };
}

// The Atlas area box: name and cropland of the current area.
function AtlasScope({ icon: Icon, collapsed, tipFor }) {
  const { status, area, runs, job } = useAtlasData();
  const running = job?.status === "running" && job.areaId === area?.id;
  let title = area?.name || "No area yet";
  let subtitle = "";
  if (status === "loading") {
    title = "Loading…";
    subtitle = "";
  } else if (running) {
    // One area at a time: an analysis can wait for another area's first.
    subtitle = job.queued ? "Waiting to analyze" : `Analyzing · ${job.done} of ${job.total}`;
  } else if (area && runs[0]?.totals) {
    subtitle = `${formatHaShort(runs[0].totals.croplandHa)} cropland`;
  } else if (area) {
    subtitle = "Not analyzed yet";
  }
  return <ScopeCard to="/atlas/settings" change="Change area" icon={Icon} title={title} subtitle={subtitle} collapsed={collapsed} tipFor={tipFor} />;
}

// The Field farm box: the farm's name and its fields and area.
function FieldScope({ icon: Icon, collapsed, tipFor }) {
  const { status, farm, job } = useFieldData();
  let title = farm?.name || "No farm yet";
  let subtitle = farm ? farmLine(farm) : "Set it up";
  if (status === "loading" && !farm) {
    title = "Loading…";
    subtitle = "";
  } else if (farm && job?.status === "running" && job.kind === "field-analyze") {
    subtitle = `Analysing · ${job.done || 0} of ${job.total || 1}`;
  }
  return <ScopeCard to="/field/settings" change="Change farm" icon={Icon} title={title} subtitle={subtitle} collapsed={collapsed} tipFor={tipFor} />;
}

// "Sign out": the server removes this browser's sign-in, and the access card
// comes back. If the server cannot be reached the browser stays signed in
// (the page cannot remove the sign-in by itself), so it says so.
function SignOutButton({ collapsed, tipFor, hideTip }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = failed ? "Could not sign out: try again" : "Sign out";
  async function leave() {
    if (busy) return;
    hideTip();
    setBusy(true);
    setFailed(false);
    try {
      // On success the access card replaces the whole app.
      await signOut();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="sidebar-signout"
        onClick={leave}
        disabled={busy}
        aria-label={collapsed ? label : undefined}
        {...tipFor(label)}
      >
        <LogOut size={15} aria-hidden="true" />
        <span className="sidebar-label">{busy ? "Signing out…" : "Sign out"}</span>
      </button>
      {failed && (
        <p className="sidebar-note sidebar-note-error" role="alert">
          Could not reach the server, so this browser is still signed in. Try again.
        </p>
      )}
    </>
  );
}

// In the rail the box shows a grey map pin, not the product's icon (the
// same as its "Fields" / "Atlas" page), so the two are never confused.
function ScopeCard({ to, change, icon: Icon, title, subtitle, collapsed, tipFor }) {
  const name = [title, subtitle].filter(Boolean).join(" · ");
  const Shown = collapsed ? MapPin : Icon;
  return (
    <Link to={to} className="scope-card" title={collapsed ? undefined : change} aria-label={collapsed ? `${name}. ${change}` : undefined} {...tipFor(`${name} · ${change}`)}>
      <span className="scope-card-icon">
        <Shown size={14} />
      </span>
      <span className="scope-card-text">
        <span className="scope-card-title">{title}</span>
        {subtitle && <span className="scope-card-subtitle">{subtitle}</span>}
      </span>
      <ChevronDown size={14} className="scope-card-chevron" />
    </Link>
  );
}

export default function Sidebar({ collapsed = false, onToggle }) {
  const { pathname } = useLocation();
  const product = productForPath(pathname);
  const ScopeIcon = product.scope.icon;
  const { tip, tipFor, hideTip } = useRailTips(collapsed);
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const { shared } = useAccess();
  const note = product.id !== "atlas" ? privacyNoteFor(product.privacyNote, shared) : null;
  const NoteIcon = note?.kind === "shared" ? Users : Lock;

  return (
    <aside id="app-sidebar" className={collapsed ? "sidebar is-rail" : "sidebar"} onScroll={hideTip}>
      <div className="sidebar-top">
        <Link to="/" className="sidebar-brand" aria-label={collapsed ? "Chernozem" : undefined} {...tipFor("Chernozem")}>
          <span className="sidebar-logo">
            <Logo size={30} />
          </span>
          <span className="sidebar-label">Chernozem</span>
        </Link>
        {onToggle && (
          <button
            type="button"
            className="sidebar-toggle"
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            aria-label={toggleLabel}
            title={collapsed ? undefined : toggleLabel}
            onClick={() => {
              hideTip();
              onToggle();
            }}
            {...tipFor(toggleLabel)}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>

      {/* Field / Atlas switch. */}
      <nav className="product-switch" aria-label="Product">
        {Object.values(products).map((item) => (
          <Link
            key={item.id}
            to={item.basePath}
            className={
              item.id === product.id
                ? "product-switch-option is-active"
                : "product-switch-option"
            }
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* The farm, or the Atlas's current area. */}
      {product.id === "atlas" ? (
        <AtlasScope icon={ScopeIcon} collapsed={collapsed} tipFor={tipFor} />
      ) : (
        <FieldScope icon={ScopeIcon} collapsed={collapsed} tipFor={tipFor} />
      )}

      {/* The page list. "end" stops the Overview link from staying lit on
          every page under it. */}
      <nav className="sidebar-nav" aria-label="Pages">
        {product.pages.map((page) => {
          const Icon = page.icon;
          return (
            <NavLink
              key={page.id}
              to={page.path}
              end
              className={({ isActive }) => (isActive ? "nav-item is-active" : "nav-item")}
              aria-label={collapsed ? page.label : undefined}
              {...tipFor(page.label)}
            >
              <Icon size={15} />
              <span className="sidebar-label">{page.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        {note && (
          <p className="sidebar-note">
            <NoteIcon size={12} aria-hidden="true" />
            {note.text}
          </p>
        )}
        <Link
          to={`${product.basePath}/settings`}
          className="sidebar-account"
          aria-label={collapsed ? product.account.label : undefined}
          {...tipFor(product.account.label)}
        >
          <span className={`avatar avatar-${product.account.tone}`}>
            {product.account.initials}
          </span>
          <span className="sidebar-label">{product.account.label}</span>
        </Link>
        {canSignOut(shared) && <SignOutButton collapsed={collapsed} tipFor={tipFor} hideTip={hideTip} />}
      </div>

      {/* Only for the eye: each item already carries its name (aria-label). */}
      {tip && (
        <span className="rail-tip" aria-hidden="true" style={{ top: tip.top, left: tip.left }}>
          {tip.text}
        </span>
      )}
    </aside>
  );
}
