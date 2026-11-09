const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "..", "data", "external", "synovya-beki");
fs.mkdirSync(outDir, { recursive: true });

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
        timeout: 120000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 8) return reject(new Error("too many redirects"));
          const next = new URL(res.headers.location, url).href;
          return get(next, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"] || "",
            body: Buffer.concat(chunks),
            url,
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

async function trySavePdf(url, name) {
  process.stdout.write(`GET ${url}\n`);
  try {
    const r = await get(url);
    process.stdout.write(`  status=${r.status} ct=${r.ct} bytes=${r.body.length}\n`);
    const isPdf =
      r.body.slice(0, 5).toString() === "%PDF-" ||
      (r.ct || "").toLowerCase().includes("pdf");
    if (r.status === 200 && isPdf && r.body.length > 10000) {
      const dest = path.join(outDir, name);
      fs.writeFileSync(dest, r.body);
      process.stdout.write(`  SAVED ${dest}\n`);
      return dest;
    }
  } catch (e) {
    process.stdout.write(`  ERR ${e.message}\n`);
  }
  return null;
}

async function scrapeDzurdzuki() {
  const page = "https://dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/";
  process.stdout.write(`PAGE ${page}\n`);
  try {
    const r = await get(page);
    process.stdout.write(`page status=${r.status} bytes=${r.body.length}\n`);
    fs.writeFileSync(path.join(outDir, "dzurdzuki-ing-page.html"), r.body);
    const html = r.body.toString("utf8");
    const pdfs = new Set();
    for (const m of html.matchAll(/https?:\/\/[^"'>\s]+\.pdf/gi)) pdfs.add(m[0]);
    for (const m of html.matchAll(/\/wp-content\/uploads\/[^"'>\s]+\.pdf/gi)) {
      pdfs.add("https://dzurdzuki.com" + m[0]);
    }
    for (const m of html.matchAll(/href=["']([^"']+\.pdf)["']/gi)) {
      pdfs.add(new URL(m[1], page).href);
    }
    process.stdout.write(`found pdfs: ${[...pdfs].join("\n  ")}\n`);
    for (const u of pdfs) {
      const saved = await trySavePdf(u, "ing-iai-biastii.pdf");
      if (saved) return saved;
    }
  } catch (e) {
    process.stdout.write(`PAGE ERR ${e.message}\n`);
  }
  return null;
}

async function main() {
  // Direct known candidates + page scrape
  const candidates = [
    "https://dzurdzuki.com/wp-content/uploads/2021/03/Bokov-A.H.-Iai-biastii-viashagikastash.pdf",
    "https://dzurdzuki.com/wp-content/uploads/2020/12/Bokov-AH-Iai-biastii-viashagikastash-1984.pdf",
    "https://dzurdzuki.com/wp-content/uploads/2019/11/iai-biastii.pdf",
  ];
  for (const u of candidates) {
    const saved = await trySavePdf(u, "ing-iai-biastii.pdf");
    if (saved) return;
  }
  await scrapeDzurdzuki();

  // Wayback CDX for dzurdzuki PDF
  const cdx =
    "https://web.archive.org/cdx/search/cdx?url=dzurdzuki.com/wp-content/uploads/*iai*&output=json&fl=original,timestamp,statuscode,mimetype&filter=mimetype:application/pdf&limit=20";
  process.stdout.write(`CDX ${cdx}\n`);
  try {
    const r = await get(cdx);
    process.stdout.write(`cdx status=${r.status} bytes=${r.body.length}\n`);
    fs.writeFileSync(path.join(outDir, "wayback-ing-cdx.json"), r.body);
    const text = r.body.toString("utf8").trim();
    if (text.startsWith("[")) {
      const rows = JSON.parse(text).slice(1);
      for (const [original, ts] of rows) {
        const wb = `https://web.archive.org/web/${ts}if_/${original}`;
        const saved = await trySavePdf(wb, "ing-iai-biastii.pdf");
        if (saved) return;
      }
    }
  } catch (e) {
    process.stdout.write(`CDX ERR ${e.message}\n`);
  }

  // Alternate title spellings / sites
  const more = [
    "https://web.archive.org/web/2020/https://dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/",
    "https://ingush.ru/",
  ];
  for (const u of more.slice(0, 1)) {
    try {
      const r = await get(u);
      process.stdout.write(`alt page ${u} -> ${r.status} ${r.body.length}\n`);
      fs.writeFileSync(path.join(outDir, "wayback-ing-page.html"), r.body);
      const html = r.body.toString("utf8");
      const pdfs = new Set();
      for (const m of html.matchAll(/https?:\/\/[^"'>\s]+\.pdf/gi)) pdfs.add(m[0]);
      for (const m of html.matchAll(/\/web\/\d+[^"'>\s]+\.pdf/gi)) {
        pdfs.add("https://web.archive.org" + m[0]);
      }
      process.stdout.write(`wayback pdfs: ${[...pdfs].slice(0, 10).join("\n  ")}\n`);
      for (const p of pdfs) {
        const saved = await trySavePdf(p, "ing-iai-biastii.pdf");
        if (saved) return;
      }
    } catch (e) {
      process.stdout.write(`alt ERR ${e.message}\n`);
    }
  }

  process.stdout.write("ING PDF not found yet\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
