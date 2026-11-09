const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const OUT = path.join(__dirname, "..", "data", "external", "synovya-beki");

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "*/*",
          Referer: "https://en.booksee.org/"
        },
        timeout: 60000
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 10) {
          const next = new URL(res.headers.location, url).href;
          res.resume();
          return get(next, redirects + 1).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks),
            ctype: res.headers["content-type"] || "",
            url
          })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  const pages = [
    "https://en.booksee.org/book/40924",
    "https://en.libcats.org/book/40924",
    "https://booksee.org/book/40924",
    "https://b-ok.cc/book/40924",
    "https://z-library.sk/book/40924"
  ];
  for (const u of pages) {
    process.stdout.write(`\nPAGE ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  ${r.status} ${r.ctype} ${r.body.length}\n`);
      if (r.status !== 200) continue;
      const html = r.body.toString("utf8");
      fs.writeFileSync(path.join(OUT, `booksee-${Buffer.from(u).toString("hex").slice(0, 16)}.html`), html.slice(0, 200000));
      const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
        .map((m) => m[1])
        .filter((h) => /download|get\.php|dl2|fb2|epub|pdf|djvu|md5/i.test(h))
        .slice(0, 30);
      process.stdout.write(`  links: ${links.join(" | ")}\n`);
      for (const link of links.slice(0, 10)) {
        const abs = new URL(link, u).href;
        process.stdout.write(`  GET ${abs}\n`);
        try {
          const f = await get(abs);
          process.stdout.write(`    ${f.status} ${f.ctype} ${f.body.length}\n`);
          if (f.status === 200 && f.body.length > 50000) {
            const name =
              f.body.slice(0, 4).toString() === "%PDF-"
                ? "ru-synovya-beki-booksee.pdf"
                : f.body.slice(0, 2).toString("hex") === "504b"
                  ? "ru-synovya-beki-booksee.zip"
                  : "ru-synovya-beki-booksee.bin";
            fs.writeFileSync(path.join(OUT, name), f.body);
            process.stdout.write(`    SAVED ${name}\n`);
            return;
          }
        } catch (e) {
          process.stdout.write(`    ERR ${e.message}\n`);
        }
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }
}

main();
