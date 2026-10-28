// WHAT THIS FILE DOES
// The promo film (the Congressional App Challenge film, 2026) as a plain
// <video> with its poster frame, used on the About page and on the Story
// page. It only downloads when the visitor presses play (preload="none").
// The files are in public/site/film/. Styles: src/site/site.css (.film).
//
//   <Film />                       the film with its caption
//   <Film caption="…" />           another caption, or caption="" for none
//
// WHO EDITS IT
// Whoever replaces the film. Keep a poster frame next to it.

const FILM_SRC = "/site/film/chernozem-2026.mp4";
import { useEffect, useRef, useState } from "react";
import { useReveal } from "../hooks.js";

const POSTER_SRC = "/site/film/chernozem-2026-poster.jpg";

export default function Film({ caption = "The Congressional App Challenge film, 2026.", className = "" }) {
  // The frame opens when the film scrolls into view, on any page (the
  // observer from hooks.js adds "is-in" to the figure), and the poster
  // picture is only fetched once the film is within about a screen of the
  // visitor, since the film sits far down the page.
  const reveal = useReveal();
  const frameRef = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(frame);
    return () => io.disconnect();
  }, []);
  return (
    <figure className={`film ${className}`.trim()} ref={reveal}>
      <div className="film-frame" data-open ref={frameRef}>
        <video className="film-video" poster={near ? POSTER_SRC : undefined} preload="none" controls playsInline width="1280" height="720">
          <source src={FILM_SRC} type="video/mp4" />
          <a href={FILM_SRC}>Download the film (MP4, 36 MB)</a>
        </video>
      </div>
      {caption && (
        <figcaption className="film-caption muted" data-rise style={{ "--i": 2 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
