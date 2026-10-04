// WHAT THIS FILE DOES
// Draws one tile on the Field page: a box with a title and some contents.
// If no contents are given, it shows "Coming soon".
//
// WHO EDITS IT
// Whoever works on how tiles look. To change tile TITLES, edit
// src/config/tiles.js instead.

export default function Tile({ title, children }) {
  return (
    <article className="tile">
      <h3 className="tile-title">{title}</h3>
      <div className="tile-body">
        {children || <p className="coming-soon">Coming soon</p>}
      </div>
    </article>
  );
}
