const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "..", "data", "external", "synovya-beki", "ru-candidates");
fs.mkdirSync(OUT, { recursive: true });

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 45000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 8) {
          return get(new URL(res.headers.location, url).href, redirects + 1).then(resolve, reject);
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
      })
      .on("error", reject);
  });
}

async function main() {
  const urls = [
    "https://dzurdzuki.com/wp-content/uploads/download-manager-files/Bokov-A.H.-Synovya-Beki-perevod-R.Kafrielyanc-1977.pdf",
    "https://dzurdzuki.com/wp-content/uploads/download-manager-files/bokov-a-h-synovya-beki-perevod-r-kafrielyants-1977.pdf",
    "https://dzurdzuki.com/wp-content/uploads/download-manager-files/Боков-А.Х.-Сыновья-Беки-перевод-Р.Кафриэлянц-1977.pdf",
    "http://groznycity.ru/library/prose/bokov/document4831.shtml"
  ];
  for (const u of urls) {
    process.stdout.write(`TRY ${u}\n`);
    try {
      const r = await get(u);
      process.stdout.write(`  status=${r.status} ctype=${r.ctype} bytes=${r.body.length} final=${r.url}\n`);
      if (r.status === 200 && (r.ctype.includes("pdf") || r.body.slice(0, 4).toString() === "%PDF")) {
        const out = path.join(OUT, "synovya-beki-ru.pdf");
        fs.writeFileSync(out, r.body);
        process.stdout.write(`  SAVED ${out}\n`);
        return;
      }
      if (r.status === 200 && r.ctype.includes("html")) {
        const html = r.body.toString("utf8");
        const pdfs = [...html.matchAll(/https?:\/\/[^"'\\s>]+\.pdf/gi)].map((m) => m[0]);
        const uploads = [...html.matchAll(/\/wp-content\/uploads\/[^"'\\s>]+\.pdf/gi)].map((m) => m[0]);
        process.stdout.write(`  html pdfs=${pdfs.slice(0, 5).join(" | ")}\n`);
        process.stdout.write(`  uploads=${uploads.slice(0, 5).join(" | ")}\n`);
        fs.writeFileSync(path.join(OUT, "page.html"), html.slice(0, 200000), "utf8");
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }
}

main();
