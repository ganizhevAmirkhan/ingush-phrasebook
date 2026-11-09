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
          Accept: "text/html,application/json,*/*",
        },
        timeout: 60000,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects > 8) return reject(new Error("too many redirects"));
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

const queries = [
  // DuckDuckGo HTML (lite)
  "https://html.duckduckgo.com/html/?q=%22%D0%86%D0%B0%D0%B8+%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8%22+%D0%91%D0%BE%D0%BA%D0%BE%D0%B2+pdf",
  "https://html.duckduckgo.com/html/?q=%22%D0%91%D0%B5%D0%BA%D0%B5+%D0%BA%D1%8A%D0%BE%D0%BD%D0%B3%D0%B0%D1%88%22+%D0%91%D0%BE%D0%BA%D0%BE%D0%B2",
  "https://html.duckduckgo.com/html/?q=Bokov+%22Iai+bIastii%22+pdf",
  "https://html.duckduckgo.com/html/?q=%22%D0%A1%D1%8B%D0%BD%D0%BE%D0%B2%D1%8C%D1%8F+%D0%91%D0%B5%D0%BA%D0%B8%22+%D0%B8%D0%BD%D0%B3%D1%83%D1%88%D1%81%D0%BA%D0%BE%D0%BC+pdf",
  // Yandex (may block)
  "https://yandex.ru/search/?text=%22%D0%86%D0%B0%D0%B8+%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8+%D0%B2%D0%86%D0%B0%D1%88%D0%B0%D0%B3%D0%86%D0%BA%D1%8A%D0%B0%D1%81%D1%82%D0%B0%D1%88%22",
];

const directPages = [
  "https://dzurdzuki.com/?s=%D0%86%D0%B0%D0%B8+%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8",
  "https://dzurdzuki.com/?s=%D0%91%D0%B5%D0%BA%D0%B5+%D0%BA%D1%8A%D0%BE%D0%BD%D0%B3%D0%B0%D1%88",
  "https://dzurdzuki.com/?s=%D0%91%D0%BE%D0%BA%D0%BE%D0%B2",
  "https://ingush.neocities.org/",
  "https://libking.ru/books/prose-/prose-rus-classic/130363-ahmed-bokov-synovya-beki.html",
  "https://www.litres.ru/book/ahmed-bokov/synovya-beki-69382621/",
  "https://flibusta.is/booksearch?ask=%D0%A1%D1%8B%D0%BD%D0%BE%D0%B2%D1%8C%D1%8F+%D0%91%D0%B5%D0%BA%D0%B8",
  "https://flibusta.su/booksearch?ask=%D0%A1%D1%8B%D0%BD%D0%BE%D0%B2%D1%8C%D1%8F+%D0%91%D0%B5%D0%BA%D0%B8",
  "https://archive.org/search?query=Bokov+Iai+biastii",
  "https://archive.org/search?query=%22%D0%A1%D1%8B%D0%BD%D0%BE%D0%B2%D1%8C%D1%8F+%D0%91%D0%B5%D0%BA%D0%B8%22+%D0%91%D0%BE%D0%BA%D0%BE%D0%B2",
  "https://www.booksee.org/g/%D0%A1%D1%8B%D0%BD%D0%BE%D0%B2%D1%8C%D1%8F+%D0%91%D0%B5%D0%BA%D0%B8",
  "https://b-ok.xyz/s/?q=%D0%A1%D1%8B%D0%BD%D0%BE%D0%B2%D1%8C%D1%8F+%D0%91%D0%B5%D0%BA%D0%B8+%D0%91%D0%BE%D0%BA%D0%BE%D0%B2",
  "https://ru.z-library.sk/s/?q=%D0%86%D0%B0%D0%B8+%D0%B1%D0%86%D0%B0%D1%8C%D1%81%D1%82%D0%B8%D0%B8",
];

async function probe(url, tag) {
  process.stdout.write(`\n=== ${tag} ===\n${url}\n`);
  try {
    const r = await get(url);
    const html = r.body.toString("utf8");
    const file = path.join(outDir, `probe-${tag}.html`);
    fs.writeFileSync(file, r.body);
    process.stdout.write(`status=${r.status} bytes=${r.body.length} saved=${path.basename(file)}\n`);

    // Extract interesting links
    const links = new Set();
    for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = m[1];
      if (/pdf|download|bokov|beki|iai|бIаьст|беке|сыновья/i.test(href)) {
        try {
          links.add(new URL(href, url).href);
        } catch {
          /* ignore */
        }
      }
    }
    // Also uddg redirects from duckduckgo
    for (const m of html.matchAll(/uddg=([^&"']+)/gi)) {
      try {
        links.add(decodeURIComponent(m[1]));
      } catch {
        /* ignore */
      }
    }
    const arr = [...links].slice(0, 40);
    process.stdout.write(`interesting links (${arr.length}):\n`);
    for (const l of arr) process.stdout.write(`  ${l}\n`);
    return arr;
  } catch (e) {
    process.stdout.write(`ERR ${e.message}\n`);
    return [];
  }
}

async function main() {
  const all = new Set();
  let i = 0;
  for (const q of queries) {
    const links = await probe(q, `ddg-${++i}`);
    links.forEach((l) => all.add(l));
  }
  i = 0;
  for (const p of directPages) {
    const links = await probe(p, `page-${++i}`);
    links.forEach((l) => all.add(l));
  }
  fs.writeFileSync(path.join(outDir, "found-links.json"), JSON.stringify([...all], null, 2));
  process.stdout.write(`\nTOTAL unique interesting links: ${all.size}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
