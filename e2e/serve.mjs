// Serves the built site (dist/) like any static host would, with /config.js written from environment variables:
// SITE_AUTHORITY, SITE_CLIENT_ID (default "headless"), SITE_API, SITE_TENANT, SITE_TERMS_URL. Unknown paths get
// index.html (the site routes in the browser). For tests and as a reference; in production use your own web server.
import { readFileSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const PORT = Number(process.env.PORT ?? 5190);
const ROOT = resolve(process.env.SITE_DIST ?? "dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".map": "application/json", ".png": "image/png" };
const config = {
  authority: process.env.SITE_AUTHORITY,
  clientId: process.env.SITE_CLIENT_ID ?? "headless",
  api: process.env.SITE_API,
  tenant: process.env.SITE_TENANT,
  termsUrl: process.env.SITE_TERMS_URL || null,
};

http
  .createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path === "/config.js") {
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-cache" });
      return res.end(`window.SITE_CONFIG = ${JSON.stringify(config)};`);
    }

    let file = join(ROOT, path);
    try {
      if (!file.startsWith(ROOT) || !statSync(file).isFile()) file = join(ROOT, "index.html");
    } catch {
      file = join(ROOT, "index.html");
    }

    const immutable = file.includes(`${join(ROOT, "assets")}`);
    res.writeHead(200, { "Content-Type": `${TYPES[extname(file)] ?? "application/octet-stream"}; charset=utf-8`, "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
    res.end(readFileSync(file));
  })
  .listen(PORT, () => console.log(`Site on http://localhost:${PORT}`));
