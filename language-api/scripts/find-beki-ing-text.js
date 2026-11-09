const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

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
          Accept: "text/html,application/xhtml+xml,*/*",
          "Accept-Encoding": "gzip, deflate",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        timeout: 60000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 10) return reject(new Error("too many redirects"));
          return get(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
        }
        let stream = res;
        const enc = res.headers["content-encoding"];
        if (enc === "gzip") stream = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
        const chunks = [];
        stream.on("data", (d) => chunks.push(d));
        stream.on("end", () =>
          resolve({
            status: res.statusCode,
            ct: res.headers["content-type"] || "",
            body: Buffer.concat(chunks),
            url,
          })
        );
        stream.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

const pages = [
  "https://bibling.ru/book/%d1%81%d1%8b%d0%bd%d0%be%d0%b2%d1%8c%d1%8f-%d0%b1%d0%b5%d0%ba%d0%b8/",
  "https://bibling.ru/?s=%D0%91%D0%B5%D0%BA%D0%B5+%D0%BA%D1%8A%D0%BE%D0%BD%D0%B3%D0%B0%D1%88",
  "https://bibling.ru/?s=%D0%86%D0%B0%D0%B8+%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8",
  "https://bibling.ru/?s=%D0%91%D0%BE%D0%BA%D0%BE%D0%B2",
  "https://ingushwarrior.neocities.org/",
  "https://www.gazetaingush.ru/kultura/beke-kongash-synovya-beki-ahmeta-bokova",
  "https://html.duckduckgo.com/html/?q=%22%D0%91%D0%B5%D0%BA%D0%B5+%D0%BA%D1%8A%D0%BE%D0%BD%D0%B3%D0%B0%D1%88%22+fb2+OR+epub+OR+txt",
  "https://html.duckduckgo.com/html/?q=%22Iаи+бIаьстии%22+fb2+OR+epub+текст",
  "https://flibusta.is/booksearch?ask=%D0%91%D0%B5%D0%BA%D0%B5+%D0%BA%D1%8A%D0%BE%D0%BD%D0%B3%D0%B0%D1%88",
  "https://flibusta.is/booksearch?ask=%D0%86%D0%B0%D0%B8+%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8",
];

async function main() {
  const allLinks = new Set();
  for (const [i, url] of pages.entries()) {
    process.stdout.write(`\n=== ${i} ${url}\n`);
    try {
      const r = await get(url);
      const file = path.join(outDir, `textprobe-${i}.html`);
      fs.writeFileSync(file, r.body);
      process.stdout.write(`status=${r.status} bytes=${r.body.length}\n`);
      const html = r.body.toString("utf8");
      for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
        const href = m[1];
        if (/\.(fb2|epub|txt|docx?|rtf|djvu)(\b|$)/i.test(href) || /download|скач|fb2|epub|Беке|къонгаш|iai|bokov|Боков/i.test(href)) {
          try {
            allLinks.add(new URL(href, url).href);
          } catch {
            /* */
          }
        }
      }
      for (const m of html.matchAll(/uddg=([^&"']+)/gi)) {
        try {
          allLinks.add(decodeURIComponent(m[1]));
        } catch {
          /* */
        }
      }
      // snippet language hints
      const hasIng = /къонгаш|бIаьстии|бІаьстии|гIалгIай|ингушск/i.test(html);
      const hasRu = /Сыновья Беки/i.test(html);
      process.stdout.write(`hasIng=${hasIng} hasRu=${hasRu}\n`);
    } catch (e) {
      process.stdout.write(`ERR ${e.message}\n`);
    }
  }
  const arr = [...allLinks];
  fs.writeFileSync(path.join(outDir, "text-links.json"), JSON.stringify(arr, null, 2));
  process.stdout.write(`\nLINKS ${arr.length}\n`);
  for (const l of arr.slice(0, 80)) process.stdout.write(`  ${l}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
