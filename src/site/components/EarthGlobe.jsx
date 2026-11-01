// WHAT THIS FILE DOES
// PLACEHOLDER (1 November 2026): the About page's new Earth, being built
// now. It will be a medium-sized globe that turns slowly on its own, with
// today's wars and disaster alerts on it; clicking one draws lines to the
// countries whose food depends on that land and says what is happening
// there now. Until it is ready this keeps its place: a square box the size
// the globe will take, so the page around it can be laid out.
//
// WHO EDITS IT
// Whoever builds the About page's globe.

export default function EarthGlobe({ className = "" }) {
  return <div className={`earth-globe ${className}`.trim()} style={{ width: "100%", maxWidth: 560, aspectRatio: "1 / 1" }} aria-hidden="true" />;
}
