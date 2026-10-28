// WHAT THIS FILE DOES
// A real screenshot of the app, framed like a browser window (or a phone),
// with its caption. The pictures live in public/site/shots/ and are taken
// from the live app (see manifest.json there). A missing picture shows an
// empty frame of the right shape rather than a broken image.
//
//   <Shot name="atlas-map-near-macro" url="chernozem.app/atlas/map" />
//   <Shot name="phone-atlas-map" phone />
//
// WHO EDITS IT
// Whoever changes the website's pictures.

import { useState } from "react";

export default function Shot({ name, url, alt, caption, phone = false, ratio, className = "", eager = false }) {
  const [missing, setMissing] = useState(false);
  const src = `/site/shots/${name}.webp`;
  const shape = ratio || (phone ? "390 / 844" : "1440 / 900");
  if (phone) {
    return (
      <figure className={className}>
        <div className="shot shot-phone">
          {missing ? <div style={{ aspectRatio: shape }} /> : <img src={src} alt={alt || caption || ""} loading={eager ? "eager" : "lazy"} decoding="async" style={{ aspectRatio: shape }} onError={() => setMissing(true)} />}
        </div>
        {caption && <figcaption className="caption">{caption}</figcaption>}
      </figure>
    );
  }
  return (
    <figure className={className}>
      <div className="shot">
        <div className="shot-bar" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>{url || "chernozem.app"}</span>
        </div>
        {missing ? <div style={{ aspectRatio: shape }} /> : <img src={src} alt={alt || caption || ""} loading={eager ? "eager" : "lazy"} decoding="async" style={{ aspectRatio: shape, objectFit: "cover", objectPosition: "top" }} onError={() => setMissing(true)} />}
      </div>
      {caption && <figcaption className="caption">{caption}</figcaption>}
    </figure>
  );
}
