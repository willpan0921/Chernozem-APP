// WHAT THIS FILE DOES
// Plugs the Atlas server into the dev server ("npm run dev"), so the app
// and its /api/ addresses run together on one address (localhost:5173).
// Server files are reloaded after every edit, like the pages are.
// It also starts the monthly auto-analysis once.
//
// WHO EDITS IT
// Nobody, normally. The routes themselves are in server/app.js.

export default function chernozemApi() {
  return {
    name: "chernozem-api",
    configureServer(server) {
      const startScheduler = () => {
        if (globalThis.__chernozemDevSchedulerStarted) return;
        globalThis.__chernozemDevSchedulerStarted = true;
        server
          .ssrLoadModule("/server/scheduler.js")
          .then((mod) => mod.startScheduler())
          .catch((error) => {
            globalThis.__chernozemDevSchedulerStarted = false;
            console.warn(`[chernozem] Could not start the monthly scheduler: ${error.message}`);
          });
      };
      server.httpServer?.once("listening", startScheduler);

      server.middlewares.use(async (req, res, next) => {
        // The server's own files (code, saved team and chats) are never
        // served to the browser; pages only reach them through /api/.
        // The Earth Engine key file is refused too, wherever it is.
        let pathname = "";
        try {
          pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname).toLowerCase();
        } catch {
          pathname = String(req.url || "").toLowerCase();
        }
        if (/^\/+server(\/|$)/.test(pathname) || /(^|\/)(service-account[^/]*|[^/]*\.key)\.json$/.test(pathname) || /(^|\/)\.env(\.|$)/.test(pathname)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          return res.end("Not found");
        }
        if (!req.url || !req.url.startsWith("/api/")) return next();
        try {
          const mod = await server.ssrLoadModule("/server/app.js");
          startScheduler();
          const handled = await mod.handleApi(req, res);
          if (!handled) next();
        } catch (error) {
          // A broken server file must never take the dev server down.
          console.error("[chernozem] API error:", error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            // No details for the page (they can name folders); they are logged above.
            res.end(JSON.stringify({ error: { code: "server_error", message: "Something went wrong on the server. See the server log for details." } }));
          } else if (!res.writableEnded) {
            res.end();
          }
        }
      });
    },
  };
}
