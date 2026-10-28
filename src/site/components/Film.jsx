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
const POSTER_SRC = "/site/film/chernozem-2026-poster.jpg";

export default function Film({ caption = "The Congressional App Challenge film, 2026.", className = "" }) {
  return (
    <figure className={`film ${className}`.trim()}>
      <div className="film-frame" data-open>
        <video className="film-video" poster={POSTER_SRC} preload="none" controls playsInline width="1280" height="720">
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
