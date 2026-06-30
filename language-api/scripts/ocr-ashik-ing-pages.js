/**
 * Точный OCR ингушского «Ашик-Кериб» (страницы 3–17, scale=3, psm=4).
 * Usage: node scripts/ocr-ashik-ing-pages.js [--force]
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pdf } = require("pdf-to-img");

const ROOT = path.join(__dirname, "..");
const PDF =
  "C:/Users/admin/Documents/ОСР/Г1алг1ай  лекции/Ашик-Кериб (Лермонтов).pdf";
const PAGES_DIR = path.join(ROOT, "data", "external", "ashik-kerib", "ing-ocr", "pages");
const TESSDATA = path.join(ROOT, "data", "external", "tessdata");
const FROM = 3;
const TO = 17;
const SCALE = 3;

function tesseractBin() {
  return process.env.TESSERACT_CMD || "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
}

function runOcr(pngPath, txtBase) {
  execFileSync(
    tesseractBin(),
    [pngPath, txtBase, "-l", "rus", "--psm", "4", "--tessdata-dir", path.resolve(TESSDATA)],
    { stdio: "pipe" }
  );
}

async function main() {
  const force = process.argv.includes("--force");
  await fsp.mkdir(PAGES_DIR, { recursive: true });
  const doc = await pdf(PDF, { scale: SCALE });
  let pageNum = 0;
  for await (const img of doc) {
    pageNum += 1;
    if (pageNum < FROM) continue;
    if (pageNum > TO) break;
    const stem = `page-${String(pageNum).padStart(4, "0")}`;
    const pngPath = path.join(PAGES_DIR, `${stem}.png`);
    const txtPath = path.join(PAGES_DIR, `${stem}.txt`);
    if (force || !fs.existsSync(pngPath)) await fsp.writeFile(pngPath, img);
    if (force || !fs.existsSync(txtPath)) {
      runOcr(pngPath, path.join(PAGES_DIR, stem));
      process.stdout.write(`OCR page ${pageNum}\n`);
    }
  }
  process.stdout.write("Done.\n");
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
