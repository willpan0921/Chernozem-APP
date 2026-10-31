// WHAT THIS FILE DOES
// The left sidebar: the Chernozem logo, "Back to the website", the Field /
// Atlas switch, the "My farm" box or (in the Atlas) the current area, the
// page list, and at the bottom the demo box or the account row. It draws
// itself from src/config/navigation.js and highlights whichever page is
// open.
//
// In the Atlas the area box is live: the current area's name and its
// cropland from the latest run (src/state/AtlasData.jsx), or "No area yet".
// Clicking it opens Atlas Settings, where the area is changed.
//
// On the Field side the box shows the farm: its name and "7 fields · 336 ha"
// (in the farm's unit) from src/state/FieldData.jsx, or "No farm yet".
// Clicking it opens Field Settings, where the farm is changed.
//
// "BACK TO THE WEBSITE" (everyone): under the logo, back to the public
// website's front page (/). It also ends this tab's choice to look at the
// demo (src/lib/demoMode.js leaveDemo). In the rail it is an arrow with a
// tooltip; on a phone it sits at the right of the logo's row.
//
// WHO IS LOOKING (src/state/useAccess.js, rules in src/lib/access.js):
//   The demo     the Field / Atlas switch, and at the bottom the demo box:
//                "Demo · Ukraine, read-only", "Everyone sees this farm"
//                (or area), "Register" (the website's register page, the
//                product already chosen) and "Sign in". An account holder
//                looking at the demo gets "Open your own workspace" instead
//                of both: back to their own fields or area. No account row
//                and no "Sign out": the demo has no account.
//   The owner    the switch, "You are editing the demo", the demo's
//                "Account" / "Regional office" row and "Sign out".
//   Open         (one's own computer, no key set) the switch, "Your fields
//                are private" on the Field side, the same row; nothing to
//                sign out of.
//   An account   no switch (they chose one product when they registered;
//                src/components/ProductGuard.jsx keeps them on it), "Your
//                fields are private to your account", their own name and
//                initials in the row, and "Sign out".
// While the visitor is not known (the server could not be reached): the
// switch and the row as before, no note, no "Sign out".
//
// "Sign out" ends the sign-in on the server (and Firebase's, for an
// account) and goes back to the website, the page loading afresh so
// nothing of the account stays in this tab.
//
// FOLDED TO A RAIL (wider screens): the button next to the logo folds the
// sidebar to a narrow rail of icons (and unfolds it again), so the pages,
// the maps above all, get nearly the whole screen. In the rail every item
// keeps its name for screen readers (aria-label) and shows it in a small
// tooltip on hover or keyboard focus; the Field / Atlas switch stacks its
// two words. The farm / area box becomes a grey map pin (its tooltip:
// "Demo farm · 10 fields · 437 ha · Change farm"), so it never looks like
// a second "Fields" or "Atlas" page; the demo box becomes a green
// "Register" icon (a house for "Open your own workspace"). The choice is
// kept by AppShell.jsx. On a phone the sidebar sits above the page and
// never folds.
//
// WHAT IT RECEIVES
//   collapsed  true: drawn as the rail
//   onToggle   folds or unfolds it
//
// WHO EDITS IT
// Whoever changes how the sidebar looks. To add or rename a page, edit
// src/config/navigation.js instead; the demo's words are demoWords there.

import { useEffect, useState } from "react";
import Logo from "../components/ui/Logo.jsx";
import { NavLink, Link, useLocation } from "react-router-dom";
import { ArrowLeft, ChevronDown, Eye, House, Lock, LogOut, MapPin, PanelLeftClose, PanelLeftOpen, UserPlus, Users } from "lucide-react";
import { Button } from "../components/ui/index.js";
import { demoWords, products, productForPath } from "../config/navigation.js";
import { signOut } from "../api/atlasApi.js";
import { accountLabel, backToWebsitePath, canSignOut, canSwitchProduct, demoRegisterPath, showDemoNote, sidebarNoteFor } from "../lib/access.js";
import { leaveDemo } from "../lib/demoMode.js";
import { useAccess } from "../state/useAccess.js";
import { openOwnWorkspace } from "../state/useDemoGuard.js";
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

