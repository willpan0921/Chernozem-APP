// WHAT THIS FILE DOES
// Settings for Vite, the tool that runs the app on your computer while you
// work on it. The only setting here switches on React support.
//
// WHO EDITS IT
// Nobody, normally. Leave it alone unless you are adding a new build tool.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
