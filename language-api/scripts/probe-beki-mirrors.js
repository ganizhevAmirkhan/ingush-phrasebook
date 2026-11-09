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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
        timeout: 90000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 10) return reject(new Error("too many redirects"));
          return get(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({ status: res.statusCode, ct: res.headers["content-type"] || "", body: Buffer.concat(chunks), url })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

async function saveIfPdf(url, name) {
  process.stdout.write(`GET ${url}\n`);
  try {
    const r = await get(url);
    process.stdout.write(`  ${r.status} ${r.ct} ${r.body.length}\n`);
    if (r.status === 200 && r.body.slice(0, 5).toString() === "%PDF-" && r.body.length > 50000) {
      const dest = path.join(outDir, name);
      fs.writeFileSync(dest, r.body);
      process.stdout.write(`  SAVED ${dest}\n`);
      return true;
    }
    const dest = path.join(outDir, name.replace(/\.pdf$/, "") + "-probe.bin");
    if (r.body.length < 2_000_000) fs.writeFileSync(dest, r.body);
  } catch (e) {
    process.stdout.write(`  ERR ${e.message}\n`);
  }
  return false;
}

async function main() {
  const urls = [
    // Wayback CDX broader
    "https://web.archive.org/cdx/search/cdx?url=dzurdzuki.com/*bokov*&output=json&fl=original,timestamp,statuscode,mimetype&limit=50",
    "https://web.archive.org/cdx/search/cdx?url=dzurdzuki.com/*iai*&output=json&fl=original,timestamp,statuscode,mimetype&limit=50",
    "https://web.archive.org/cdx/search/cdx?url=dzurdzuki.com/wp-content/uploads/*&matchType=prefix&filter=original:.*[Bb]okov.*&output=json&fl=original,timestamp,statuscode,mimetype&limit=50",
    "https://web.archive.org/cdx/search/cdx?url=*.pdf&matchType=domain&filter=original:.*dzurdzuki.com.*[Ii]ai.*&output=json&fl=original,timestamp,statuscode,mimetype&limit=20",
  ];

  for (const u of urls) {
    process.stdout.write(`\nCDX ${u.slice(0, 120)}...\n`);
    try {
      const r = await get(u);
      process.stdout.write(`status=${r.status} bytes=${r.body.length}\n`);
      const text = r.body.toString("utf8").trim();
      fs.writeFileSync(path.join(outDir, `cdx-${urls.indexOf(u)}.json`), r.body);
      if (text.startsWith("[")) {
        const rows = JSON.parse(text);
        process.stdout.write(`rows=${rows.length}\n`);
        for (const row of rows.slice(0, 30)) process.stdout.write(`  ${JSON.stringify(row)}\n`);
        for (const row of rows.slice(1)) {
          const [original, ts, status, mime] = row;
          if (String(mime || "").includes("pdf") || /\.pdf$/i.test(original)) {
            const wb = `https://web.archive.org/web/${ts}if_/${original}`;
            if (await saveIfPdf(wb, "ing-iai-biastii.pdf")) return;
          }
        }
      } else {
        process.stdout.write(text.slice(0, 300) + "\n");
      }
    } catch (e) {
      process.stdout.write(`ERR ${e.message}\n`);
    }
  }

  // VK topic page (may need login)
  const vk = "https://vk.com/topic-117529662_48808816";
  process.stdout.write(`\nVK ${vk}\n`);
  try {
    const r = await get(vk);
    fs.writeFileSync(path.join(outDir, "vk-topic.html"), r.body);
    process.stdout.write(`vk ${r.status} ${r.body.length}\n`);
    const html = r.body.toString("utf8");
    const links = new Set();
    for (const m of html.matchAll(/https?:\/\/[^"'\\\s>]+\.pdf/gi)) links.add(m[0]);
    for (const m of html.matchAll(/doc\d+_\d+/gi)) links.add("https://vk.com/" + m[0]);
    for (const m of html.matchAll(/href="([^"]+)"/gi)) {
      if (/pdf|doc|download|Боков|bokov|iai/i.test(m[1])) {
        try {
          links.add(new URL(m[1], vk).href);
        } catch {
          /* */
        }
      }
    }
    process.stdout.write(`vk links:\n`);
    for (const l of [...links].slice(0, 40)) process.stdout.write(`  ${l}\n`);
  } catch (e) {
    process.stdout.write(`VK ERR ${e.message}\n`);
  }

  // NEB / rusneb search API-ish pages
  const nebPages = [
    "https://search.rsl.ru/ru/search#q=%D0%86%D0%B0%D0%B8%20%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8%20%D0%B2%D0%86%D0%B0%D1%88%D0%B0%D0%B3%D0%86%D0%BA%D1%8A%D0%B0%D1%81%D1%82%D0%B0%D1%88",
    "https://www.rsl.ru/",
  ];

  // Google cache / archive.ph
  const archives = [
    "https://archive.ph/https://dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/",
    "https://webcache.googleusercontent.com/search?q=cache:dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/",
  ];
  for (const u of archives) {
    process.stdout.write(`\nARCHIVE ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  ${r.status} ${r.ct} ${r.body.length}\n`);
      const name = u.includes("archive.ph") ? "archive-ph.html" : "google-cache.html";
      fs.writeFileSync(path.join(outDir, name), r.body);
      const html = r.body.toString("utf8");
      const pdfs = [...html.matchAll(/https?:\/\/[^"'\\\s>]+\.pdf/gi)].map((m) => m[0]);
      process.stdout.write(`  pdfs: ${pdfs.slice(0, 10).join("\n    ")}\n`);
      for (const p of pdfs) {
        if (await saveIfPdf(p, "ing-iai-biastii.pdf")) return;
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }

  process.stdout.write("\nDONE no PDF yet\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
