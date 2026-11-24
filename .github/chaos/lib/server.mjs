// Static server for the site under test. Sends what GitHub Pages sends; nothing is injected.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
export function serve(root, port = 0) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(f).toLowerCase()] || "application/octet-stream", "cache-control": "max-age=600" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => srv.listen(port, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${srv.address().port}/`, close: () => srv.close() })));
}
