const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

function fetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        const next = res.headers.location.startsWith("http")
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        resolve(fetch(next, maxRedirects - 1));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
  });
}

async function main() {
  const pageUrl = process.argv[2];
  const { body } = await fetch(pageUrl);
  const html = body.toString("utf8");
  const parts = [];
  for (let i = 0; i < html.length; ) {
    const at = html.indexOf("download-manager-files", i);
    if (at === -1) break;
    parts.push(html.slice(at, at + 150).replace(/\s+/g, " "));
    i = at + 25;
  }
  console.log(parts.join("\n---\n"));
  const wpdmdl = html.match(/wpdmdl=(\d+)/);
  if (wpdmdl) console.log("wpdmdl", wpdmdl[1]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