// "Back to the website": the public website's front page, leaving the
// demo view of this tab behind.
function BackToWebsite({ collapsed, tipFor }) {
  return (
    <Link
      to={backToWebsitePath()}
      className="sidebar-back"
      onClick={leaveDemo}
      aria-label={collapsed ? demoWords.back : undefined}
      {...tipFor(demoWords.back)}
    >
      <ArrowLeft size={15} aria-hidden="true" />
      <span className="sidebar-label">{demoWords.back}</span>
    </Link>
  );
}

// The demo box at the bottom: what this is, and the way to one's own.
//   note     the product's demo words ("Everyone sees this farm")
//   ownHome  an account holder's own workspace, else null: then "Open your
//            own workspace" takes the place of Register and Sign in (they
//            already have an account)
function DemoBox({ productId, note, ownHome, collapsed, tipFor }) {
  const registerTo = demoRegisterPath(productId);
  if (collapsed) {
    const tip = `${demoWords.note} · ${ownHome ? demoWords.ownWorkspace : demoWords.register}`;
    return (
      <div className="sidebar-demo is-rail">
        {ownHome ? (
          <button type="button" className="sidebar-demo-icon is-primary" onClick={() => openOwnWorkspace(ownHome)} aria-label={tip} {...tipFor(tip)}>
            <House size={16} aria-hidden="true" />
          </button>
        ) : (
          <Link to={registerTo} className="sidebar-demo-icon is-primary" aria-label={tip} {...tipFor(tip)}>
            <UserPlus size={16} aria-hidden="true" />
          </Link>
        )}
      </div>
    );
  }
  return (
    <section className="sidebar-demo" aria-label="Demo">
      <p className="sidebar-demo-title">
        <Eye size={13} aria-hidden="true" />
        {demoWords.note}
      </p>
      {note && <p className="sidebar-demo-text">{note.text}</p>}
      <div className="sidebar-demo-actions">
        {ownHome ? (
          <Button variant="primary" size="sm" icon={<House size={13} aria-hidden="true" />} className="sidebar-demo-register is-own" onClick={() => openOwnWorkspace(ownHome)}>
            {demoWords.ownWorkspace}
          </Button>
        ) : (
          <>
            <Button variant="primary" size="sm" to={registerTo} className="sidebar-demo-register">
              {demoWords.register}
            </Button>
            <Link to="/signin" className="sidebar-demo-signin">
              {demoWords.signIn}
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

// "Sign out": the server removes this browser's sign-in, then the website's
// front page opens afresh. If the server cannot be reached the browser stays
// signed in (the page cannot remove the sign-in by itself), so it says so.
function SignOutButton({ collapsed, tipFor, hideTip, account = false }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = failed ? "Could not sign out: try again" : "Sign out";
  async function leave() {
    if (busy) return;
    hideTip();
    setBusy(true);
    setFailed(false);
    try {
      await signOut({ account });
      window.location.assign(backToWebsitePath());
    } catch {
      setFailed(true);
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
  const access = useAccess();
  const { account, ownHome } = access;
  const demo = showDemoNote(access);
  const note = sidebarNoteFor(product.privacyNote, access);
  const NoteIcon = note?.kind === "owner" ? Users : Lock;
  // The account row: the person's own name for an account, the demo's
  // "Account" / "Regional office" otherwise.
  const who = account ? accountLabel(account) : product.account;

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

      <BackToWebsite collapsed={collapsed} tipFor={tipFor} />

      {/* Field / Atlas switch: the demo, the owner, one's own computer. An
          account has one product. */}
      {canSwitchProduct(access) && (
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
      )}

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
        {demo ? (
          <DemoBox productId={product.id} note={note} ownHome={ownHome} collapsed={collapsed} tipFor={tipFor} />
        ) : (
          <>
            {note && (
              <p className="sidebar-note">
                <NoteIcon size={12} aria-hidden="true" />
                {note.text}
              </p>
            )}
            <Link
              to={`${product.basePath}/settings`}
              className="sidebar-account"
              aria-label={collapsed ? who.label : undefined}
              title={collapsed || !account ? undefined : who.label}
              {...tipFor(who.label)}
            >
              <span className={`avatar avatar-${product.account.tone}`}>
                {who.initials}
              </span>
              <span className="sidebar-label">{who.label}</span>
            </Link>
          </>
        )}
        {canSignOut(access) && <SignOutButton collapsed={collapsed} tipFor={tipFor} hideTip={hideTip} account={Boolean(account)} />}
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
