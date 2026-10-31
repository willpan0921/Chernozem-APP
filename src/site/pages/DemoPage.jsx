// WHAT THIS FILE DOES
// The website's demo page (chernozem.app/demo): the way into the Ukraine
// demo, which is open to everyone and read-only. Two large doors, Open
// Field and Open Atlas: each is one link, pictures included, so a click
// anywhere on it opens the app. Before the app opens, the door tells this
// tab to show the demo (enterDemo(), src/lib/demoMode.js), so a visitor who
// has an account of their own still lands in the demo. Under the doors,
// one line and the Register button for a workspace of one's own. Nothing
// else: no code, no list of what is inside.
//
// The doors' pictures are listed once in src/site/content/site.js
// (DEMO_DOORS; the owner's page shows the same two). On a computer each
// door shows a readable piece of the product's screen, at half its size,
// and the phone screen beside it. On a phone the two doors stand side by
// side, the button first and the phone screen under it, so both buttons
// are on the first screen; the computer screen is not shown there, and
// because it is marked loading="lazy" a phone never downloads it.
//
// WHO EDITS IT
// Whoever changes how the demo is reached. What the demo may do (look, not
// change) is decided on the server (server/auth.js).

import { Link } from "react-router-dom";
import { enterDemo } from "../../lib/demoMode.js";
import { DEMO_DOORS, SITE_ACTIONS } from "../content/site.js";
import { usePageTitle, useReveal } from "../hooks.js";
import "./pages.css";

export default function DemoPage() {
  usePageTitle("Demo");
  // The entrances (site.css, "Entrances"): the doors and the close rise in
  // when they are on screen.
  const reveal = useReveal();

  return (
    <div className="pg">
      <section className="pg-sec dm-open" aria-labelledby="dm-title">
        <div className="pg-grid">
          <div className="dm-open-text">
            <div className="pg-mask">
              <h1 className="pg-h1 pg-display" id="dm-title">
                Try the demo
              </h1>
            </div>
            <p className="pg-lead pg-fade">The demo is Ukraine, where Chernozem started: a farm near Kupiansk in Field, and the whole country in Atlas.</p>
          </div>

          <div className="dm-doors" ref={reveal}>
            {DEMO_DOORS.map((door, index) => (
              <Link key={door.key} className={`dm-door dm-door-${door.key}`} to={door.to} onClick={enterDemo} data-rise="" style={{ "--i": index }}>
                <span className="dm-door-pics" aria-hidden="true">
                  <span className="dm-door-pic dm-door-wide" data-settle="" style={{ "--i": index + 1 }}>
                    <img src={door.wide.src} width={door.wide.width} height={door.wide.height} alt="" loading="lazy" decoding="async" style={{ objectPosition: door.wide.position }} />
                  </span>
                  <span className="dm-door-pic dm-door-phone" data-settle="" style={{ "--i": index + 2 }}>
                    <img src={door.phone.src} width={door.phone.width} height={door.phone.height} alt="" loading="eager" decoding="async" />
                  </span>
                </span>
                <span className="dm-door-label">{door.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="pg-sec pg-sec-sage dm-close" aria-labelledby="dm-register">
        <div className="dm-close-row" ref={reveal}>
          <h2 className="dm-close-line" id="dm-register" data-rise="">
            Want your own fields or region? Register, it’s free.
          </h2>
          <Link className="pg-btn dm-close-btn" to={SITE_ACTIONS.register.path} data-rise="" style={{ "--i": 1 }}>
            {SITE_ACTIONS.register.label}
          </Link>
        </div>
      </section>
    </div>
  );
}
