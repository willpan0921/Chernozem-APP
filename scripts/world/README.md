# The globe's black-soil map

`public/site/world/black-soil.json` holds the shapes of the world's black-soil belts that the About page's globe draws (src/site/components/EarthGlobe.jsx). It is made in two steps, on the owner's Mac:

1. `node scripts/world/soil-grid.mjs . <work folder> 0.1` asks Google Earth Engine for a world grid at 0.1 degree (3600 x 1800, one byte per pixel) of where the soil is black soil, from OpenLandMap's USDA great groups (Hengl and Nauman, 2018, https://doi.org/10.5281/zenodo.1476844, CC BY-SA 4.0), using the app's own list of black-soil classes (`BLACK_SOIL` in server/providers/gee.js). It signs in with the Earth Engine key at `~/.config/chernozem/service-account.json` and never prints it. It writes `blacksoil-3600x1800.bin` (and a cropland grid the globe no longer uses). It takes a few minutes, tile by tile.
2. `node scripts/world/soil-shapes.mjs . <work folder>/blacksoil-3600x1800.bin` turns the grid into shapes with `soilShapes` and `SOIL_RECIPE` in src/site/components/earthMath.js (0.3-degree blocks, a light blur, the outline at 30%, simplified to 0.08 degrees) and writes `public/site/world/black-soil.json`.

The shapes are derived from OpenLandMap, so they are shared under CC BY-SA 4.0 too; the globe's sources line credits it. The grid itself (6.5 MB) is not kept in the repository.
