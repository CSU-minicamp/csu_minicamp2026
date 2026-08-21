import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.MINICAMP_PORT || 4173);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };

http.createServer((request, response) => {
  const requested = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const file = path.join(root, path.normalize(requested));
  if (!file.startsWith(root)) { response.writeHead(403); response.end("Forbidden"); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404); response.end("Not found"); return; }
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`minicamp preview: http://localhost:${port}`));
