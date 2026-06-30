/**
 * Весь «Ашик-Кериб» (ингушский PDF): каждый лист = левая стр. + правая стр.
 *
 * Usage:
 *   node scripts/ocr-ashik-full-book.js
 *   node scripts/ocr-ashik-full-book.js --from=4 --to=16 --scale=4
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
const PS1 = path.join(__dirname, "crop-spread-halves.ps1");
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

function parseArgs(argv) {
  return {
    from: Number(argv.find((a) => a.startsWith("--from="))?.slice(7) || 4),
    to: Number(argv.find((a) => a.startsWith("--to="))?.slice(5) || 16),
    scale: Number(argv.find((a) => a.startsWith("--scale="))?.slice(8) || 4),
    force: argv.includes("--force")
  };
}

function tesseractBin() {
  return process.env.TESSERACT_CMD || "C:\\Program Files\\Tesseract-OCR\\tesseract.exe";
}

function cropHalves(pngPath, outLeft, outRight, tight = false) {
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, "-PngPath", pngPath, "-OutLeft", outLeft, "-OutRight", outRight];
  if (tight) args.push("-Tight");
  execFileSync(POWERSHELL, args, { stdio: "pipe" });
}

function cyrRatio(text) {
  if (!text) return 0;
  const cyr = (text.match(/[а-яёА-ЯЁ]/g) || []).length;
  return cyr / text.length;
}

function runOcr(pngPath, txtBase, psm = "4") {
  execFileSync(
    tesseractBin(),
    [pngPath, txtBase, "-l", "rus", "--psm", psm, "--tessdata-dir", path.resolve(TESSDATA)],
    { stdio: "pipe" }
  );
  return fs.readFileSync(`${txtBase}.txt`, "utf8");
}

function ocrBest(pngPath, txtBase) {
  const a = runOcr(pngPath, `${txtBase}-psm4`, "4");
  const b = runOcr(pngPath, `${txtBase}-psm6`, "6");
  const pick = cyrRatio(a) >= cyrRatio(b) ? a : b;
  fs.writeFileSync(`${txtBase}.txt`, pick, "utf8");
  return pick;
}

function fixPalochka(text) {
  return (text || "").replace(/!/g, "1");
}

function lightClean(text) {
  return fixPalochka(
    text
      .replace(/[^\sа-яёА-ЯЁI1i!ӏ0-9.,!?;:"«»—\-„"'()]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanGarbage(text) {
  if (!text) return "";
  const parts = text.split(/(?<=[.!?…])\s+/);
  const kept = [];
  for (let p of parts.length > 1 ? parts : [text]) {
    p = p.trim();
    if (p.length < 8) continue;
    const cyr = (p.match(/[а-яёА-ЯЁ]/g) || []).length;
    const junk = (p.match(/[^а-яёА-ЯЁI1i!ӏ0-9\s.,!?;:"«»—\-„"'()]/g) || []).length;
    if (cyr < p.length * 0.45) continue;
    if (junk > p.length * 0.18) continue;
    if (/ИЗДАТЕЛЬ|ЛЕРМОНТОВ|ЧЕЧЕНО|1958|перевод/i.test(p) && p.length < 80) continue;
    kept.push(p);
  }
  if (kept.length) return kept.join(" ");
  if (cyrRatio(text) >= 0.4) return lightClean(text);
  return "";
}

function mergeLines(raw) {
  const lines = (raw || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.length < 2) return false;
      if (/^\d{1,2}(\s+\d{1,2})?$/.test(l)) return false;
      if (/^[©\|\)\}\*:\s]{1,5}$/.test(l)) return false;
      return true;
    });
  let text = "";
  for (let line of lines) {
    line = line.replace(/^[)\}\|:\*©\s]+|[)\}\|:\*©\s]+$/g, "").trim();
    if (!line) continue;
    if (text.endsWith("-")) text = text.slice(0, -1) + line;
    else if (text) text += " " + line;
    else text = line;
  }
  return text.replace(/\s+/g, " ").trim();
}

function isValidIngush(text) {
  if (!text || text.length < 50) return false;
  if (cyrRatio(text) < 0.62) return false;
  const words = text.split(/\s+/).filter((w) => w.length >= 3 && /[а-яё]/i.test(w));
  if (words.length < 8) return false;
  if (/[г1ц1х1]/i.test(text) || /(аьлар|цунна|Хьо|со |из )/.test(text)) return true;
  return words.length >= 12;
}

function linesToFlow(raw) {
  const merged = mergeLines(raw);
  if (!merged) return "";
  const cleaned = cleanGarbage(merged);
  const candidate = cleaned || (cyrRatio(merged) >= 0.35 ? lightClean(merged) : "");
  return fixPalochka(isValidIngush(candidate) ? candidate : "");
}

function ocrColumn(spreadPng, side, pdfPage) {
  const leftPng = path.join(OUT_DIR, `pdf-${pdfPage}-left.png`);
  const rightPng = path.join(OUT_DIR, `pdf-${pdfPage}-right.png`);
  const png = side === "left" ? leftPng : rightPng;
  const txtBase = path.join(OUT_DIR, `pdf-${pdfPage}-${side}`);

  cropHalves(spreadPng, leftPng, rightPng, false);
  let raw = ocrBest(png, txtBase);
  let flow = linesToFlow(raw);
  if (flow.length < 60 || cyrRatio(raw) < 0.25) {
    cropHalves(spreadPng, leftPng, rightPng, true);
    const tightRaw = ocrBest(png, `${txtBase}-retry`);
    const tightFlow = linesToFlow(tightRaw);
    if (tightFlow.length > flow.length || cyrRatio(tightRaw) > cyrRatio(raw)) flow = tightFlow;
  }
  return flow;
}

function bookPages(pdfPage) {
  const left = pdfPage * 2 - 4;
  return { left, right: left + 1 };
}

async function renderPdfPage(pdfPage, scale, outPng) {
  const doc = await pdf(PDF, { scale });
  let n = 0;
  for await (const img of doc) {
    n += 1;
    if (n === pdfPage) {
      await fsp.writeFile(outPng, img);
      return;
    }
  }
  throw new Error(`PDF page ${pdfPage} not found`);
}

async function processSpread(pdfPage, args) {
  const spreadPng = path.join(OUT_DIR, `pdf-${pdfPage}.png`);

  if (args.force || !fs.existsSync(spreadPng)) {
    await renderPdfPage(pdfPage, args.scale, spreadPng);
  }
  const left = ocrColumn(spreadPng, "left", pdfPage);
  const right = ocrColumn(spreadPng, "right", pdfPage);
  return { pdfPage, left, right, book: bookPages(pdfPage), merged: [left, right].filter(Boolean).join("\n\n") };
}

function buildHtml(title, spreads) {
  const esc = (s) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = spreads
    .map((s) => {
      const hdr = `<h3 style="font-family:Georgia;margin:24px 0 8px 0;color:#333">Стр. ${s.book.left} (слева) + ${s.book.right} (справа)</h3>`;
      const left = s.left
        ? `<p style="font-size:12pt;line-height:1.65;font-family:Georgia;text-align:justify;margin:0 0 12px 0">${esc(s.left)}</p>`
        : `<p style="font-size:11pt;color:#999;margin:0 0 12px 0"><i>Стр. ${s.book.left}: декоративная рамка (текста нет)</i></p>`;
      const right = s.right
        ? `<p style="font-size:12pt;line-height:1.65;font-family:Georgia;text-align:justify;margin:0 0 20px 0;color:#004080">${esc(s.right)}</p>`
        : `<p style="font-size:11pt;color:#999;margin:0 0 20px 0"><i>Стр. ${s.book.right}: декоративная рамка (текста нет)</i></p>`;
      return hdr + left + right;
    })
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>
<h2 style="font-family:Georgia;text-align:center">${esc(title)}</h2>
<p style="color:#666;font-size:10pt;text-align:center">Каждый разворот: сначала левая страница, затем правая</p>
${body}
</body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const spreads = [];
  for (let p = args.from; p <= args.to; p += 1) {
    process.stdout.write(`PDF ${p}/${args.to}…\n`);
    try {
      const r = await processSpread(p, args);
      if (r.left.length + r.right.length > 20) spreads.push(r);
      process.stdout.write(`  left ${r.left.length} + right ${r.right.length} chars\n`);
    } catch (e) {
      process.stdout.write(`  skip: ${e.message}\n`);
    }
  }

  const allText = spreads
    .flatMap((s) => [s.left, s.right].filter(Boolean))
    .join("\n\n");
  const perSpread = spreads
    .map(
      (s) =>
        `=== Стр. ${s.book.left} (слева) ===\n${s.left || "[рамка]"}\n\n=== Стр. ${s.book.right} (справа) ===\n${s.right || "[рамка]"}`
    )
    .join("\n\n");

  await fsp.writeFile(path.join(OUT_DIR, "book-full.txt"), allText, "utf8");
  await fsp.writeFile(path.join(OUT_DIR, "book-by-spread.txt"), perSpread, "utf8");

  const html = buildHtml("Ашик-Кериб — полный текст (ингушский)", spreads);
  const docPath = path.join(OUT_DIR, "Ашик-Кериб-инг-полный.doc");
  await fsp.writeFile(docPath, "\uFEFF" + html, "utf8");

  const desktop = path.join(process.env.USERPROFILE || "", "Desktop", "Ашик-Кериб-инг-полный.doc");
  await fsp.writeFile(desktop, "\uFEFF" + html, "utf8");

  const docs = path.join(
    process.env.USERPROFILE || "",
    "Documents",
    "ОСР",
    "Г1алг1ай  лекции",
    "Ашик-Кериб-инг-полный.doc"
  );
  try {
    await fsp.writeFile(docs, "\uFEFF" + html, "utf8");
  } catch {
    /* ignore */
  }

  process.stdout.write(`\nРазворотов: ${spreads.length}\n`);
  process.stdout.write(`Символов: ${allText.length}\n`);
  process.stdout.write(`Desktop: ${desktop}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e}\n`);
  process.exit(1);
});
