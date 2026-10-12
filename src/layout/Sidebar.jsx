// WHAT THIS FILE DOES
// The left sidebar: the Chernozem logo, the Field / Atlas switch, the "My
// farm" or "Ukraine" box, the page list, and the language and account rows
// at the bottom. It draws itself from src/config/navigation.js and
// highlights whichever page is open.
//
// WHO EDITS IT
// Whoever changes how the sidebar looks. To add or rename a page, edit
// src/config/navigation.js instead.

import { NavLink, Link, useLocation } from "react-router-dom";
import { Sprout, ChevronDown, Lock, Globe } from "lucide-react";
import { products, productForPath } from "../config/navigation.js";

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

      {/* "My farm" or "Ukraine". A real picker can replace this later. */}
      <button type="button" className="scope-card">
        <span className="scope-card-icon">
          <ScopeIcon size={14} />
        </span>
        <span className="scope-card-text">
          <span className="scope-card-title">{product.scope.title}</span>
          <span className="scope-card-subtitle">{product.scope.subtitle}</span>
        </span>
        <ChevronDown size={14} className="scope-card-chevron" />
      </button>

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
        <p className="sidebar-note">
          <Lock size={12} />
          {product.privacyNote}
        </p>
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
