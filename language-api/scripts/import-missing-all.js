/**
 * Import missing phrases into Habar (no duplicates by normalized RU).
 * Sources: PaydaDosh categories, corpus lesson/dialogue splits.
 *
 * Usage:
 *   node scripts/import-missing-all.js [--dry-run] [--paydadosh] [--corpus] [--sync-grammar]
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { splitRuIngPairs, isUsableShortRu } = require("../src/phrase-split");

const ROOT = path.join(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const PAYDADOSH_FILE = path.join(__dirname, "..", "data", "colloquial", "paydadosh-phrases.json");
const CORPUS_DIR = path.join(__dirname, "..", "data", "corpus", "stories");

const PAYDADOSH_MAP = {
  everyday_phrase: { habar: "basic_phrases", maxRu: 120 },
  lesson_phrase: { habar: "conversation", maxRu: 200 },
  idiom_phrase: { habar: "conversation", maxRu: 160 },
  meal_phrase: { habar: "food", maxRu: 120 },
  celebration_phrase: { habar: "guests", maxRu: 120 },
  condolence_phrase: { habar: "misc", maxRu: 120 },
  religious_phrase: { habar: "misc", maxRu: 120 },
  tradition_phrase: { habar: "misc", maxRu: 120 },
  ramadan_phrase: { habar: "misc", maxRu: 120 },
  proverb: { habar: "proverbs", maxRu: 100 }
};

const SKIP_PD = new Set(["snapshot"]);

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…«»":]/g, "").trim();
}

function cleanRu(ru) {
  return (ru || "")
    .replace(/^(приветствие|ответ)\s*:\s*/i, "")
    .replace(/^[«"'\s]+|[»"'\s]+$/g, "")
    .trim();
}

function cleanIng(ing) {
  let text = (ing || "").trim();
  if (!text) return text;
  return text.split(/\.\s*Например:/i)[0].replace(/\s+/g, " ").trim();
}

function isJunkRu(ru, maxRu = 120) {
  const t = cleanRu(ru);
  if (!t || t === "-" || t === "1") return true;
  if (/^\d+$/.test(t)) return true;
  if (/аналитическ|наклонени|образуется таким|грамматик/i.test(t)) return true;
  if (maxRu && t.length > maxRu) return true;
  if (!/[а-яё]/i.test(t)) return true;
  return false;
}

function pronFromIng(ing) {
  return (ing || "")
    .toLowerCase()
    .replace(/[Ӏʺ]/g, "1")
    .replace(/[а-яё]/g, (ch) => {
      const map = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
        з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
        п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
        ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
      };
      return map[ch] || ch;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function capitalizeRu(ru) {
  const text = cleanRu(ru);
  if (!text) return text;
  const first = text.charAt(0);
  if (first === first.toLowerCase() && first !== first.toUpperCase()) {
    return first.toUpperCase() + text.slice(1);
  }
  return text;
}

function genId(prefix, index) {
  return `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function toHabarItem({ ru, ing, id, category, index }) {
  const itemId = id || genId(`ph_${category}`, index);
  return {
    ru: capitalizeRu(ru),
    ing,
    pron: pronFromIng(ing),
    id: itemId,
    audio: `${itemId}.mp3`
  };
}

async function loadGlobalKeys() {
  const keys = new Set();
  const files = (await fs.readdir(CATEGORIES_DIR)).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const data = JSON.parse(await fs.readFile(path.join(CATEGORIES_DIR, file), "utf8"));
    for (const it of data.items || []) {
      const k = norm(it.ru);
      if (k) keys.add(k);
    }
  }
  return keys;
}

async function loadCategory(fileName) {
  const full = path.join(CATEGORIES_DIR, fileName);
  const data = JSON.parse(await fs.readFile(full, "utf8"));
  data.category = data.category || fileName.replace(".json", "");
  return { full, data };
}

async function saveCategory(full, data) {
  data.itemCount = (data.items || []).length;
  data.version = (data.version || 0) + 1;
  await fs.writeFile(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function addPhrasesToCategory(habarName, phrases, globalKeys, dryRun, label) {
  const { full, data } = await loadCategory(`${habarName}.json`);
  const before = (data.items || []).length;
  const added = [];
  let index = before;

  for (const phrase of phrases) {
    const key = norm(phrase.ru);
    if (!key || globalKeys.has(key)) continue;
    globalKeys.add(key);
    added.push(
      toHabarItem({
        ru: phrase.ru,
        ing: phrase.ing,
        id: phrase.id,
        category: habarName,
        index: index++
      })
    );
  }

  if (!added.length) {
    process.stdout.write(`[${label}] ${habarName}: 0 new (total ${before})\n`);
    return { habarName, added: 0, total: before };
  }

  data.items = [...(data.items || []), ...added];
  if (!dryRun) await saveCategory(full, data);
  process.stdout.write(`[${label}] ${habarName}: +${added.length} (total ${data.items.length})\n`);
  added.slice(0, 8).forEach((it) => process.stdout.write(`  + ${it.ru} -> ${it.ing.slice(0, 60)}${it.ing.length > 60 ? "…" : ""}\n`));
  if (added.length > 8) process.stdout.write(`  … +${added.length - 8} more\n`);
  return { habarName, added: added.length, total: data.items.length };
}

async function importPaydadosh(globalKeys, dryRun) {
  const pd = JSON.parse(await fs.readFile(PAYDADOSH_FILE, "utf8"));
  const buckets = {};
  for (const item of pd.items || []) {
    const cat = item.category;
    if (SKIP_PD.has(cat) || !PAYDADOSH_MAP[cat]) continue;
    const ru = cleanRu(item.ru);
    const ing = cleanIng(item.ing);
    const rules = PAYDADOSH_MAP[cat];
    if (isJunkRu(ru, rules.maxRu) || !ing) continue;
    const habar = rules.habar;
    if (!buckets[habar]) buckets[habar] = [];
    buckets[habar].push({
      ru,
      ing,
      id: item.id ? `paydadosh_${item.id}` : undefined,
      source: cat
    });
  }

  const results = [];
  for (const [habar, phrases] of Object.entries(buckets)) {
    results.push(await addPhrasesToCategory(habar, phrases, globalKeys, dryRun, "PaydaDosh"));
  }
  return results;
}

async function importCorpusSplit(globalKeys, dryRun) {
  const files = (await fs.readdir(CORPUS_DIR)).filter((f) => f.endsWith(".json"));
  const phrases = [];
  for (const file of files) {
    const json = JSON.parse(await fs.readFile(path.join(CORPUS_DIR, file), "utf8"));
    const genre = (json.genre || "").toString();
    if (genre !== "lesson" && genre !== "dialogue") continue;
    const base = file.replace(".json", "");
    for (const paragraph of json.paragraphs || []) {
      const pairs = splitRuIngPairs(paragraph.ru, paragraph.ing);
      for (const pair of pairs) {
        if (!isUsableShortRu(pair.ru) || !pair.ing) continue;
        phrases.push({
          ru: pair.ru,
          ing: cleanIng(pair.ing),
          id: `corpus_${base}_${norm(pair.ru).slice(0, 24).replace(/\s+/g, "_")}`
        });
      }
    }
  }
  return addPhrasesToCategory("conversation", phrases, globalKeys, dryRun, "Corpus");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyPaydadosh = args.includes("--paydadosh-only");
  const onlyCorpus = args.includes("--corpus-only");
  const doPaydadosh = !onlyCorpus;
  const doCorpus = !onlyPaydadosh;
  const doSync = !dryRun && !args.includes("--no-sync");

  const globalKeys = await loadGlobalKeys();
  process.stdout.write(`Global Habar RU keys: ${globalKeys.size}\n`);
  if (dryRun) process.stdout.write("DRY RUN — files not written\n");

  const summary = [];
  if (doPaydadosh) {
    summary.push(...(await importPaydadosh(globalKeys, dryRun)));
  }
  if (doCorpus) {
    summary.push(await importCorpusSplit(globalKeys, dryRun));
  }

  const totalAdded = summary.reduce((n, r) => n + (r?.added || 0), 0);
  process.stdout.write(`\nTotal added: ${totalAdded}\n`);

  if (doSync && totalAdded > 0) {
    process.stdout.write("\nSyncing Habar -> grammar + regression…\n");
    const r = spawnSync(process.execPath, [path.join(__dirname, "sync-habar-to-grammar.js")], {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit"
    });
    if (r.status !== 0) process.exit(r.status || 1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
