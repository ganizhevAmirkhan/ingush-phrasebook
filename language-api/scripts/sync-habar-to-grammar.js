const fs = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");

const ROOT = path.join(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const REG_FILE = path.join(ROOT, "language-api", "data", "regression-tests.json");
const PATTERNS_FILE = path.join(ROOT, "language-api", "data", "grammar", "patterns.json");
const LEXEMES_FILE = path.join(ROOT, "language-api", "data", "grammar", "lexemes.json");
const GITHUB_CATEGORIES_API =
  "https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/categories?ref=main";

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…]/g, "").trim();
}

function isSingleWord(ru) {
  const t = (ru || "").trim();
  return t.length > 1 && !/\s/.test(t);
}

function slugFromKey(key) {
  return key.replace(/[^a-zа-я0-9]+/gi, "_").slice(0, 35) || "phrase";
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "ingush-phrasebook-sync" } }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

async function pullCategoriesFromGitHub() {
  const raw = await getJson(GITHUB_CATEGORIES_API);
  const list = JSON.parse(raw);
  let pulled = 0;
  for (const entry of list) {
    if (entry.type !== "file" || !entry.name.endsWith(".json") || !entry.download_url) continue;
    const content = await getJson(entry.download_url);
    const cleaned = content.replace(
      /<<<<<<< HEAD[\s\S]*?=======\n([\s\S]*?)>>>>>>>[^\n]*/g,
      "$1"
    );
    JSON.parse(cleaned);
    await fs.writeFile(path.join(CATEGORIES_DIR, entry.name), cleaned, "utf8");
    pulled += 1;
  }
  return pulled;
}

async function loadHabarItems() {
  const files = (await fs.readdir(CATEGORIES_DIR)).filter((f) => f.endsWith(".json"));
  const items = [];
  for (const file of files) {
    const full = path.join(CATEGORIES_DIR, file);
    const text = await fs.readFile(full, "utf8");
    if (text.includes("<<<<<<<")) {
      throw new Error(`Merge conflict in categories/${file} — resolve or pull from GitHub first`);
    }
    const data = JSON.parse(text);
    const cat = data.category || file.replace(".json", "");
    (data.items || []).forEach((it, index) => {
      if (!it?.ru || !it?.ing) return;
      items.push({
        cat,
        ru: it.ru,
        ing: it.ing,
        id: it.id || `noid_${file}_${index}`,
        key: norm(it.ru)
      });
    });
  }
  return items;
}

function updatePatternFromItem(pattern, item) {
  const key = item.key;
  let changed = false;
  if (pattern.ingTemplate !== item.ing) {
    pattern.ingTemplate = item.ing;
    changed = true;
  }
  if (pattern.ruPattern !== key) {
    pattern.ruPattern = key;
    changed = true;
  }
  if (pattern.examples?.[0]) {
    pattern.examples[0].ru = key;
    pattern.examples[0].ing_expected = item.ing;
  }
  if (Number(pattern.priority || 0) < 100) {
    pattern.priority = 100;
    changed = true;
  }
  return changed;
}

function habarPatternId(item) {
  const safeId = String(item.id || "noid").replace(/[^a-zA-Z0-9_]/g, "_");
  return `habar_${safeId}`;
}

function makeHabarPattern(item) {
  return {
    id: habarPatternId(item),
    ruPattern: item.key,
    description: "Habar phrasebook sync",
    slots: [],
    ingTemplate: item.ing,
    priority: 100,
    examples: [{ ru: item.key, ing_expected: item.ing }]
  };
}

async function syncGrammar({ pull = false } = {}) {
  if (pull) {
    const pulled = await pullCategoriesFromGitHub();
    process.stdout.write(`Pulled ${pulled} category files from GitHub\n`);
  }

  const items = await loadHabarItems();
  const byId = Object.fromEntries(items.filter((x) => x.id && !x.id.startsWith("noid_")).map((x) => [x.id, x]));
  const byKey = new Map();
  const habarWords = new Map();

  for (const item of items) {
    byKey.set(item.key, item);
    if (isSingleWord(item.ru)) habarWords.set(item.key, item.ing);
  }

  const reg = JSON.parse(await fs.readFile(REG_FILE, "utf8"));
  const patterns = JSON.parse(await fs.readFile(PATTERNS_FILE, "utf8"));
  const lex = JSON.parse(await fs.readFile(LEXEMES_FILE, "utf8"));

  let regUp = 0;
  let patUp = 0;
  let patAdd = 0;
  let lexUp = 0;

  for (const test of reg.items || []) {
    const src = byId[test.id];
    if (src && src.ing !== test.expectedIng) {
      test.expectedIng = src.ing;
      if (src.ru && test.ru !== src.ru) test.ru = src.ru;
      regUp += 1;
    }
  }

  const regIds = new Set((reg.items || []).map((t) => t.id).filter(Boolean));
  for (const item of items) {
    if (!item.id || regIds.has(item.id)) continue;
    reg.items.push({
      id: item.id,
      category: item.cat,
      ru: item.ru,
      expectedIng: item.ing
    });
    regIds.add(item.id);
    regUp += 1;
  }

  const nonHabar = (patterns.patterns || []).filter((p) => !p.id?.startsWith("habar_"));
  for (const pattern of nonHabar) {
    const item = byKey.get(norm(pattern.ruPattern));
    if (item && updatePatternFromItem(pattern, item)) patUp += 1;
  }

  const habarPatterns = items.map((item) => makeHabarPattern(item));
  patterns.patterns = [...nonHabar, ...habarPatterns];
  patAdd = habarPatterns.length;

  for (const lx of lex.lexemes || []) {
    const ing = habarWords.get(norm(lx.ru));
    if (!ing) continue;
    if (lx.forms?.base !== ing) {
      lx.forms = lx.forms || {};
      lx.forms.base = ing;
      if (!lx.forms.dat || lx.forms.dat === lx.forms.base) lx.forms.dat = ing;
      if (!String(lx.notes || "").includes("Habar sync")) {
        lx.notes = lx.notes ? `${lx.notes}; Habar sync` : "Habar sync";
      }
      lexUp += 1;
    }
  }

  reg.generatedAt = new Date().toISOString();
  await fs.writeFile(REG_FILE, `${JSON.stringify(reg, null, 2)}\n`, "utf8");
  await fs.writeFile(PATTERNS_FILE, `${JSON.stringify(patterns, null, 2)}\n`, "utf8");
  await fs.writeFile(LEXEMES_FILE, `${JSON.stringify(lex, null, 2)}\n`, "utf8");

  return {
    totalItems: items.length,
    regUp,
    patUp,
    patAdd,
    lexUp,
    patternsTotal: patterns.patterns.length,
    habarPatterns: habarPatterns.length
  };
}

async function main() {
  const pull = process.argv.includes("--pull");
  const stats = await syncGrammar({ pull });
  process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
