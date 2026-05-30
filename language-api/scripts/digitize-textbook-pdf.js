/**
 * OCR scan PDF → searchable digital PDF + extracted.txt
 *
 * Requires: Tesseract OCR (tesseract --version)
 * Downloads rus.traineddata on first run if missing.
 *
 * Usage:
 *   node scripts/digitize-textbook-pdf.js --input="data/external/textbooks/.../source.pdf"
 *   node scripts/digitize-textbook-pdf.js --input=... --from=1 --to=10
 *   node scripts/digitize-textbook-pdf.js --input=... --text-only
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const https = require("node:https");
const pdfParse = require("pdf-parse");
const { PDFDocument } = require("pdf-lib");
const { pdf } = require("pdf-to-img");

const ROOT = path.join(__dirname, "..");
const TESSDATA_DIR = path.join(ROOT, "data", "external", "tessdata");
const RUS_DATA_URL = "https://github.com/tesseract-ocr/tessdata/raw/main/rus.traineddata";

function parseArgs(argv) {
  const out = {
    input: "",
    outDir: "",
    from: 1,
    to: 0,
    scale: 2,
    lang: "rus",
    textOnly: false,
    rebuildOnly: false,
    dpiNote: 300
  };
  for (const arg of argv) {
    if (arg.startsWith("--input=")) out.input = arg.slice("--input=".length);
    else if (arg.startsWith("--out-dir=")) out.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--from=")) out.from = Number(arg.slice("--from=".length)) || 1;
    else if (arg.startsWith("--to=")) out.to = Number(arg.slice("--to=".length)) || 0;
    else if (arg.startsWith("--scale=")) out.scale = Number(arg.slice("--scale=".length)) || 2;
    else if (arg.startsWith("--lang=")) out.lang = arg.slice("--lang=".length) || "rus";
    else if (arg === "--text-only") out.textOnly = true;
    else if (arg === "--rebuild-only") out.rebuildOnly = true;
  }
  return out;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "ingush-phrasebook-digitize" } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          getJson(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

async function ensureRusTessdata() {
  await fsp.mkdir(TESSDATA_DIR, { recursive: true });
  const rusPath = path.join(TESSDATA_DIR, "rus.traineddata");
  if (!fs.existsSync(rusPath) || fs.statSync(rusPath).size < 1_000_000) {
    process.stdout.write("Downloading rus.traineddata (~19 MB)…\n");
    const buf = await getJson(RUS_DATA_URL);
    await fsp.writeFile(rusPath, buf);
    process.stdout.write(`Saved ${rusPath}\n`);
  }
  return path.resolve(TESSDATA_DIR);
}

function tesseractBin() {
  return process.env.TESSERACT_CMD || "tesseract";
}

function runTesseract(pngPath, outBase, lang, tessdataDir) {
  execFileSync(
    tesseractBin(),
    [pngPath, outBase, "-l", lang, "--psm", "6", "--tessdata-dir", tessdataDir],
    { stdio: "pipe" }
  );
}

async function analyzePdf(inputPath) {
  const buf = await fsp.readFile(inputPath);
  const data = await pdfParse(buf);
  const text = (data.text || "").replace(/\s+/g, " ").trim();
  const cyr = (text.match(/[А-Яа-яЁёӀ]/g) || []).length;
  return {
    pages: data.numpages,
    textLen: text.length,
    cyrChars: cyr,
    isScan: cyr < 500 && data.numpages > 5,
    sample: text.slice(0, 240)
  };
}

async function buildDigitalPdfFromPages(pagesDir, totalPages, outPath) {
  const doc = await PDFDocument.create();
  let count = 0;
  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const { pngPath } = pagePaths(pagesDir, pageNum);
    if (!fs.existsSync(pngPath)) continue;
    const pngBytes = await fsp.readFile(pngPath);
    const png = await doc.embedPng(pngBytes);
    const { width, height } = png.scale(1);
    const page = doc.addPage([width, height]);
    page.drawImage(png, { x: 0, y: 0, width, height });
    count += 1;
    if (pageNum % 10 === 0 || pageNum === totalPages) {
      process.stdout.write(`PDF build ${pageNum}/${totalPages}\n`);
    }
  }
  const outBytes = await doc.save();
  await fsp.writeFile(outPath, outBytes);
  return count;
}

function pagePaths(pagesDir, pageNum) {
  const stem = `page-${String(pageNum).padStart(4, "0")}`;
  const base = path.join(pagesDir, stem);
  return { pngPath: `${base}.png`, txtPath: `${base}.txt`, pdfPath: `${base}.pdf`, txtBase: base };
}

async function assembleFromPages(pagesDir, totalPages, txtPath, digitalPdfPath, textOnly) {
  const textParts = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const { txtPath: pageTxt } = pagePaths(pagesDir, pageNum);
    if (!fs.existsSync(pageTxt)) continue;
    const pageText = await fsp.readFile(pageTxt, "utf8");
    textParts.push(`\n\n--- page ${pageNum} ---\n\n${pageText.trim()}`);
  }
  await fsp.writeFile(txtPath, textParts.join(""), "utf8");

  let pdfCount = 0;
  if (!textOnly) {
    process.stdout.write("Building digital PDF from page images…\n");
    pdfCount = await buildDigitalPdfFromPages(pagesDir, totalPages, digitalPdfPath);
  }
  return { pageCount: textParts.length, pdfCount };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    process.stderr.write(
      "Usage: node scripts/digitize-textbook-pdf.js --input=path/to/scan.pdf [--from=1] [--to=130] [--text-only]\n"
    );
    process.exit(1);
  }

  const inputPath = path.isAbsolute(args.input) ? args.input : path.join(ROOT, args.input);
  if (!fs.existsSync(inputPath)) {
    process.stderr.write(`File not found: ${inputPath}\n`);
    process.exit(1);
  }

  const baseName = path.basename(inputPath, path.extname(inputPath)).replace(/-source$/, "");
  const outDir = args.outDir
    ? path.isAbsolute(args.outDir)
      ? args.outDir
      : path.join(ROOT, args.outDir)
    : path.join(path.dirname(inputPath), "_digitized");
  const pagesDir = path.join(outDir, "pages");
  const txtPath = path.join(outDir, `${baseName}.txt`);
  const digitalPdfPath = path.join(outDir, `${baseName}-digital.pdf`);
  const metaPath = path.join(outDir, "meta.json");

  await fsp.mkdir(pagesDir, { recursive: true });
  const tessdataDir = await ensureRusTessdata();

  const analysis = await analyzePdf(inputPath);
  const totalPages = analysis.pages;
  const from = Math.max(1, args.from);
  const to = args.to > 0 ? Math.min(args.to, totalPages) : totalPages;

  process.stdout.write(
    `Input: ${inputPath}\n` +
      `Pages: ${totalPages}, scan=${analysis.isScan}, existing text chars=${analysis.textLen}\n` +
      `OCR range: ${from}–${to}, scale=${args.scale}, lang=${args.lang}\n` +
      `Output: ${outDir}\n\n`
  );

  if (!analysis.isScan && analysis.cyrChars > 3000 && !args.rebuildOnly) {
    process.stdout.write("PDF already has text layer — copying as digital.\n");
    await fsp.copyFile(inputPath, digitalPdfPath);
    const data = await pdfParse(await fsp.readFile(inputPath));
    await fsp.writeFile(txtPath, data.text || "", "utf8");
    await fsp.writeFile(
      metaPath,
      `${JSON.stringify({ ...analysis, digitalPdfPath, txtPath, skippedOcr: true }, null, 2)}\n`,
      "utf8"
    );
    return;
  }

  if (!args.rebuildOnly) {
    const doc = await pdf(inputPath, { scale: args.scale });
    let pageNum = 0;

    for await (const img of doc) {
      pageNum += 1;
      if (pageNum < from) continue;
      if (pageNum > to) break;

      const { pngPath, txtBase } = pagePaths(pagesDir, pageNum);

      if (!fs.existsSync(pngPath)) {
        await fsp.writeFile(pngPath, img);
      }

      if (!fs.existsSync(`${txtBase}.txt`)) {
        runTesseract(pngPath, txtBase, args.lang, tessdataDir);
      }

      const pageText = fs.existsSync(`${txtBase}.txt`)
        ? await fsp.readFile(`${txtBase}.txt`, "utf8")
        : "";

      if (pageNum % 5 === 0 || pageNum === to) {
        process.stdout.write(`OCR ${pageNum}/${to} (${pageText.length} chars on page)\n`);
      }
    }
  } else {
    process.stdout.write("Rebuild only — assembling from cached page files…\n");
  }

  const assembled = await assembleFromPages(
    pagesDir,
    totalPages,
    txtPath,
    digitalPdfPath,
    args.textOnly
  );
  process.stdout.write(`Assembled ${assembled.pageCount} text pages, ${assembled.pdfCount} PDF pages\n`);

  const finalText = await fsp.readFile(txtPath, "utf8");
  const meta = {
    inputPath,
    outDir,
    from,
    to,
    totalPages,
    analysis,
    ocrLang: args.lang,
    textChars: finalText.length,
    cyrChars: (finalText.match(/[А-Яа-яЁёӀ]/g) || []).length,
    txtPath,
    digitalPdfPath: args.textOnly ? null : digitalPdfPath,
    finishedAt: new Date().toISOString()
  };
  await fsp.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  process.stdout.write(`\nDone.\nText: ${txtPath}\n`);
  if (!args.textOnly) process.stdout.write(`Digital PDF: ${digitalPdfPath}\n`);
  process.stdout.write(`Meta: ${metaPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
