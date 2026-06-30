/**
 * OCR разворота: левая половина = стр. 6, правая = стр. 7, склеить в один текст.
 * Usage: node scripts/ocr-ashik-spread-pages.js --pdf-page=5 --book-from=6
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pdf } = require("pdf-to-img");

const ROOT = path.join(__dirname, "..");
const PDF =
  "C:/Users/admin/Documents/ОСР/Г1алг1ай  лекции/Ашик-Кериб (Лермонтов).pdf";
const OUT_DIR = path.join(ROOT, "data", "external", "ashik-kerib", "spreads");
const TESSDATA = path.join(ROOT, "data", "external", "tessdata");
const SCALE = 3;

function tesseractBin() {
  return process.env.TESSERACT_CMD || "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
}

function cropHalves(pngPath, outLeft, outRight) {
  const ps1 = path.join(__dirname, "crop-spread-halves.ps1");
  execFileSync(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-PngPath", pngPath, "-OutLeft", outLeft, "-OutRight", outRight],
    { stdio: "pipe" }
  );
}

function runOcr(pngPath, txtPath) {
  const base = txtPath.replace(/\.txt$/, "");
  execFileSync(
    tesseractBin(),
    [pngPath, base, "-l", "rus", "--psm", "6", "--tessdata-dir", path.resolve(TESSDATA)],
    { stdio: "pipe" }
  );
  return fs.readFileSync(txtPath, "utf8");
}

function linesToFlow(raw) {
  const lines = (raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\d{1,2}(\s+\d{1,2})?$/.test(l));
  let text = "";
  for (const line of lines) {
    if (text.endsWith("-")) text = text.slice(0, -1) + line;
    else if (text) text += " " + line;
    else text = line;
  }
  return text.replace(/\s+/g, " ").trim();
}

async function main() {
  const pdfPage = Number(process.argv.find((a) => a.startsWith("--pdf-page="))?.slice(11) || 5);
  const bookFrom = Number(process.argv.find((a) => a.startsWith("--book-from="))?.slice(12) || 6);
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const spreadPng = path.join(OUT_DIR, `pdf-${pdfPage}.png`);
  const leftPng = path.join(OUT_DIR, `book-${bookFrom}-left.png`);
  const rightPng = path.join(OUT_DIR, `book-${bookFrom + 1}-right.png`);
  const leftTxt = path.join(OUT_DIR, `book-${bookFrom}.txt`);
  const rightTxt = path.join(OUT_DIR, `book-${bookFrom + 1}.txt`);
  const mergedTxt = path.join(OUT_DIR, `book-${bookFrom}-${bookFrom + 1}-merged.txt`);
  const mergedDoc = path.join(OUT_DIR, `book-${bookFrom}-${bookFrom + 1}-merged.doc`);

  if (!fs.existsSync(spreadPng)) {
    const doc = await pdf(PDF, { scale: SCALE });
    let n = 0;
    for await (const img of doc) {
      n += 1;
      if (n === pdfPage) {
        await fsp.writeFile(spreadPng, img);
        break;
      }
    }
  }

  cropHalves(spreadPng, leftPng, rightPng);
  const leftRaw = runOcr(leftPng, leftTxt);
  const rightRaw = runOcr(rightPng, rightTxt);
  const leftFlow = linesToFlow(leftRaw);
  const rightFlow = linesToFlow(rightRaw);
  const merged = `${leftFlow}\n\n${rightFlow}`;

  await fsp.writeFile(mergedTxt, merged, "utf8");

  const esc = (s) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Стр. ${bookFrom}–${bookFrom + 1}</title></head><body>
<h2>Ашик-Кериб — стр. ${bookFrom} + ${bookFrom + 1} (сплошной текст)</h2>
<p style="font-size:12pt;line-height:1.6">${esc(leftFlow)}</p>
<p style="font-size:12pt;line-height:1.6;margin-top:24px">${esc(rightFlow)}</p>
</body></html>`;
  await fsp.writeFile(mergedDoc, "\uFEFF" + html, "utf8");

  const desktop = path.join(
    process.env.USERPROFILE || "",
    "Desktop",
    `Ашик-Кериб-стр-${bookFrom}-${bookFrom + 1}.doc`
  );
  await fsp.writeFile(desktop, "\uFEFF" + html, "utf8");

  process.stdout.write(`Стр. ${bookFrom}: ${leftFlow.length} симв.\n`);
  process.stdout.write(`Стр. ${bookFrom + 1}: ${rightFlow.length} симв.\n`);
  process.stdout.write(`Desktop: ${desktop}\n`);
  process.stdout.write(`\n--- начало ---\n${leftFlow.slice(0, 400)}...\n`);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
