// WHAT THIS FILE DOES
// The frame every page sits in: the sidebar on the left and the current page
// on the right. The router (src/App.jsx) puts the page into <Outlet />.
//
// On wider screens the sidebar can be folded to a narrow rail of icons (the
// button at its top), so a map page gets nearly the whole screen. This
// browser remembers the choice (src/state/usePref.js). On a phone the
// sidebar sits on top of the page as before and does not fold.
//
// WHO EDITS IT
// Nobody, normally. To change the sidebar, edit src/layout/Sidebar.jsx.

import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import { cleanBoolean } from "../lib/prefs.js";
import { useMedia } from "../state/useMedia.js";
import { usePref } from "../state/usePref.js";

export default function AppShell() {
  const [folded, setFolded] = usePref("chernozem.nav.collapsed", false, cleanBoolean);
  // A phone never shows the rail (the sidebar sits above the page there).
  const phone = useMedia("(max-width: 860px)");
  const collapsed = folded && !phone;
  return (
    <div className={collapsed ? "shell is-nav-collapsed" : "shell"}>
      <Sidebar collapsed={collapsed} onToggle={() => setFolded(!collapsed)} />
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
