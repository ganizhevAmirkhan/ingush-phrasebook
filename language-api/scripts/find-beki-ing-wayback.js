const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const OUT = path.join(__dirname, "..", "data", "external", "synovya-beki");

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 60000 }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), ctype: res.headers["content-type"] || "", loc: res.headers.location })
        );
      })
      .on("error", reject);
  });
}

async function cdx(query) {
  const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(query)}&output=json&fl=original,timestamp,statuscode,mimetype,length&filter=statuscode:200&limit=100`;
  process.stdout.write(`CDX ${query}\n`);
  const r = await get(url);
  process.stdout.write(`  status=${r.status} bytes=${r.body.length}\n`);
  try {
    const j = JSON.parse(r.body.toString("utf8"));
    return j.slice(1);
  } catch {
    process.stdout.write(`  raw=${r.body.toString("utf8").slice(0, 500)}\n`);
    return [];
  }
}

async function main() {
  const queries = [
    "dzurdzuki.com/download/bokov-a-h-iai-biastii*",
    "dzurdzuki.com/*iai*biastii*",
    "dzurdzuki.com/*bokov*",
    "dzurdzuki.com/wp-content/uploads/download-manager-files/*",
    "*.pdf/*Беке*",
    "*.pdf/*къонгаш*",
    "bibling.ru/*беки*",
    "bibling.ru/*Беки*"
  ];
  for (const q of queries) {
    const rows = await cdx(q);
    for (const row of rows.slice(0, 15)) {
      process.stdout.write(`  ${row.join(" | ")}\n`);
    }
  }

  // try available snapshot of dzurdzuki download page
  const pageSnaps = [
    "https://web.archive.org/web/2020/https://dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/",
    "https://web.archive.org/web/2020/https://dzurdzuki.com/download/bokov-a-h-synovya-beki-perevod-r-kafrielyants-1977/"
  ];
  for (const u of pageSnaps) {
    process.stdout.write(`\nSNAP ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  status=${r.status} ctype=${r.ctype} len=${r.body.length} loc=${r.loc || ""}\n`);
      const html = r.body.toString("utf8");
      const pdfs = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.pdf/gi)].map((m) => m[0]);
      const uploads = [...html.matchAll(/\/wp-content\/uploads\/[^"'\\\s>]+\.pdf/gi)].map((m) => m[0]);
      process.stdout.write(`  pdfs=${[...new Set(pdfs)].slice(0, 10).join(" | ")}\n`);
      process.stdout.write(`  uploads=${[...new Set(uploads)].slice(0, 10).join(" | ")}\n`);
      fs.writeFileSync(path.join(OUT, `wayback-${/iai/i.test(u) ? "ing" : "ru"}.html`), html.slice(0, 300000), "utf8");
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
