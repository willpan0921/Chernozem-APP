// WHAT THIS FILE DOES
// The frame every page sits in: the sidebar on the left and the current page
// on the right. The router (src/App.jsx) puts the page into <Outlet />.
//
// WHO EDITS IT
// Nobody, normally. To change the sidebar, edit src/layout/Sidebar.jsx.

import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";

export default function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
