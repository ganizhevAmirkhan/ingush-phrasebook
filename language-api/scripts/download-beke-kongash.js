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
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate",
          "Accept-Language": "ru-RU,ru;q=0.9",
        },
        timeout: 180000,
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

async function savePdf(buf, name) {
  const dest = path.join(outDir, name);
  fs.writeFileSync(dest, buf);
  const desk = path.join(process.env.USERPROFILE || "", "Desktop", name);
  fs.writeFileSync(desk, buf);
  process.stdout.write(`SAVED ${dest} (${buf.length})\nSAVED ${desk}\n`);
}

async function main() {
  const pages = [
    "https://dzurdzuki.com/download/bokov-a-h-beke-kongash-1991/",
    "https://dzurdzuki.com/?s=%D0%91%D0%B5%D0%BA%D0%B5+%D0%BA%D1%8A%D0%BE%D0%BD%D0%B3%D0%B0%D1%88",
    "https://paydadosh.ru/",
    "https://t.me/lorabemoxk/409",
  ];

  for (const page of pages) {
    process.stdout.write(`\nPAGE ${page}\n`);
    try {
      const r = await get(page);
      process.stdout.write(`status=${r.status} ct=${r.ct} bytes=${r.body.length}\n`);
      const tag = page.includes("payda") ? "payda" : page.includes("t.me") ? "tg" : page.includes("?s=") ? "search" : "beke";
      fs.writeFileSync(path.join(outDir, `beke-page-${tag}.html`), r.body);
      if (r.body.slice(0, 5).toString() === "%PDF-") {
        await savePdf(r.body, "ing-beke-kongash.pdf");
        return;
      }
      const html = r.body.toString("utf8");
      const pdfs = new Set();
      for (const m of html.matchAll(/https?:\/\/[^"'\\\s>]+\.pdf/gi)) pdfs.add(m[0]);
      for (const m of html.matchAll(/\/wp-content\/uploads\/[^"'\\\s>]+\.pdf/gi)) {
        pdfs.add(new URL(m[0], "https://dzurdzuki.com").href);
      }
      for (const m of html.matchAll(/href=["']([^"']+\.pdf)["']/gi)) {
        try {
          pdfs.add(new URL(m[1], page).href);
        } catch {
          /* */
        }
      }
      process.stdout.write(`pdfs: ${[...pdfs].join("\n  ")}\n`);
      for (const u of pdfs) {
        process.stdout.write(`GET ${u}\n`);
        try {
          const f = await get(u);
          process.stdout.write(`  ${f.status} ${f.ct} ${f.body.length} magic=${f.body.slice(0, 5)}\n`);
          if (f.status === 200 && f.body.slice(0, 5).toString() === "%PDF-" && f.body.length > 500000) {
            await savePdf(f.body, "ing-beke-kongash.pdf");
            return;
          }
        } catch (e) {
          process.stdout.write(`  ERR ${e.message}\n`);
        }
      }
    } catch (e) {
      process.stdout.write(`ERR ${e.message}\n`);
    }
  }
  process.stdout.write("NOT FOUND\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
