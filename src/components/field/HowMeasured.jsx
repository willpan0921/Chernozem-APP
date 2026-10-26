// WHAT THIS FILE DOES
// The small "How it's measured" link and the panel it opens: what each
// number on the page is, its formula and the data it comes from, in a few
// plain lines. Used on the Fields page (fieldMethods) and on the Atlas map
// (atlasMethods, through src/components/atlas/MapLegend.jsx). The words
// are in src/config/research.js; the long version is docs/METHODS.md.
//
// WHAT IT RECEIVES
//   methods    { title, intro, items: [{ id, name, what, formula, source }], note, limits, sources,
//                priority? }: priority (the Atlas) = { title, intro, frames:
//                [{ id, name, tag, what, steps, formula }], blend, scale }
//   label      the link's text (default "How it's measured")
//   className  extra class names for the link (optional)
//
// The panel is a native <dialog> (Esc and the close button close it;
// clicking outside it does too). Its styles are howMeasured.css next to
// this file (every class starts "hm-"), so the Atlas does not load the
// Field styles.
//
// WHO EDITS IT
// Whoever changes how the panel looks. Change the words in research.js.

import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import "./howMeasured.css";

export default function HowMeasured({ methods, label = "How it's measured", className = "" }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  if (!methods) return null;
  return (
    <>
      <button type="button" className={["hm-link", className].filter(Boolean).join(" ")} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Info size={13} aria-hidden="true" />
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="hm-dialog"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the backdrop (the dialog element itself) closes it.
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        {open && (
          <div className="hm-body">
            <div className="hm-head">
              <h2 id={titleId}>{methods.title}</h2>
              <button type="button" className="hm-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            {methods.intro && <p className="hm-intro">{methods.intro}</p>}
            <dl className="hm-items">
              {methods.items.map((item) => (
                <div key={item.id} className="hm-item">
                  <dt>{item.name}</dt>
                  <dd>
                    <p className="hm-what">{item.what}</p>
                    {item.formula && <p className="hm-formula">{item.formula}</p>}
                    {item.source && <p className="hm-source">{item.source}</p>}
                  </dd>
                </div>
              ))}
            </dl>
            {methods.priority && (
              <section className="hm-priority" aria-label={methods.priority.title}>
                <h3>{methods.priority.title}</h3>
                {methods.priority.intro && <p className="hm-intro">{methods.priority.intro}</p>}
                <div className="hm-frames">
                  {methods.priority.frames.map((frame) => (
                    <div key={frame.id} className="hm-frame">
                      <p className="hm-frame-head">
                        <strong>{frame.name}</strong>
                        {frame.tag && <span className="hm-tag">{frame.tag}</span>}
                      </p>
                      <p className="hm-what">{frame.what}</p>
                      <ol className="hm-steps">
                        {frame.steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                      {frame.formula && <p className="hm-formula">{frame.formula}</p>}
                    </div>
                  ))}
                </div>
                {methods.priority.blend && <p className="hm-note">{methods.priority.blend}</p>}
                {methods.priority.scale && <p className="hm-note">{methods.priority.scale}</p>}
              </section>
            )}
            {methods.note && <p className="hm-note">{methods.note}</p>}
            {methods.limits && <p className="hm-limits">{methods.limits}</p>}
            {methods.sources && <p className="hm-sources">{methods.sources}</p>}
          </div>
        )}
      </dialog>
    </>
  );
}
