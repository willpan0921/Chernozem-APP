// WHAT THIS FILE DOES
// A real screenshot of the app, as a plain picture with no frame around
// it. The pictures live in public/site/shots/ (manifest.json there says
// what each one shows; the desktop shots are 1920×1200, the phone shots
// 780×1688, and every desktop shot has a 960-px-wide copy for small
// frames).
//
//   <Shot name="atlas-map-near-macro" alt="…" />            the whole shot
//   <Shot name="field-data" small />                         the 960 copy
//   <Shot name="atlas-map-picked" crop={{ x: 1500, y: 60, w: 420, h: 380 }} />
//       a true-size crop: a window w×h over the full-size shot, with its
//       top-left corner at (x, y) of the 1920-px picture, so the interface
//       inside is shown at the size a visitor would really see it
//
// A missing picture leaves an empty box of the right shape rather than a
// broken image.
//
// WHO EDITS IT
// Whoever changes the website's pictures.

import { useState } from "react";

export default function Shot({ name, alt = "", caption, small = false, phone = false, crop, className = "", eager = false, width, height }) {
  const [missing, setMissing] = useState(false);
  const src = `/site/shots/${name}${small ? "-960" : ""}.webp`;
  const w = width || (phone ? 780 : small ? 960 : 1920);
  const h = height || (phone ? 1688 : small ? 600 : 1200);
  const loading = eager ? "eager" : "lazy";

  if (crop) {
    // The window shows the full-size picture at its natural size, moved so
    // that the wanted region sits in the window.
    return (
      <figure className={`shot shot-crop ${className}`.trim()} style={{ width: crop.w, height: crop.h }}>
        {!missing && (
          <img
            src={src}
            alt={alt}
            width={w}
            height={h}
            loading={loading}
            decoding="async"
            onError={() => setMissing(true)}
            style={{ width: w, height: h, maxWidth: "none", transform: `translate(${-crop.x}px, ${-crop.y}px)` }}
          />
        )}
        {caption && <figcaption className="caption muted">{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className={`shot ${className}`.trim()}>
      {missing ? <div style={{ aspectRatio: `${w} / ${h}` }} /> : <img src={src} alt={alt} width={w} height={h} loading={loading} decoding="async" onError={() => setMissing(true)} />}
      {caption && <figcaption className="caption muted">{caption}</figcaption>}
    </figure>
  );
}
