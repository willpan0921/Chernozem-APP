// WHAT THIS FILE DOES
// The one rule every button that would change something follows in the
// public demo (read-only, src/lib/access.js):
//
//   const { readOnly, guard, ask, lock, lockList } = useDemoGuard();
//   <Button onClick={guard(() => actions.analyze())}>Analyse now</Button>
//
//   guard(action)  gives back a function that, in the demo, opens the small
//                  dialog "This is the demo, so it can't be changed.
//                  Register to do this on your own land." [Register]
//                  [Not now] (src/components/DemoDialog.jsx) instead of
//                  running the action; for everyone else it simply runs it
//   ask()          opens that dialog by itself
//   readOnly       true in the demo
//
// On the Settings pages a control should also LOOK turned off in the demo
// (the values stay readable), and still answer when someone tries it:
//   lock(action)   the props for a button: in the demo it looks turned off
//                  (aria-disabled, dimmed: data-demo-locked) and a press
//                  opens the dialog; otherwise just onClick={action}.
//                    <Button {...lock(onChangeFarm)}>Change farm</Button>
//   lockList()     the same for a <select>: in the demo it looks turned off
//                  and opening it opens the dialog instead of the list (on a
//                  touch screen the list may still open: give its onChange
//                  guard(...) too, so picking opens the dialog and the
//                  choice snaps back).
//
// Also here: openOwnWorkspace(home), for an account holder looking at the
// demo (useAccess().ownHome): this tab stops looking at the demo and opens
// their own fields or area, the page loading afresh so none of the demo's
// data stays on screen. The sidebar's demo box and the dialog use it.
//
// The dialog is drawn once, by the access gate
// (src/components/atlas/AccessGate.jsx). Two safety nets open it too, so
// nothing slips through:
//   - refuseInDemo(): the shared data layers (src/state/AtlasData.jsx,
//     src/state/FieldData.jsx) call it instead of the server for any change
//     asked in the demo; it opens the dialog and gives back the refusal to
//     throw, with the same words and code as the server's
//   - any server answer 403 "demo_read_only" (src/api/atlasApi.js
//     DEMO_READ_ONLY_EVENT)
//
// WHO EDITS IT
// Nobody, normally. The words are in src/config/navigation.js (demoWords);
// the dimmed look is "[data-demo-locked]" in src/styles/components.css.

import { createContext, useCallback, useContext } from "react";
import { ApiError, DEMO_READ_ONLY_EVENT } from "../api/atlasApi.js";
import { DEMO_READ_ONLY_TEXT } from "../config/navigation.js";
import { DEMO_READ_ONLY_CODE } from "../lib/access.js";
import { leaveDemo } from "../lib/demoMode.js";
import { useAccess } from "./useAccess.js";

// What the gate gives: ask() opens the dialog. Outside the gate nothing
// opens (and nothing there changes the demo's data either).
export const DemoGuardContext = createContext({ ask: () => {} });

// The keys that open a <select>'s list.
const LIST_KEYS = new Set([" ", "Enter", "ArrowUp", "ArrowDown"]);

export function useDemoGuard() {
  const { readOnly } = useAccess();
  const { ask } = useContext(DemoGuardContext);
  const guard = useCallback(
    (action) =>
      (...args) => {
        if (readOnly) {
          ask();
          return undefined;
        }
        return action?.(...args);
      },
    [readOnly, ask]
  );
  const lock = useCallback(
    (action) =>
      readOnly
        ? {
            "aria-disabled": true,
            "data-demo-locked": "",
            onClick: (event) => {
              event?.preventDefault?.();
              ask();
            },
          }
        : { onClick: action },
    [readOnly, ask]
  );
  const lockList = useCallback(
    () =>
      readOnly
        ? {
            "aria-disabled": true,
            "data-demo-locked": "",
            onMouseDown: (event) => {
              event.preventDefault();
              ask();
            },
            onKeyDown: (event) => {
              if (!LIST_KEYS.has(event.key)) return;
              event.preventDefault();
              ask();
            },
          }
        : {},
    [readOnly, ask]
  );
  return { readOnly: Boolean(readOnly), guard, ask, lock, lockList };
}

// "Open your own workspace" (see the top of this file).
export function openOwnWorkspace(home) {
  leaveDemo();
  window.location.assign(home);
}

// The app's own refusal of a change in the demo: the dialog opens, and the
// caller throws what this gives back (an ApiError, code "demo_read_only").
export function refuseInDemo() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DEMO_READ_ONLY_EVENT));
  return new ApiError(DEMO_READ_ONLY_TEXT, { code: DEMO_READ_ONLY_CODE, status: 403 });
}
