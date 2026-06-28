/**
 * OCR + phrase split for «Г. Х. Андерсен — Сказки» (Ingush translation, scan PDF).
 * Output: draft JSON with ing phrases and empty ru for manual translation.
 *
 * Usage:
 *   node scripts/import-andersen-skazki.js
 *   node scripts/import-andersen-skazki.js --pdf="C:/Users/admin/Downloads/Сказки (Андерсен).pdf"
 *   node scripts/import-andersen-skazki.js --skip-ocr
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { normalizeText, normalizePhraseKey } = require("../src/schema");

const ROOT = path.join(__dirname, "..");
const DEFAULT_PDF = path.join(ROOT, "data", "external", "andersen-skazki", "source.pdf");
const OUT_DRAFT = path.join(ROOT, "data", "corpus", "stories", "andersen-skazki-draft.json");
const OUT_SUMMARY = path.join(ROOT, "data", "external", "andersen-skazki", "import-summary.json");
const TESSDATA = path.join(ROOT, "data", "external", "tessdata");

const STORY_HEADERS = [
  { re: /к1ориг/i, title: "К1ориг (Ёлочка)" },
  { re: /гета\b/i, title: "Гета (Снежная королева)" },
  { re: /цхьан\s+бетта\s+чура\s+пхи/i, title: "Цхьан бетта чура пхиъ (Дюймовочка)" },
  { re: /оле\s+лукой/i, title: "Оле-Лукойе" },
  { re: /паччахьа\s+щена\s+барзкъ/i, title: "Паччахьа щена барзкъаш (Свинопас)" },
  { re: /корсам/i, title: "Корсам" },
  { re: /клумпе-?думпе/i, title: "Клумпе-Думпе" },
  { re: /иведе-?аведе/i, title: "Иведе-Аведе" },
  { re: /^гета\s/i, title: "Гета (Снежная королева)" }
];

function parseArgs(argv) {
  const pdfArg = argv.find((a) => a.startsWith("--pdf="));
  return {
    pdfPath: pdfArg ? path.resolve(pdfArg.slice("--pdf=".length)) : DEFAULT_PDF,
    skipOcr: argv.includes("--skip-ocr")
  };
}

function normalizeIngKey(ing) {
  return (ing || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[Ӏ1!]/g, "1")
    .replace(/[ьъ]/g, "")
    .replace(/[^a-zа-яё0-9]/g, "")
    .trim();
}

function joinOcrPages(pagesDir, totalPages) {
  const parts = [];
  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const txtPath = path.join(pagesDir, `page-${String(pageNum).padStart(4, "0")}.txt`);
    if (!fs.existsSync(txtPath)) continue;
    const raw = fs.readFileSync(txtPath, "utf8").trim();
    if (!raw) continue;
    parts.push(`\n\n--- page ${pageNum} ---\n\n${raw}`);
  }
  return parts.join("");
}

function dehyphenate(text) {
  return (text || "")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeIngushPhrase(text) {
  const t = (text || "").trim();
  if (t.length < 10 || t.length > 280) return false;
  if (!/[а-яё]/i.test(t)) return false;
  if (/[©®‹›&]/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  const ingMarks =
    (t.match(/[Ӏ1!]|г1|к1|х1|т1|п1|ц1|ч1|къ|хь|ьнна|аьлар|аьнна|йоахар|хаьттар/gi) || []).length;
  if (ingMarks < 2 && !/—/.test(t)) return false;
  if (/^(УДК|ISBN|Андерсен\.|Скозки)/i.test(t)) return false;
  if (/^[A-ZА-ЯЁ\s]{4,}$/.test(t) && ingMarks < 2) return false;
  if (/оОО|ООО|оа лсааве|Мра …|С ЪПЬМО/.test(t)) return false;
  const cyr = (t.match(/[а-яё]/gi) || []).length;
  const junk = (t.match(/[^а-яёӀ1!\s.,!?;:"«»—\-–…]/gi) || []).length;
  if (junk > cyr * 0.08) return false;
  return true;
}

function detectStoryTitle(line) {
  const t = line.trim();
  if (t.length < 6 || t.length > 80) return null;
  for (const item of STORY_HEADERS) {
    if (item.re.test(t)) return item.title;
  }
  if (/^[А-ЯЁҐӀ1!\s\-–—]{6,}$/.test(t) && (t.match(/[Ӏ1!]|к1|х1/g) || []).length >= 1) {
    return t.replace(/\s+/g, " ");
  }
  return null;
}

function splitIngPhrases(pageText) {
  const text = dehyphenate(pageText);
  const chunks = text
    .split(/(?<=[.!?…])\s+|(?<=—)\s*(?=—)|\s+—\s+/)
    .map((s) => s.replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim())
    .filter(Boolean);

  const phrases = [];
  for (const chunk of chunks) {
    if (chunk.length > 220) {
      const sub = chunk.split(/(?<=[.!?])\s+|,\s+(?=[А-ЯЁҐӀ])/);
      for (const part of sub) {
        const p = part.trim();
        if (looksLikeIngushPhrase(p)) phrases.push(p);
      }
    } else if (looksLikeIngushPhrase(chunk)) {
      phrases.push(chunk);
    }
  }
  return phrases;
}

async function runOcrMupdf(pdfPath, pagesDir) {
  await fsp.mkdir(pagesDir, { recursive: true });
  const tessdataDir = path.resolve(TESSDATA);
  if (!fs.existsSync(path.join(tessdataDir, "rus.traineddata"))) {
    throw new Error(`Missing rus.traineddata in ${tessdataDir}`);
  }

  process.stdout.write("OCR via mupdf + tesseract…\n");
  const mupdf = await import("mupdf");
  const doc = mupdf.default.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
  const total = doc.countPages();

  for (let idx = 0; idx < total; idx += 1) {
    const pageNum = idx + 1;
    const stem = `page-${String(pageNum).padStart(4, "0")}`;
    const pngPath = path.join(pagesDir, `${stem}.png`);
    const outBase = path.join(pagesDir, stem);

    if (!fs.existsSync(pngPath)) {
      const page = doc.loadPage(idx);
      const mat = mupdf.default.Matrix.scale(2, 2);
      const pixmap = page.toPixmap(mat, mupdf.default.ColorSpace.DeviceRGB, false, true);
      await fsp.writeFile(pngPath, pixmap.asPNG());
    }

    if (!fs.existsSync(`${outBase}.txt`)) {
      execFileSync(
        process.env.TESSERACT_CMD || "tesseract",
        [pngPath, outBase, "-l", "rus", "--psm", "6", "--tessdata-dir", tessdataDir],
        { stdio: "pipe" }
      );
    }

    if (pageNum % 10 === 0 || pageNum === total) {
      process.stdout.write(`  page ${pageNum}/${total}\n`);
    }
  }
  return total;
}

async function safeReadJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function listJsonFiles(dir) {
  try {
    const names = await fsp.readdir(dir);
    return names.filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

async function buildIngIndex() {
  const byIng = new Map();

  const add = (ing, ru, source) => {
    const key = normalizeIngKey(ing);
    if (!key || key.length < 6) return;
    if (!byIng.has(key)) byIng.set(key, { ing, ru: ru || "", source });
  };

  const paydadosh = await safeReadJson(path.join(ROOT, "data", "colloquial", "paydadosh-phrases.json"));
  for (const item of paydadosh?.items || []) add(item.ing, item.ru, "paydadosh");

  const sultygova = await safeReadJson(path.join(ROOT, "data", "colloquial", "sultygova-razgovornik-phrases.json"));
  for (const item of sultygova?.items || []) add(item.ing, item.ru, "sultygova");

  const compose = await safeReadJson(path.join(ROOT, "data", "grammar", "compose-rules.json"));
  for (const [ru, ing] of Object.entries(compose?.exactPhrases || {})) add(ing, ru, "compose-rules");

  const storiesDir = path.join(ROOT, "data", "corpus", "stories");
  for (const filePath of await listJsonFiles(storiesDir)) {
    if (filePath.includes("andersen-skazki-draft")) continue;
    const json = await safeReadJson(filePath);
    for (const p of json?.paragraphs || []) add(p.ing, p.ru, path.basename(filePath));
  }

  const habarDir = path.join(ROOT, "..", "categories");
  for (const filePath of await listJsonFiles(habarDir)) {
    const json = await safeReadJson(filePath);
    for (const item of json?.phrases || json?.items || []) {
      if (item.ing || item.translation) add(item.ing || item.translation, item.ru || item.russian, "habar");
    }
  }

  return byIng;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = args.pdfPath;
  if (!fs.existsSync(pdfPath)) {
    process.stderr.write(`PDF not found: ${pdfPath}\n`);
    process.exit(1);
  }

  const externalDir = path.join(ROOT, "data", "external", "andersen-skazki");
  const digitizedDir = path.join(externalDir, "_digitized");
  const pagesDir = path.join(digitizedDir, "pages");
  await fsp.mkdir(externalDir, { recursive: true });

  if (path.resolve(pdfPath) !== path.resolve(DEFAULT_PDF)) {
    await fsp.copyFile(pdfPath, DEFAULT_PDF);
  }

  let totalPages = 62;
  if (!args.skipOcr) {
    totalPages = await runOcrMupdf(DEFAULT_PDF, pagesDir);
  }

  const fullText = joinOcrPages(pagesDir, totalPages);
  const sourceTxt = path.join(digitizedDir, "source.txt");
  await fsp.writeFile(sourceTxt, fullText, "utf8");

  const ingIndex = await buildIngIndex();
  const items = [];
  let story = "Вступление";
  let idSeq = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
    const txtPath = path.join(pagesDir, `page-${String(pageNum).padStart(4, "0")}.txt`);
    if (!fs.existsSync(txtPath)) continue;
    if (pageNum <= 4) continue;
    const pageRaw = fs.readFileSync(txtPath, "utf8");
    const pageLines = pageRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of pageLines) {
      const title = detectStoryTitle(line);
      if (title) story = title;
    }

    for (const ing of splitIngPhrases(pageRaw)) {
      const titleFromPhrase = detectStoryTitle(ing.split(/[.;!?]/)[0] || ing.slice(0, 60));
      if (titleFromPhrase) story = titleFromPhrase;
      if (/клумпе-?думпе/i.test(ing) && /бувцаш бола фаьлг|иведе-?аведе/i.test(ing)) {
        story = "Клумпе-Думпе / Иведе-Аведе";
      }

      const key = normalizeIngKey(ing);
      const hit = ingIndex.get(key);
      idSeq += 1;
      items.push({
        id: `andersen-${String(idSeq).padStart(4, "0")}`,
        story,
        page: pageNum,
        ing,
        ru: hit?.ru || "",
        inDatabase: Boolean(hit?.ru),
        existingSource: hit?.source || null,
        status: hit?.ru ? "has_ru" : "needs_ru"
      });
    }
  }

  const unique = new Map();
  for (const item of items) {
    const key = normalizeIngKey(item.ing);
    if (!unique.has(key)) unique.set(key, item);
  }
  const phrases = [...unique.values()];

  const draft = {
    id: "andersen_skazki",
    title: "Г. Х. Андерсен — Сказки (ингушский перевод)",
    author: "Ганс Христиан Андерсен",
    translator: null,
    source: "andersen_skazki",
    sourcePdf: "data/external/andersen-skazki/source.pdf",
    ocrNote: "Скан без текстового слоя; OCR rus+tesseract. Проверяйте орфографию.",
    status: "needs_ru",
    stories: [...new Set(phrases.map((p) => p.story))],
    phraseCount: phrases.length,
    needsRu: phrases.filter((p) => p.status === "needs_ru").length,
    hasRu: phrases.filter((p) => p.status === "has_ru").length,
    phrases
  };

  await fsp.mkdir(path.dirname(OUT_DRAFT), { recursive: true });
  await fsp.writeFile(OUT_DRAFT, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  const summary = {
    pdfPath: DEFAULT_PDF,
    totalPages,
    phraseCount: phrases.length,
    needsRu: draft.needsRu,
    hasRu: draft.hasRu,
    stories: draft.stories,
    outDraft: path.relative(ROOT, OUT_DRAFT).replace(/\\/g, "/"),
    sourceTxt: path.relative(ROOT, sourceTxt).replace(/\\/g, "/"),
    sampleNeedsRu: phrases.filter((p) => p.status === "needs_ru").slice(0, 8).map((p) => ({ story: p.story, ing: p.ing })),
    finishedAt: new Date().toISOString()
  };
  await fsp.writeFile(OUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  process.stdout.write(
    `\nAndersen import done.\n` +
      `Phrases: ${phrases.length} (needs RU: ${draft.needsRu}, already in DB: ${draft.hasRu})\n` +
      `Draft: ${OUT_DRAFT}\n` +
      `Summary: ${OUT_SUMMARY}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
