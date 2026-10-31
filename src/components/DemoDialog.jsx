// WHAT THIS FILE DOES
// Two small pieces the public demo shows (words in src/config/navigation.js
// demoWords):
//
//   <DemoDialog />       the dialog any change opens in the demo:
//                          "This is the demo, so it can't be changed."
//                          "Register to do this on your own land."
//                          [Register] [Not now]
//                        Register opens the website's register page with
//                        the product already chosen (Field or Atlas, from
//                        the page the visitor is on). Not now, the Escape
//                        key or a click outside closes it. An account
//                        holder looking at the demo reads "Do this in your
//                        own workspace." with [Open your own workspace]
//                        instead. While the server could not be reached
//                        (the visitor is not known yet) it says that
//                        instead, with only "Close".
//                        Drawn once, by the access gate
//                        (src/components/atlas/AccessGate.jsx); buttons
//                        open it through src/state/useDemoGuard.js.
//
//   <DemoSettingsNote /> the one line at the top of both Settings pages in
//                        the demo: "This is the demo. Register to set up
//                        your own." ("Register" is the link). An account
//                        holder looking at the demo reads "This is the
//                        demo. Open your own workspace." instead, the
//                        button taking them back to their own fields or
//                        area (as the sidebar's box and the dialog do).
//                        Nothing for anyone else.
//
// WHAT THEY RECEIVE
//   DemoDialog        open (true: shown), mode (src/lib/access.js modeOf:
//                     "demo", or null while not known), onClose
//   DemoSettingsNote  nothing
//
// WHO EDITS IT
// Whoever changes how the demo says it cannot be changed.

import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Eye } from "lucide-react";
import { Button } from "./ui/index.js";
import { demoWords, productForPath } from "../config/navigation.js";
import { demoRegisterPath } from "../lib/access.js";
import { useAccess } from "../state/useAccess.js";
import { openOwnWorkspace } from "../state/useDemoGuard.js";
import "./demoDialog.css";

// The register page, with the product of the page the visitor is on.
function useRegisterPath() {
  const { pathname } = useLocation();
  return demoRegisterPath(productForPath(pathname).id);
}

export default function DemoDialog({ open, mode, onClose }) {
  const ref = useRef(null);
  const registerTo = useRegisterPath();
  // An account holder looking at the demo: their own workspace, not Register.
  const { ownHome } = useAccess();
  const offline = mode === null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // showModal keeps the keyboard inside the dialog and puts the page
      // behind it out of reach; a browser without it just shows it.
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="demo-dialog"
      aria-labelledby="demo-dialog-title"
      aria-describedby="demo-dialog-text"
      // The browser says "closed" a moment after it closed; by then the
      // dialog may already be open again (another press right after), and
      // that late word must not close it.
      onClose={() => !ref.current?.open && onClose()}
      // A click on the dim backdrop (the dialog element itself, outside its
      // inner box) closes it.
      onClick={(event) => event.target === ref.current && onClose()}
    >
      {open && (
        <div className="demo-dialog-inner">
          <h2 id="demo-dialog-title" className="demo-dialog-title">
            {offline ? demoWords.offlineTitle : demoWords.dialogTitle}
          </h2>
          <p id="demo-dialog-text" className="demo-dialog-text">
            {offline ? demoWords.offlineText : ownHome ? demoWords.dialogOwnText : demoWords.dialogText}
          </p>
          <div className="demo-dialog-actions">
            {!offline && ownHome && (
              <Button variant="primary" onClick={() => openOwnWorkspace(ownHome)}>
                {demoWords.ownWorkspace}
              </Button>
            )}
            {!offline && !ownHome && (
              <Button variant="primary" to={registerTo} onClick={onClose}>
                {demoWords.register}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {offline ? demoWords.close : demoWords.notNow}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}

export function DemoSettingsNote() {
  const { mode, ownHome } = useAccess();
  const registerTo = useRegisterPath();
  if (mode !== "demo") return null;
  // An account holder: back to their own workspace, not "Register".
  if (ownHome) {
    const { before, link, after } = demoWords.settingsOwn;
    return (
      <p className="demo-settings-note" role="note">
        <Eye size={15} aria-hidden="true" />
        <span>
          {before}
          <button type="button" className="demo-settings-own" onClick={() => openOwnWorkspace(ownHome)}>
            {link}
          </button>
          {after}
        </span>
      </p>
    );
  }
  const { before, link, after } = demoWords.settings;
  return (
    <p className="demo-settings-note" role="note">
      <Eye size={15} aria-hidden="true" />
      <span>
        {before}
        <Link to={registerTo}>{link}</Link>
        {after}
      </span>
    </p>
  );
}
