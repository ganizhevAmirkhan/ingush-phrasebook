const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const PATTERNS_FILE = path.join(ROOT, "language-api", "data", "grammar", "patterns.json");

const CATEGORY_SOURCES = {
  numbers: {
    patternIdPrefix: ["numbers_"],
    descriptionIncludes: ["Lesson 9"],
    conversationIdIncludes: ["numbers_lesson"]
  }
};

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…«»"]/g, "").trim();
}

function genId(category, index) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `ph_${category}_${index}_${rand}`;
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
  const text = (ru || "").trim();
  if (!text) return text;
  const first = text.charAt(0);
  if (first === first.toLowerCase() && first !== first.toUpperCase()) {
    return first.toUpperCase() + text.slice(1);
  }
  return text;
}

function toHabarItem({ ru, ing, pron, id, category, index }) {
  const itemId = id || genId(category, index);
  return {
    ru: capitalizeRu(ru),
    ing,
    pron: pron || pronFromIng(ing),
    id: itemId,
    audio: `${itemId}.mp3`
  };
}

function patternMatchesCategory(pattern, rules) {
  const id = pattern?.id || "";
  if (rules.patternIdPrefix?.some((p) => id.startsWith(p))) return true;
  const desc = (pattern?.description || "").toLowerCase();
  return rules.descriptionIncludes?.some((part) => desc.includes(part.toLowerCase()));
}

function conversationMatchesCategory(item, rules) {
  const id = item?.id || "";
  return rules.conversationIdIncludes?.some((part) => id.includes(part));
}

async function collectApiPhrases(category, rules) {
  const patterns = JSON.parse(await fs.readFile(PATTERNS_FILE, "utf8"));
  const conversationPath = path.join(CATEGORIES_DIR, "conversation.json");
  const conversation = JSON.parse(await fs.readFile(conversationPath, "utf8"));

  const out = [];
  const seen = new Set();

  for (const pattern of patterns.patterns || []) {
    if (!patternMatchesCategory(pattern, rules)) continue;
    const ru = (pattern.examples?.[0]?.ru || pattern.ruPattern || "").trim();
    const ing = (pattern.ingTemplate || pattern.examples?.[0]?.ing_expected || "").trim();
    if (!ru || !ing) continue;
    const key = norm(ru);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ru,
      ing,
      id: pattern.id.startsWith("numbers_") ? `api_${pattern.id}` : undefined,
      source: "pattern"
    });
  }

  for (const item of conversation.items || []) {
    if (!conversationMatchesCategory(item, rules)) continue;
    const ru = (item.ru || "").trim();
    const ing = (item.ing || "").trim();
    if (!ru || !ing) continue;
    const key = norm(ru);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ru,
      ing,
      pron: item.pron,
      id: item.id,
      source: "conversation"
    });
  }

  return out;
}

async function fillCategory(category, { dryRun = false } = {}) {
  const rules = CATEGORY_SOURCES[category];
  if (!rules) {
    throw new Error(`Unknown category "${category}". Available: ${Object.keys(CATEGORY_SOURCES).join(", ")}`);
  }

  const categoryPath = path.join(CATEGORIES_DIR, `${category}.json`);
  const habar = JSON.parse(await fs.readFile(categoryPath, "utf8"));
  const existingKeys = new Set((habar.items || []).map((it) => norm(it.ru)));
  const apiPhrases = await collectApiPhrases(category, rules);

  const added = [];
  let index = (habar.items || []).length;
  for (const phrase of apiPhrases) {
    const key = norm(phrase.ru);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    added.push(
      toHabarItem({
        ru: phrase.ru,
        ing: phrase.ing,
        pron: phrase.pron,
        id: phrase.id,
        category,
        index: index++
      })
    );
  }

  if (!added.length) {
    process.stdout.write(`No new phrases for "${category}".\n`);
    return { category, added: 0, total: habar.items.length };
  }

  habar.items = [...(habar.items || []), ...added];

  if (!dryRun) {
    await fs.writeFile(categoryPath, `${JSON.stringify(habar, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`Added ${added.length} phrases to "${category}" (total ${habar.items.length}).\n`);
  added.forEach((it) => process.stdout.write(`  + ${it.ru} -> ${it.ing}\n`));
  return { category, added: added.length, total: habar.items.length };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const categories = args.filter((a) => !a.startsWith("--"));
  if (!categories.length) {
    process.stderr.write("Usage: node fill-habar-from-api.js [--dry-run] <category> [category...]\n");
    process.exit(1);
  }
  for (const category of categories) {
    await fillCategory(category, { dryRun });
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
