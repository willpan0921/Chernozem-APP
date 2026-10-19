// WHAT THIS FILE DOES
// The left sidebar: the Chernozem logo, the Field / Atlas switch, the "My
// farm" box or (in the Atlas) the current area, the page list, and the
// language and account rows at the bottom. It draws itself from
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
// WHO EDITS IT
// Whoever changes how the sidebar looks. To add or rename a page, edit
// src/config/navigation.js instead.

import { NavLink, Link, useLocation } from "react-router-dom";
import { Sprout, ChevronDown, Lock, Globe } from "lucide-react";
import { products, productForPath } from "../config/navigation.js";
import { useFieldData } from "../state/FieldData.jsx";
import { farmLine } from "../lib/field/format.js";
import { useAtlasData } from "../state/AtlasData.jsx";
import { formatHaShort } from "../lib/format.js";

// The Atlas area box: name and cropland of the current area.
function AtlasScope({ icon: Icon }) {
  const { status, area, runs, job } = useAtlasData();
  const running = job?.status === "running" && job.areaId === area?.id;
  let title = area?.name || "No area yet";
  let subtitle = "";
  if (status === "loading") {
    title = "Loading…";
    subtitle = "";
  } else if (running) {
    subtitle = `Analyzing · ${job.done} of ${job.total}`;
  } else if (area && runs[0]?.totals) {
    subtitle = `${formatHaShort(runs[0].totals.croplandHa)} cropland`;
  } else if (area) {
    subtitle = "Not analyzed yet";
  }
  return (
    <Link to="/atlas/settings" className="scope-card" title="Change area">
      <span className="scope-card-icon">
        <Icon size={14} />
      </span>
      <span className="scope-card-text">
        <span className="scope-card-title">{title}</span>
        {subtitle && <span className="scope-card-subtitle">{subtitle}</span>}
      </span>
      <ChevronDown size={14} className="scope-card-chevron" />
    </Link>
  );
}

// The Field farm box: the farm's name and its fields and area.
function FieldScope({ icon: Icon }) {
  const { status, farm, job } = useFieldData();
  let title = farm?.name || "No farm yet";
  let subtitle = farm ? farmLine(farm) : "Set it up";
  if (status === "loading" && !farm) {
    title = "Loading…";
    subtitle = "";
  } else if (farm && job?.status === "running" && job.kind === "field-analyze") {
    subtitle = `Analysing · ${job.done || 0} of ${job.total || 1}`;
  }
  return (
    <Link to="/field/settings" className="scope-card" title="Change farm">
      <span className="scope-card-icon">
        <Icon size={14} />
      </span>
      <span className="scope-card-text">
        <span className="scope-card-title">{title}</span>
        {subtitle && <span className="scope-card-subtitle">{subtitle}</span>}
      </span>
      <ChevronDown size={14} className="scope-card-chevron" />
    </Link>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const product = productForPath(pathname);
  const ScopeIcon = product.scope.icon;

  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar-brand">
        <span className="sidebar-logo">
          <Sprout size={15} strokeWidth={2.4} />
        </span>
        Chernozem
      </Link>

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
      {product.id === "atlas" ? <AtlasScope icon={ScopeIcon} /> : <FieldScope icon={ScopeIcon} />}

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
            >
              <Icon size={15} />
              {page.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        {product.id !== "atlas" && product.privacyNote && (
          <p className="sidebar-note">
            <Lock size={12} />
            {product.privacyNote}
          </p>
        )}
        <button type="button" className="sidebar-language">
          <Globe size={14} />
          <span>English</span>
          <ChevronDown size={14} />
        </button>
        <Link to={`${product.basePath}/settings`} className="sidebar-account">
          <span className={`avatar avatar-${product.account.tone}`}>
            {product.account.initials}
          </span>
          {product.account.label}
        </Link>
      </div>
    </aside>
  );
}
