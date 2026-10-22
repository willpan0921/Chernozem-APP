// WHAT THIS FILE DOES
// The edge between a map and one of its side panels, on the two map pages
// (the Field "Fields" page and the Atlas map), so the map can be made
// bigger:
//   - a drag handle along the panel's edge: drag it to make the panel wider
//     or narrower (the map takes the rest); double-click it to go back to
//     the page's usual width. It is a focusable separator: the arrow keys
//     move it (further with Shift), Home and End make the panel its
//     smallest and largest. A thin line shows on it while the pointer is
//     over it, it has keyboard focus, or it is being dragged.
//   - a small tab on the map's edge that hides the panel, giving the map all
//     the room; while the panel is hidden the same tab brings it back.
// Both sit inside the map's box (which must be position: relative), at its
// left or right edge. The pages show them only on wide screens; on a phone
// the panels sit under the map as before.
//
// Also here, for the pages:
//   usePanel(id)             one panel's width and hidden state, remembered by
//                            this browser (src/state/usePref.js):
//                            { width, hidden, setWidth, reset, show, hide, toggle }
//                            (width is null until it is dragged: the page's own)
//   useRoom(ref, gaps, on)   the px the map and its shown panels share in the
//                            row "ref" (its width less its padding and "gaps"
//                            gaps); null while "on" is false
//
// The sums (limits, what each key does) are in src/lib/panels.js; the
// styling is the "PanelEdge" part of src/styles/components.css.
//
// WHAT IT RECEIVES
//   side      "left" or "right": where the panel is, next to the map
//   panelId   the panel element's id (aria-controls)
//   name      what the panel is, for the labels: "field details" gives
//             "Hide field details", "Show field details", "Resize field details"
//   hidden    true while the panel is hidden
//   onToggle  hides or shows the panel
//   limits    { width, min, max } (src/lib/panels.js fitPanels)
//   onResize  called with the new width while dragging, or after a key
//   onReset   a double-click on the handle: back to the usual width
//
// WHO EDITS IT
// Whoever changes how the side panels are resized or hidden.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RESIZING_CLASS, cleanPanel, dragWidth, keyWidth } from "../../lib/panels.js";
import { usePref } from "../../state/usePref.js";

const START = { width: null, hidden: false };

export function usePanel(id) {
  const [state, setState] = usePref(`chernozem.panel.${id}`, START, cleanPanel);
  return useMemo(
    () => ({
      width: state.width,
      hidden: state.hidden,
      setWidth: (width) => setState((now) => (now.width === width ? now : { ...now, width })),
      reset: () => setState((now) => (now.width === null ? now : { ...now, width: null })),
      show: () => setState((now) => (now.hidden ? { ...now, hidden: false } : now)),
      hide: () => setState((now) => (now.hidden ? now : { ...now, hidden: true })),
      toggle: () => setState((now) => ({ ...now, hidden: !now.hidden })),
    }),
    [state, setState]
  );
}

export function useRoom(ref, gaps = 0, on = true) {
  const [room, setRoom] = useState(null);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row || !on) return undefined;
    const measure = () => {
      const style = getComputedStyle(row);
      const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const gap = parseFloat(style.columnGap) || 0;
      setRoom(Math.max(0, Math.floor(row.clientWidth - padding - gap * gaps)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [ref, gaps, on]);
  return on ? room : null;
}

export default function PanelEdge({ side, panelId, name, hidden, onToggle, limits, onResize, onReset }) {
  const drag = useRef(null);
  const frame = useRef(0);
  const [dragging, setDragging] = useState(false);
  const resize = useRef(onResize);
  resize.current = onResize;

  // Ends a drag: the last position is kept, the page loses the resize cursor.
  const stop = useCallback(() => {
    const now = drag.current;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    if (now && now.next !== null) resize.current?.(now.next);
    document.documentElement.classList.remove(RESIZING_CLASS);
    setDragging(false);
  }, []);

  // A drag still going when the edge goes away (another page opened).
  useEffect(
    () => () => {
      if (!drag.current) return;
      cancelAnimationFrame(frame.current);
      document.documentElement.classList.remove(RESIZING_CLASS);
    },
    []
  );

  const onPointerDown = (event) => {
    if (event.button !== 0 || !limits) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: limits.width, min: limits.min, max: limits.max, next: null };
    document.documentElement.classList.add(RESIZING_CLASS);
    setDragging(true);
  };

  // At most one width per frame, so dragging stays smooth.
  const onPointerMove = (event) => {
    const now = drag.current;
    if (!now || event.pointerId !== now.pointerId) return;
    now.next = dragWidth({ side, startWidth: now.startWidth, startX: now.startX, x: event.clientX, min: now.min, max: now.max });
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      if (drag.current && drag.current.next !== null) resize.current?.(drag.current.next);
    });
  };

  const onPointerEnd = (event) => {
    if (drag.current && event.pointerId === drag.current.pointerId) stop();
  };

  const onKeyDown = (event) => {
    if (!limits) return;
    const next = keyWidth(event.key, { side, width: limits.width, min: limits.min, max: limits.max, shift: event.shiftKey });
    if (next === null) return;
    event.preventDefault();
    if (next !== limits.width) onResize?.(next);
  };

  const label = `${hidden ? "Show" : "Hide"} ${name}`;
  // The chevron points the way the panel goes.
  const Icon = (side === "left") === hidden ? ChevronRight : ChevronLeft;

  return (
    <>
      {!hidden && limits && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${name}`}
          aria-controls={panelId}
          aria-valuenow={limits.width}
          aria-valuemin={limits.min}
          aria-valuemax={limits.max}
          aria-valuetext={`${limits.width} pixels wide`}
          tabIndex={0}
          className={["panel-handle", `is-${side}`, dragging ? "is-dragging" : ""].filter(Boolean).join(" ")}
          title="Drag to resize. Double-click for the usual width."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onLostPointerCapture={onPointerEnd}
          onDoubleClick={() => onReset?.()}
          onKeyDown={onKeyDown}
        />
      )}
      <button
        type="button"
        className={`panel-tab is-${side}`}
        aria-expanded={!hidden}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={onToggle}
      >
        <Icon size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </>
  );
}
