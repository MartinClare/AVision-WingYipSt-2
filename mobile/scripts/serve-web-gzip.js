const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..", process.env.WEB_DIST_DIR || "dist");
const port = Number(process.env.PORT || 8083);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const staticExtensions = new Set(Object.keys(types));

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function resolveFile(urlPath) {
  const clean = urlPath === "/" ? "/index.html" : urlPath;
  let filePath = path.join(root, clean);
  if (!filePath.startsWith(root)) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;

  // Expo export also serves hashed assets under /assets/assets/...
  if (clean.startsWith("/assets/images/") && !fs.existsSync(filePath)) {
    const base = path.basename(clean);
    const nested = path.join(root, "assets", "assets", "images", base);
    if (nested.startsWith(root) && fs.existsSync(nested)) return nested;
  }

  if (staticExtensions.has(path.extname(clean))) return null;

  const htmlFallback = path.join(root, "index.html");
  return fs.existsSync(htmlFallback) ? htmlFallback : null;
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const filePath = resolveFile(urlPath);
    if (!filePath) {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
      return;
    }

    const ext = path.extname(filePath);
    const body = fs.readFileSync(filePath);
    const acceptsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    const cacheControl = urlPath.startsWith("/_expo/") || urlPath.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";
    const headers = {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      Vary: "Accept-Encoding",
    };

    if (acceptsGzip && (ext === ".js" || ext === ".css" || ext === ".html" || ext === ".json")) {
      zlib.gzip(body, { level: 9 }, (err, gzipped) => {
        if (err) {
          send(res, 500, {}, "Compression error");
          return;
        }
        send(res, 200, { ...headers, "Content-Encoding": "gzip" }, gzipped);
      });
      return;
    }

    send(res, 200, headers, body);
  })
  .listen(port, "0.0.0.0", () => {
    console.log(`Mobile web server listening on http://0.0.0.0:${port} (${root})`);
  });
