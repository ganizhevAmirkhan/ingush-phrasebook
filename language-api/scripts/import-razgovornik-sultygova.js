/**
 * Import М.М. Султыгова «Русско-ингушский разговорник» (2013) from OCR text.
 * Skips duplicates already present in Habar, PaydaDosh, grammar patterns.
 *
 * Usage:
 *   node scripts/import-razgovornik-sultygova.js
 *   node scripts/import-razgovornik-sultygova.js --all
 *   node scripts/import-razgovornik-sultygova.js --dedupe
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { parseSultygovaText, fixIngOrthography, looksLikeIngushText } = require("./lib/sultygova-razgovornik-parse");
const { normalizeText, normalizePhraseKey } = require("../src/schema");

const ROOT = path.join(__dirname, "..");
const DEFAULT_TEXT = path.join(ROOT, "data", "external", "razgovornik", "_digitized", "source.txt");
const OUT_FILE = path.join(ROOT, "data", "colloquial", "sultygova-razgovornik-phrases.json");
const SUMMARY_FILE = path.join(ROOT, "data", "colloquial", "sultygova-import-summary.json");
const SKIPPED_FILE = path.join(ROOT, "data", "colloquial", "sultygova-import-skipped.json");

const PAYDADOSH_FILE = path.join(ROOT, "data", "colloquial", "paydadosh-phrases.json");
const GRAMMAR_PATTERNS_FILE = path.join(ROOT, "data", "grammar", "patterns.json");
const HABAR_CATEGORIES_DIR = path.join(ROOT, "..", "categories");

function parseArgs(argv) {
  const textArg = argv.find((a) => a.startsWith("--text="));
  const dedupeExternal = argv.includes("--dedupe");
  return {
    textPath: textArg ? path.resolve(textArg.slice("--text=".length)) : DEFAULT_TEXT,
    dedupeExternal
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

async function buildExistingIndex() {
  const ruKeys = new Set();
  const ruIngKeys = new Set();

  const addPhrase = (ru, ing) => {
    const ruNorm = normalizeText(ru);
    const ruKey = normalizePhraseKey(ru);
    if (ruNorm) ruKeys.add(ruNorm);
    if (ruKey) ruKeys.add(ruKey);
    if (ruNorm && ing) ruIngKeys.add(`${ruNorm}|${normalizeIngKey(ing)}`);
  };

  const paydadosh = await safeReadJson(PAYDADOSH_FILE);
  for (const item of paydadosh?.items || []) {
    addPhrase(item.ru, item.ing);
  }

  for (const filePath of await listJsonFiles(HABAR_CATEGORIES_DIR)) {
    const json = await safeReadJson(filePath);
    for (const item of json?.items || []) {
      addPhrase(item.ru, item.ing);
    }
  }

  const grammar = await safeReadJson(GRAMMAR_PATTERNS_FILE);
  for (const pattern of grammar?.patterns || grammar || []) {
    const ing = pattern?.ingTemplate || "";
    for (const ex of pattern?.examples || []) {
      addPhrase(ex?.ru, ing || ex?.ing);
    }
    if (!pattern?.slots?.length && ing && !ing.includes("{")) {
      addPhrase(pattern?.ruPattern, ing);
    }
  }

  return { ruKeys, ruIngKeys };
}

function cleanIngPhrase(ing) {
  return fixIngOrthography(ing).replace(/^[—\-–]+\s*/, "").trim();
}

function isDuplicate(item, existing, batchRuKeys, dedupeExternal) {
  const ruNorm = normalizeText(item.ru);
  const ruKey = normalizePhraseKey(item.ru);
  const ruIngKey = `${ruNorm}|${normalizeIngKey(item.ing)}`;

  if (!ruNorm || ruNorm.length < 2) return { dup: true, reason: "empty_ru" };
  if (batchRuKeys.has(ruNorm) || batchRuKeys.has(ruKey)) {
    return { dup: true, reason: "batch_ru" };
  }
  if (!dedupeExternal) return { dup: false };
  if (existing.ruKeys.has(ruNorm) || existing.ruKeys.has(ruKey)) {
    return { dup: true, reason: "existing_ru" };
  }
  if (existing.ruIngKeys.has(ruIngKey)) {
    return { dup: true, reason: "existing_ru_ing" };
  }
  return { dup: false };
}

async function main() {
  const { textPath, dedupeExternal } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(textPath)) {
    console.error(`OCR text not found: ${textPath}`);
    console.error("Run: node scripts/digitize-textbook-pdf.js --input=data/external/razgovornik/source.pdf --text-only");
    process.exit(1);
  }

  const text = await fsp.readFile(textPath, "utf8");
  const parsed = parseSultygovaText(text);
  const existing = await buildExistingIndex();

  const items = [];
  const skipped = [];
  const batchRuKeys = new Set();
  let id = 0;

  for (const phrase of parsed.phrases) {
    const cleanedIng = cleanIngPhrase(phrase.ing);
    if (!cleanedIng || cleanedIng.length < 2) {
      skipped.push({ ...phrase, reason: "empty_ing" });
      continue;
    }
    const dup = isDuplicate({ ...phrase, ing: cleanedIng }, existing, batchRuKeys, dedupeExternal);
    if (dup.dup) {
      skipped.push({ ...phrase, reason: dup.reason });
      continue;
    }

    const ruNorm = normalizeText(phrase.ru);
    const ruKey = normalizePhraseKey(phrase.ru);
    batchRuKeys.add(ruNorm);
    if (ruKey) batchRuKeys.add(ruKey);

    id += 1;
    items.push({
      id: `sz_${String(id).padStart(4, "0")}`,
      ru: phrase.ru,
      ruNorm,
      ing: cleanedIng,
      pron: phrase.pron || "",
      category: phrase.category,
      section: phrase.section,
      page: phrase.page,
      source: "sultygova_razgovornik",
      sourceLabel: "Султыгова 2013",
      confidence: 0.84
    });
  }

  const out = {
    schema: "sultygova-razgovornik/v1",
    version: 1,
    importedAt: new Date().toISOString(),
    source: "Султыгова М.М. Русско-ингушский разговорник. Ростов-на-Дону, 2013.",
    ocrText: path.relative(ROOT, textPath).replace(/\\/g, "/"),
    dedupeExternal,
    count: items.length,
    parsedRaw: parsed.phrases.length,
    skippedDuplicates: skipped.length,
    categories: [...new Set(items.map((i) => i.category))].sort(),
    items
  };

  await fsp.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fsp.writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");

  const summary = {
    importedAt: out.importedAt,
    parsedRaw: parsed.phrases.length,
    imported: items.length,
    skipped: skipped.length,
    skippedByReason: skipped.reduce((acc, s) => {
      acc[s.reason] = (acc[s.reason] || 0) + 1;
      return acc;
    }, {}),
    stats: parsed.stats,
    sample: items.slice(0, 8),
    outFile: path.relative(ROOT, OUT_FILE)
  };
  await fsp.writeFile(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf8");
  await fsp.writeFile(SKIPPED_FILE, JSON.stringify({ count: skipped.length, items: skipped.slice(0, 200) }, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
