// WHAT THIS FILE DOES
// Chernozem's three-minute film ("Chernozem in three minutes", with its own
// sound) as a plain <video> with its poster frame, on the Methodology page
// right after "Behind it" (it moved there from the About page). It only
// downloads when the visitor presses play (preload="none"). A phone (a
// screen up to 700 px wide) gets a smaller copy (568 x 320, 18 MB, about
// 0.8 megabits a second, so it plays without stopping on a slow mobile
// connection); a wider screen the full one (1280 x 720, 36 MB).
//
// Under it, a row of chapter buttons, the film's own five (FILM_CHAPTERS:
// Northeastern China 0:04, Ukraine 0:17, How it reads the land 0:34, Field
// 1:11, Atlas 1:48): each one jumps to its part of the film and plays it.
// The part playing now is marked (aria-current, filled in ink by
// pages.css, like the walkthrough films' chapters on the same page): it
// follows the film as it plays or is moved on its own timeline, moves at
// once when a chapter is pressed, and stays while the film is paused. The
// rule for "the part playing now" is the walkthroughs' own (chapterAt in
// Walkthrough.jsx), so both kinds of film behave alike.
//
//   <Film />                                  the film with its five chapters
//   <Film chapters={[{ label, t }, ...]} />   other chapters (t in seconds)
//   <Film caption="..." />                    a caption under it
//
// The files are in public/site/film/. Styles: src/site/pages/pages.css
// (".film").
//
// WHO EDITS IT
// Whoever replaces the film. Keep a poster frame next to it, check each
// chapter's time in FILM_CHAPTERS against the new film, and make the small
// copy again (on a Mac: avconvert --source chernozem-2026.mp4 --preset
// PresetMediumQuality --output chernozem-2026-small.mp4).

import { useEffect, useRef, useState } from "react";
import { useReveal } from "../hooks.js";
import { chapterAt } from "./Walkthrough.jsx";

const FILM_SRC = "/site/film/chernozem-2026.mp4";
const FILM_SMALL_SRC = "/site/film/chernozem-2026-small.mp4"; // for phones
const POSTER_SRC = "/site/film/chernozem-2026-poster.jpg";

// The film's chapters, checked frame by frame (the film runs 2:58).
export const FILM_CHAPTERS = [
  { label: "Northeastern China", t: 4 },
  { label: "Ukraine", t: 17 },
  { label: "How it reads the land", t: 34 },
  { label: "Field", t: 71 },
  { label: "Atlas", t: 108 },
];

// 71 -> "1:11"
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; // taste-skill-ignore: a clock (0:04), not a numbered label
}

export default function Film({ caption = "", chapters = FILM_CHAPTERS, title = "Chernozem in three minutes", className = "" }) {
  // The frame opens when the film scrolls into view (the observer from
  // hooks.js adds "is-in" to the figure), and the poster picture is only
  // fetched once the film is within about a screen of the visitor, since
  // the film sits far down the page.
  const reveal = useReveal();
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [near, setNear] = useState(false);
  const [current, setCurrent] = useState(-1);
  // The start of a chapter just pressed, until the film is there: it stays
  // marked meanwhile (before the film has loaded, a browser may still
  // report 0:00).
  const pressed = useRef(null);
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

  // The chapter playing now, as the film plays, pauses or is moved.
  const follow = () => {
    const video = videoRef.current;
    if (!video || !chapters.length) return;
    if (pressed.current !== null) {
      if (Math.abs(video.currentTime - pressed.current) > 1) return;
      pressed.current = null;
    }
    setCurrent(chapterAt(chapters, video.currentTime, video.paused));
  };

  // A finished jump: the film is where it says, wherever that is (a
  // chapter's start, or a place picked on the player's own timeline).
  const settled = () => {
    pressed.current = null;
    follow();
  };

  // Jump to a chapter and play; the chapter is marked at once. Before the
  // film has loaded, the browser keeps the time and starts there; it is set
  // again once it knows the film.
  const jump = (t, index) => {
    const video = videoRef.current;
    if (!video) return;
    pressed.current = t;
    setCurrent(index);
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
    <figure className={`film ${className}`.trim()} ref={reveal} aria-label={title}>
      <div className="film-frame" data-open ref={frameRef}>
        <video ref={videoRef} src={src} className="film-video" poster={near ? POSTER_SRC : undefined} preload="none" controls playsInline width="1280" height="720" onTimeUpdate={follow} onSeeked={settled} onPlay={follow}>
          <a href={FILM_SRC}>Download the film (MP4, 36 MB)</a>
        </video>
      </div>
      {chapters.length > 0 && (
        <ol className="film-chapters" aria-label={`Chapters of ${title}`} data-rise style={{ "--i": 2 }}>
          {chapters.map((c, i) => (
            <li key={c.label}>
              <button type="button" className="film-chapter" aria-current={i === current ? "true" : undefined} onClick={() => jump(c.t, i)}>
                {c.label} <span className="film-chapter-time">{clock(c.t)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {caption && (
        <figcaption className="film-caption" data-rise style={{ "--i": 2 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
