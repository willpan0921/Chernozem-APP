// WHAT THIS FILE DOES
// Keeps a registered account inside its own product. The app has two
// products with their own addresses: Field under /field and the Atlas
// under /atlas. The demo visitor (the access code) may use both; a person
// registered on the website chose one when they registered. One of these
// sits around each group of routes in src/App.jsx:
//
//   <Route element={<ProductGuard product="field" />}> ...the Field pages
//   <Route element={<ProductGuard product="atlas" />}> ...the Atlas pages
//
// When an Atlas account opens any Field address (or the other way round),
// it is sent to the start of its own product instead, every address
// included (the report page and the "any other address" catch-alls too).
// Everyone else passes straight through.
//
// WHAT IT RECEIVES
//   product   "field" | "atlas": the product of the routes inside it
//
// WHO EDITS IT
// Nobody, normally. The rule itself is productFor / homePathFor in
// src/lib/access.js; who the visitor is comes from src/state/useAccess.js.

import { Navigate, Outlet } from "react-router-dom";
import { homePathFor, productFor } from "../lib/access.js";
import { useAccess } from "../state/useAccess.js";

export default function ProductGuard({ product }) {
  const access = useAccess();
  const own = productFor(access);
  if (own && own !== product) return <Navigate to={homePathFor(access)} replace />;
  return <Outlet />;
}
