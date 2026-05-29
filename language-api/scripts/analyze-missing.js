const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const PAYDADOSH_FILE = path.join(__dirname, "..", "data", "colloquial", "paydadosh-phrases.json");
const CORPUS_DIR = path.join(__dirname, "..", "data", "corpus", "stories");

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…«»":]/g, "").trim();
}

const habarKeys = new Set();
const habarByCat = {};
for (const f of fs.readdirSync(CATEGORIES_DIR).filter((x) => x.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(CATEGORIES_DIR, f), "utf8"));
  const cat = data.category || f.replace(".json", "");
  habarByCat[cat] = (data.items || []).length;
  for (const it of data.items || []) {
    const k = norm(it.ru);
    if (k) habarKeys.add(k);
  }
}

const pd = JSON.parse(fs.readFileSync(PAYDADOSH_FILE, "utf8"));
const byCat = {};
const missingByCat = {};
let overlap = 0;
let missing = 0;
for (const it of pd.items || []) {
  byCat[it.category] = (byCat[it.category] || 0) + 1;
  const k = norm(it.ru);
  if (!k || k === "-") continue;
  if (habarKeys.has(k)) overlap += 1;
  else {
    missing += 1;
    missingByCat[it.category] = (missingByCat[it.category] || 0) + 1;
  }
}

const corpusFiles = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".json"));
const corpusRu = new Set();
for (const f of corpusFiles) {
  const j = JSON.parse(fs.readFileSync(path.join(CORPUS_DIR, f), "utf8"));
  for (const p of j.paragraphs || []) {
    const k = norm(p.ru);
    if (k) corpusRu.add(k);
  }
}

console.log(JSON.stringify({
  habarCategories: habarByCat,
  habarUniqueRu: habarKeys.size,
  paydadoshTotal: pd.items.length,
  paydadoshByCategory: byCat,
  paydadoshOverlap: overlap,
  paydadoshMissingFromHabar: missing,
  paydadoshMissingByCategory: missingByCat,
  corpusStories: corpusFiles.length,
  corpusUniqueRu: corpusRu.size
}, null, 2));
