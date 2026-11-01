import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const port = Number(process.env.PORT || 8879);
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/assets/photo-front.jpg", ["assets/photo-front.jpg", "image/jpeg"]],
  ["/assets/photo-back.jpg", ["assets/photo-back.jpg", "image/jpeg"]],
]);
const server = createServer(async (req, res) => {
  const route = routes.get(new URL(req.url, "http://127.0.0.1").pathname);
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  if (!route) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  try {
    const data = await readFile(new URL(route[0], import.meta.url));
    res.writeHead(200, {
      "Content-Type": route[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(500);
    res.end("Preview file unavailable");
  }
});
server.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log("KONz backup demo: http://127.0.0.1:" + port + "/#submit"),
);
