// WHAT THIS FILE DOES
// Chernozem's three-minute film as a plain <video> with its poster frame,
// used on the About page. It only downloads when the visitor presses play
// (preload="none"). A phone (a screen up to 700 px wide) gets a smaller
// copy (568 x 320, 18 MB, about 0.8 megabits a second, so it plays without
// stopping on a slow mobile connection); a wider screen the full one
// (1280 x 720, 36 MB). Under it, a row of chapter buttons: each one jumps to
// its part of the film and plays it; the part playing now is marked
// (aria-current). The files are in public/site/film/. Styles:
// src/site/site.css (.film).
//
//   <Film chapters={[{ label: "Ukraine", t: 17 }, ...]} />   t in seconds
//   <Film caption="..." />                                   a caption under it
//
// WHO EDITS IT
// Whoever replaces the film. Keep a poster frame next to it, check each
// chapter's time against the new film, and make the small copy again (on a
// Mac: avconvert --source chernozem-2026.mp4 --preset PresetMediumQuality
// --output chernozem-2026-small.mp4).

import { useEffect, useRef, useState } from "react";
import { useReveal } from "../hooks.js";

const FILM_SRC = "/site/film/chernozem-2026.mp4";
const FILM_SMALL_SRC = "/site/film/chernozem-2026-small.mp4"; // for phones
const POSTER_SRC = "/site/film/chernozem-2026-poster.jpg";

// 71 -> "1:11"
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; // taste-skill-ignore: a clock (0:04), not a numbered label
}

export default function Film({ caption = "", chapters = [], className = "" }) {
  // The frame opens when the film scrolls into view (the observer from
  // hooks.js adds "is-in" to the figure), and the poster picture is only
  // fetched once the film is within about a screen of the visitor, since
  // the film sits far down the page.
  const reveal = useReveal();
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [near, setNear] = useState(false);
  const [current, setCurrent] = useState(-1);
  // The copy for this screen, chosen once (a <source media> would keep a
  // media-query listener, and with it the whole page, alive after leaving).
  const [src] = useState(() => (typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches ? FILM_SMALL_SRC : FILM_SRC));
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

  // The chapter playing now: the last one that has started.
  const follow = () => {
    const video = videoRef.current;
    if (!video || !chapters.length) return;
    if (video.paused && video.currentTime === 0) {
      setCurrent(-1);
      return;
    }
    let index = -1;
    chapters.forEach((c, i) => {
      if (video.currentTime + 0.25 >= c.t) index = i;
    });
    setCurrent(index);
  };

  // Jump to a chapter and play. Before the film has loaded, the browser
  // keeps the time and starts there; it is set again once it knows the film.
  const jump = (t) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState === 0) {
      video.preload = "auto";
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (Math.abs(video.currentTime - t) > 0.5) video.currentTime = t;
        },
        { once: true }
      );
    }
    video.currentTime = t;
    const playing = video.play();
    if (playing && typeof playing.catch === "function") playing.catch(() => {});
  };

  return (
    <figure className={`film ${className}`.trim()} ref={reveal}>
      <div className="film-frame" data-open ref={frameRef}>
        <video ref={videoRef} src={src} className="film-video" poster={near ? POSTER_SRC : undefined} preload="none" controls playsInline width="1280" height="720" onTimeUpdate={follow} onSeeked={follow} onPlay={follow}>
          <a href={FILM_SRC}>Download the film (MP4, 36 MB)</a>
        </video>
      </div>
      {chapters.length > 0 && (
        <ol className="film-chapters" aria-label="Chapters" data-rise style={{ "--i": 2 }}>
          {chapters.map((c, i) => (
            <li key={c.label}>
              <button type="button" className={`film-chapter${i === current ? " is-on" : ""}`} aria-current={i === current ? "true" : undefined} onClick={() => jump(c.t)}>
                {c.label} <span className="film-chapter-time">{clock(c.t)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {caption && (
        <figcaption className="film-caption muted" data-rise style={{ "--i": 2 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
