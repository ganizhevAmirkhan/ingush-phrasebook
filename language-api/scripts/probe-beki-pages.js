const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { URL } = require("node:url");

const OUT = path.join(__dirname, "..", "data", "external", "synovya-beki");

function fetch(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http:") ? http : https;
    lib
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          return resolve(fetch(next, redirects + 1));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), finalUrl: url })
        );
      })
      .on("error", reject);
  });
}

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

(async () => {
  for (const name of ["book1.html", "page1.html", "page2.html", "page3.html", "page4.html", "page5.html"]) {
    const url = `https://ingushwarrior.neocities.org/${name}`;
    const r = await fetch(url);
    const text = strip(r.body);
    const hasGloss = /display\s*:\s*none/i.test(r.body);
    const ruParas = (r.body.match(/<h2>\s*Страница[\s\S]*?<\/td>/i) || [""])[0];
    const ruText = strip(ruParas).slice(0, 400);
    console.log(`\n=== ${name} status=${r.status} len=${r.body.length} gloss=${hasGloss} textLen=${text.length}`);
    console.log("preview:", text.slice(0, 300));
    console.log("RU:", ruText);
    if (r.status === 200) fs.writeFileSync(path.join(OUT, name.replace(".html", "") + ".html"), r.body, "utf8");
  }
})();
