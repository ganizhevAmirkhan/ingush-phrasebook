/**
 * Import «Ингушско-русский словарь терминов» (Барахоева et al., 2016, ~7565 terms).
 * Usage:
 *   node scripts/import-ing-term-dictionary.js --pdf="C:/path/to/file.pdf"
 *   node scripts/import-ing-term-dictionary.js --text="data/external/ing-term-2016/extracted.txt"
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "data", "dictionary", "ing-term-2016.json");
const DEFAULT_PDF = path.join(ROOT, "data", "external", "ing-term-2016", "ing-term-dictionary-2016.pdf");

const PAGE_MARK = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const ENTRY_SPLIT = /\s+[–—-]\s+/;

function parseArgs(argv) {
  const out = { pdf: "", text: "", writeText: false };
  for (const arg of argv) {
    if (arg.startsWith("--pdf=")) out.pdf = arg.slice("--pdf=".length);
    else if (arg.startsWith("--text=")) out.text = arg.slice("--text=".length);
    else if (arg === "--write-text") out.writeText = true;
  }
  return out;
}

function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (PAGE_MARK.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  if (/^(УДК|ББК|ISBN|©|И59|Рекомендовано|Ответственный|Книга издана)/i.test(t)) return true;
  if (/^[-–—=]{3,}$/.test(t)) return true;
  if (/^[A-ZА-ЯЁ][a-zа-яё]+ [A-ZА-ЯЁ]/.test(t) && !ENTRY_SPLIT.test(t) && t.length > 60) return false;
  if (/^(ПРЕДИСЛОВИЕ|ХьАЛХААЛАР|СОДЕРЖАНИЕ|Список)/i.test(t)) return true;
  if (/^[IVXLC]+\./.test(t)) return true;
  return false;
}

function isValidDictionaryEntry(left, right) {
  const l = left.trim();
  const r = right.trim();
  if (l.length < 2 || r.length < 2) return false;
  if (l.length > 140 || r.length > 220) return false;
  if (l.split(/\s+/).length > 12 || r.split(/\s+/).length > 20) return false;

  const blob = `${l} ${r}`;
  if (/Terminus|ISBN|Нальчик|Тетраграф|Розенталь|удк|ббк/i.test(blob)) return false;
  if (/^(изд|доп\.|термин,|термин от|лат\.|понимается|совершенно|следует|данный|перед|работа|©|варь|вопрос|суть)/i.test(l)) {
    return false;
  }
  if (/от лат\.|служат специ|существуют в рамках|во всех сферах/i.test(r)) return false;

  const hasMorph = /\([бдйв],?\s*[бдйв]?\)|\(-?[а-яa-z]{1,6}\)|\([а-я]{1,3}\)/i.test(l);
  if (r.length > 140 && !hasMorph) return false;

  const head = stripMorphology(l);
  if (!head || head.length < 2) return false;
  if (!hasMorph && head.split(/\s+/).length > 4) return false;

  return true;
}

function findDictionaryStart(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (/^арц\s*\(-/.test(t) && ENTRY_SPLIT.test(t)) return i;
  }
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (/^географи\s*\(/.test(t) && ENTRY_SPLIT.test(t)) return i;
  }
  return 0;
}

function looksLikeEntry(line) {
  if (!ENTRY_SPLIT.test(line)) return false;
  const idx = line.search(ENTRY_SPLIT);
  const left = line.slice(0, idx).trim();
  const right = line.slice(idx).replace(ENTRY_SPLIT, "").trim();
  if (!left || !right) return false;
  if (!/[A-Za-zА-Яа-яI1éá]/.test(left)) return false;
  if (!/[а-яёА-ЯЁ]/.test(right)) return false;
  return isValidDictionaryEntry(left, right);
}

function stripMorphology(ingPart) {
  let s = ingPart.trim();
  s = s.split("//")[0].trim();
  while (/\([^)]*\)\s*$/.test(s)) {
    s = s.replace(/\([^)]*\)\s*$/, "").trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

function splitRuMeanings(ruPart) {
  const t = ruPart.replace(/\s+/g, " ").trim();
  if (!/^\d+\.\s/.test(t)) return [t];
  const parts = t.split(/\s*,\s*(?=\d+\.\s)/);
  return parts
    .map((p) => p.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function normalizeRuKey(ru) {
  return ru
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDictionaryText(rawText) {
  const lines = rawText.replace(/\r/g, "").split("\n");
  const startAt = findDictionaryStart(lines);
  const merged = [];

  for (let i = startAt; i < lines.length; i += 1) {
    const line = lines[i];
    const t = line.trim();
    if (!t || isNoiseLine(t)) continue;

    if (looksLikeEntry(t)) {
      merged.push(t);
      continue;
    }

    if (merged.length && /^[а-яёa-z(,;]/.test(t) && !looksLikeEntry(t)) {
      merged[merged.length - 1] += ` ${t}`;
    }
  }

  const items = [];
  const seen = new Set();
  let section = "";

  for (const row of merged) {
    const idx = row.search(ENTRY_SPLIT);
    if (idx < 0) continue;
    const left = row.slice(0, idx).trim();
    const right = row.slice(idx).replace(ENTRY_SPLIT, "").trim();
    if (!left || !right || !isValidDictionaryEntry(left, right)) continue;

    const ingHead = stripMorphology(left);
    if (!ingHead || ingHead.length < 2) continue;

    const ruParts = splitRuMeanings(right);
    for (const ru of ruParts) {
      const ruClean = ru.replace(/\([^)]*\)\s*$/, "").trim();
      if (!ruClean || ruClean.length < 2) continue;
      const key = `${normalizeRuKey(ruClean)}|${ingHead.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `ing_term_${items.length + 1}`,
        ru: ruClean,
        ing: ingHead,
        ingFull: left,
        ruFull: right,
        section: section || undefined,
        source: "ing_term_2016",
        confidence: 0.88
      });
    }
  }

  return items;
}

async function extractPdfText(pdfPath) {
  const pdfParse = require("pdf-parse");
  const buf = await fs.readFile(pdfPath);
  const data = await pdfParse(buf);
  return data.text || "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pdfPath = args.pdf || DEFAULT_PDF;
  const textPath = args.text;

  let rawText = "";
  if (textPath) {
    rawText = await fs.readFile(path.resolve(textPath), "utf8");
  } else {
    try {
      await fs.access(pdfPath);
    } catch {
      throw new Error(`PDF not found: ${pdfPath}\nUse --pdf=... or copy file to ${DEFAULT_PDF}`);
    }
    process.stdout.write(`Extracting text from ${pdfPath}\n`);
    rawText = await extractPdfText(pdfPath);
    if (args.writeText) {
      const txtOut = path.join(path.dirname(pdfPath), "extracted.txt");
      await fs.writeFile(txtOut, rawText, "utf8");
      process.stdout.write(`Wrote ${txtOut}\n`);
    }
  }

  const items = parseDictionaryText(rawText);
  const payload = {
    title: "Ингушско-русский словарь терминов (2016)",
    authors: "Барахоева Н.М., Кодзоев Н.Д., Хайров Б.А.",
    source: "ing_term_2016",
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    items
  };

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        out: OUT_FILE,
        items: items.length,
        sample: items.slice(0, 5).map((x) => ({ ru: x.ru, ing: x.ing }))
      },
      null,
      2
    )}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
