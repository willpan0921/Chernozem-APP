// WHAT THIS FILE DOES
// Settings for Vite, the tool that runs the app on your computer while you
// work on it. It switches on React support and plugs in the Atlas server
// (server/vite-plugin.js), so "npm run dev" also answers the /api/
// addresses: one command runs everything. It also keeps private files
// (.env, the Earth Engine key, saved data) from being served.
//
// WHO EDITS IT
// Nobody, normally. Leave it alone unless you are adding a new build tool.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import chernozemApi from "./server/vite-plugin.js";

export default defineConfig({
  plugins: [react(), chernozemApi()],
  server: {
    // Saved runs and chats change often; they are data, not code to reload.
    watch: { ignored: ["**/server/.data/**", "**/.env"] },
    // Files the dev server must never hand out: the private settings, the
    // Earth Engine key, the saved team and chats.
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/server/.data/**", "**/service-account*.json", "**/*.key.json"],
    },
  },
});
