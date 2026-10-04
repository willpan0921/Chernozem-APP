// WHAT THIS FILE DOES
// The Field page: the field name at the top, a link back to Home, a grid of
// tiles, and the chat panel beside them (below them on small screens). It
// fills the whole screen and sits on the same background photo as Home.
//
// WHO EDITS IT
// Whoever connects real data to the tiles. You do NOT need to edit this file
// to rename or reorder tiles (src/config/tiles.js), to add soil types
// (src/data/soilTypes.js), or to build the chat (src/components/ChatPanel.jsx).
//
// WHAT IT RECEIVES
// fieldName - the text typed into the search box on the Home screen.
// onBack    - a function from App.jsx that returns to the Home screen.

import Tile from "../components/Tile.jsx";
import ChatPanel from "../components/ChatPanel.jsx";
import { tiles } from "../config/tiles.js";
import { currentPhoto } from "../config/photos.js";
import { soilTypes } from "../data/soilTypes.js";

// Decides what goes inside each tile. Returning nothing means the tile shows
// "Coming soon". To fill in another tile later, add a block for its id here.
function tileContents(tileId) {
  if (tileId === "soil-type") {
    // No real data yet, so show the first entry in Shirley's file.
    const soil = soilTypes[0];
    if (!soil) return null;
    return (
      <>
        <p className="soil-name">{soil.name}</p>
        <p className="soil-family">Family: {soil.family}</p>
        <p className="soil-description">{soil.description}</p>
      </>
    );
  }
  return null;
}

export default function FieldPage({ fieldName, onBack }) {
  return (
    <main className="field-page" style={{ backgroundImage: `url(${currentPhoto})` }}>
      <div className="field-inner">
        <button className="back-link" type="button" onClick={onBack}>
          ← Back to Home
        </button>
        <h1 className="field-name">{fieldName}</h1>

        <div className="field-layout">
          <section className="tile-grid">
            {tiles.map((tile) => (
              <Tile key={tile.id} title={tile.title}>
                {tileContents(tile.id)}
              </Tile>
            ))}
          </section>

          <ChatPanel fieldName={fieldName} />
        </div>
      </div>
    </main>
  );
}
