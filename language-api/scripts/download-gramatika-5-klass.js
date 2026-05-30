const fs = require("node:fs");
const fsp = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");

const PDF_URL =
  "https://dzurdzuki.com/wp-content/uploads/download-manager-files/malsagova-l.-d.-cziczkieva-a.-d.-gialgiaj-metta-gramatika-5-klass.-magas-2010-g..pdf";

const OUT_DIR = path.join(
  __dirname,
  "..",
  "data",
  "external",
  "textbooks",
  "gialgiai-metta-gramatika-5-klass-2010"
);
const OUT_FILE = path.join(OUT_DIR, "gialgiai-metta-gramatika-5-klass-2010-source.pdf");

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "ingush-phrasebook/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          download(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  if (fs.existsSync(OUT_FILE) && fs.statSync(OUT_FILE).size > 1_000_000) {
    process.stdout.write(`Already downloaded: ${OUT_FILE}\n`);
    return;
  }
  process.stdout.write(`Downloading…\n${PDF_URL}\n`);
  const buf = await download(PDF_URL);
  await fsp.writeFile(OUT_FILE, buf);
  process.stdout.write(`Saved ${OUT_FILE} (${(buf.length / 1024 / 1024).toFixed(2)} MB)\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
