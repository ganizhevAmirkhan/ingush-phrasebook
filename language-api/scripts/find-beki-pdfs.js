const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 30000 }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          return fetch(new URL(res.headers.location, url).href).then(resolve, reject);
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
      })
      .on("error", reject);
  });
}

async function pagePdfs(pageUrl) {
  const { status, body } = await fetch(pageUrl);
  const html = body.toString("utf8");
  const title = html.match(/<h1[^>]*>([^<]+)/i)?.[1]?.trim() || pageUrl;
  const uploads = [...html.matchAll(/\/wp-content\/uploads\/[^"'\\s>]+\.pdf/gi)].map((m) => "https://dzurdzuki.com" + m[0]);
  const dm = [...html.matchAll(/download-manager-files\/[^"'\\s>]+\.pdf/gi)].map(
    (m) => "https://dzurdzuki.com/wp-content/uploads/" + m[0]
  );
  const abs = [...html.matchAll(/https?:\/\/[^"'\\s>]+\.pdf/gi)].map((m) => m[0]);
  const all = [...new Set([...uploads, ...dm, ...abs])];
  return { status, title, pdfs: all, htmlLen: html.length };
}

async function download(url, outPath) {
  const { status, body, headers } = await fetch(url);
  if (status !== 200) throw new Error(`HTTP ${status} for ${url}`);
  const ctype = (headers["content-type"] || "").toLowerCase();
  if (!ctype.includes("pdf") && !url.toLowerCase().endsWith(".pdf") && body.slice(0, 4).toString() !== "%PDF") {
    throw new Error(`Not a PDF (${ctype}) ${url}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body);
  return body.length;
}

async function main() {
  const pages = [
    "https://dzurdzuki.com/download/bokov-a-h-synovya-beki-perevod-r-kafrielyants-1977/",
    "https://dzurdzuki.com/download/bokov-a-h-iai-biastii-viashagikastash-1984/"
  ];
  const outDir = path.join(__dirname, "..", "data", "external", "synovya-beki");
  fs.mkdirSync(outDir, { recursive: true });

  for (const page of pages) {
    process.stdout.write(`\nPAGE ${page}\n`);
    try {
      const info = await pagePdfs(page);
      process.stdout.write(`  status=${info.status} title=${info.title} html=${info.htmlLen}\n`);
      process.stdout.write(`  pdfs=${info.pdfs.length}\n`);
      for (const u of info.pdfs) process.stdout.write(`   - ${u}\n`);
      if (info.pdfs[0]) {
        const name = /iai|бIаьст|viashag/i.test(page) ? "ing-iai-biastii.pdf" : "ru-synovya-beki-1977.pdf";
        const out = path.join(outDir, name);
        const n = await download(info.pdfs[0], out);
        process.stdout.write(`  saved ${out} (${n} bytes)\n`);
      }
    } catch (e) {
      process.stdout.write(`  ERR ${e.message}\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
