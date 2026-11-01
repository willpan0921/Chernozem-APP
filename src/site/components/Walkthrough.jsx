// WHAT THIS FILE DOES
// A walkthrough film on the website's Methodology page: the Field or the
// Atlas app recorded from the real product, with a caption for every step
// and no narration. A plain <video> with its poster frame, which only
// downloads when the visitor presses play (preload="none"), and under it
// the chapter buttons: each one jumps to its part of the film and plays
// it. Nothing else is written under the film: the chapters say what is in
// it.
//
// The chapter playing now is marked (aria-current, filled in ink by
// pages.css): it follows the film as it plays or is moved on its own
// timeline, moves at once when a chapter is pressed, and stays while the
// film is paused. The film's own caption sits at the foot of the picture,
// where the player's controls cover it whenever the film is paused (and
// it is tiny on a phone), so the marked chapter is where the step's name
// can always be read.
//
// The films and their chapter lists are made together by the recording
// script (the chapter times come from the recording itself), and live in
// public/site/film/: field-walkthrough.mp4, atlas-walkthrough.mp4, their
// -poster.jpg, and walkthroughs.json, which this component fetches once
// the film is within about a screen of the visitor:
//
//   { "field": { "src", "poster", "width", "height", "seconds",
//                "chapters": [{ "label": "Fields", "t": 21.4 }, ...] },
//     "atlas": { ... } }
//
//   <Walkthrough product="field" title="The Field walkthrough" />
//
// Styles: src/site/pages/pages.css (".wk-").
//
// WHO EDITS IT
// Whoever re-records a film: run the recording script again, which writes
// the new films, posters and walkthroughs.json together, so the chapters
// always match the film.

import { useEffect, useRef, useState } from "react";
import { useReveal } from "../hooks.js";

export const WALKTHROUGHS_URL = "/site/film/walkthroughs.json";

// The films' addresses, so the page works (poster and all) before the
// chapter list has arrived.
export const WALKTHROUGH_FILES = {
  field: { src: "/site/film/field-walkthrough.mp4", poster: "/site/film/field-walkthrough-poster.jpg" },
  atlas: { src: "/site/film/atlas-walkthrough.mp4", poster: "/site/film/atlas-walkthrough-poster.jpg" },
};

// One fetch of the chapter list for the whole page (both films share it).
let chaptersPromise = null;
function loadChapters() {
  if (!chaptersPromise) {
    chaptersPromise = fetch(WALKTHROUGHS_URL)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => {
        chaptersPromise = null;
        return {};
      });
  }
  return chaptersPromise;
}

// The chapter playing at a time in the film: the last one that has started
// (a quarter of a second early counts, so a jump to a chapter's start is
// in it). None before the first chapter, and none while the film sits
// unplayed at 0:00. Returns its index, or -1.
export function chapterAt(chapters, time, paused) {
  if (paused && time === 0) return -1;
  let index = -1;
  chapters.forEach((c, i) => {
    if (time + 0.25 >= c.t) index = i;
  });
  return index;
}

// 71 -> "1:11"
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; // taste-skill-ignore: a clock (0:04), not a numbered label
}

export default function Walkthrough({ product, title, className = "" }) {
  const files = WALKTHROUGH_FILES[product];
  const reveal = useReveal();
  const frameRef = useRef(null);
  const videoRef = useRef(null);
  const [near, setNear] = useState(false);
  const [info, setInfo] = useState(null);
  const [current, setCurrent] = useState(-1);
  // The start of a chapter just pressed, until the film is there: it stays
  // marked meanwhile (before the film has loaded, a browser may still
  // report 0:00).
  const pressed = useRef(null);

  // The poster and the chapter list are only fetched once the film is
  // within about a screen of the visitor.
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

  useEffect(() => {
    if (!near) return undefined;
    let alive = true;
    loadChapters().then((all) => {
      if (alive && all && all[product]) setInfo(all[product]);
    });
    return () => {
      alive = false;
    };
  }, [near, product]);

  const chapters = info?.chapters || [];

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
  // film has loaded, the browser keeps the time and starts there; it is
  // set again once it knows the film.
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
    <figure className={`wk ${className}`.trim()} ref={reveal} aria-label={title}>
      <div className="wk-frame" data-open ref={frameRef}>
        <video ref={videoRef} src={files.src} className="wk-video" poster={near ? files.poster : undefined} preload="none" controls playsInline width="1440" height="900" onTimeUpdate={follow} onSeeked={settled} onPlay={follow}>
          <a href={files.src}>Download the film (MP4)</a>
        </video>
      </div>
      {chapters.length > 0 && (
        <ol className="wk-chapters" aria-label={`Chapters of ${title}`} data-rise style={{ "--i": 2 }}>
          {chapters.map((c, i) => (
            <li key={c.label}>
              <button type="button" className="wk-chapter" aria-current={i === current ? "true" : undefined} onClick={() => jump(c.t, i)}>
                {c.label} <span className="wk-chapter-time">{clock(c.t)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
