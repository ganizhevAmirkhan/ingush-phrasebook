/** Scrape Russian text of Сыновья Беки from groznycity / libking mirrors. */
const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", "data", "external", "synovya-beki");
fs.mkdirSync(OUT, { recursive: true });

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,*/*" },
        timeout: 30000
      },
      (res) => {
        if ([301, 302].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return get(new URL(res.headers.location, url).href).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function scrapeGrozny() {
  const pages = [];
  for (let i = 1; i <= 200; i += 1) {
    const url =
      i === 1
        ? "http://www.groznycity.ru/library/prose/bokov/document4831.shtml"
        : `http://www.groznycity.ru/library/prose/bokov/document4831_${i}.shtml`;
    process.stdout.write(`page ${i} `);
    try {
      const r = await get(url);
      if (r.status !== 200) {
        process.stdout.write(`status=${r.status}\n`);
        break;
      }
      const text = htmlToText(r.body);
      if (text.length < 400 || /Страница не найдена/i.test(text)) {
        process.stdout.write(`empty/stop len=${text.length}\n`);
        break;
      }
      pages.push(text);
      process.stdout.write(`ok ${text.length}\n`);
    } catch (e) {
      process.stdout.write(`ERR ${e.message}\n`);
      break;
    }
  }
  const out = path.join(OUT, "ru-synovya-beki.txt");
  fs.writeFileSync(out, pages.join("\n\n"), "utf8");
  process.stdout.write(`SAVED ${out} pages=${pages.length} bytes=${fs.statSync(out).size}\n`);
}

async function scrapeLibkingSample() {
  // first pages often available
  const urls = [
    "https://libking.ru/books/prose-/prose-history/184040-ahmed-bokov-synovya-beki.html",
    "https://libking.ru/books/prose-/prose-history/184040-1-ahmed-bokov-synovya-beki.html",
    "https://libking.ru/books/prose-/prose-history/184040-2-ahmed-bokov-synovya-beki.html"
  ];
  for (const u of urls) {
    process.stdout.write(`libking ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  ${r.status} ${r.body.length}\n`);
      if (r.status === 200) {
        fs.writeFileSync(path.join(OUT, `libking-${path.basename(u)}`), r.body, "utf8");
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }
}

async function main() {
  await scrapeGrozny();
  await scrapeLibkingSample();
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
