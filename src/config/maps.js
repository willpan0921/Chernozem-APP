// WHAT THIS FILE DOES
// The pictures the maps are drawn on ("tiles"), both from Esri, free and
// with no key. The short credit line each map shows in its corner is
// required by Esri's terms, so it stays on screen in every mode.
//
//   SATELLITE   Esri World Imagery: the Field map always, and the Atlas map
//               when "Satellite only" is on
//   LIGHT_GREY  Esri's light grey canvas: the Atlas map's usual base map,
//               under the coloured squares. (CARTO's light map now shows
//               "API KEY REQUIRED" on every tile unless you have a CARTO key.)
//
// WHO EDITS IT
// Whoever changes a base map. Keep the attribution with its tiles.

export const SATELLITE = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  maxNativeZoom: 18,
};

export const LIGHT_GREY = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
  maxNativeZoom: 16,
};
