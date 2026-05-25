const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const CATEGORIES_DIR = path.join(ROOT, "categories");
const PATTERNS_FILE = path.join(ROOT, "language-api", "data", "grammar", "patterns.json");
const PAYDADOSH_FILE = path.join(ROOT, "language-api", "data", "colloquial", "paydadosh-phrases.json");

const CATEGORY_SOURCES = {
  numbers: {
    patternIdPrefix: ["numbers_"],
    descriptionIncludes: ["Lesson 9"],
    conversationIdIncludes: ["numbers_lesson"]
  },
  greetings: {
    patternIdPrefix: ["greeting_"],
    patternIdExact: ["family_hello_friends", "phone_big_greetings_family", "acquaintance_assalamu_ahmed"],
    skipPatternIds: ["greeting_lesson1_title", "greeting_learn_ingush"],
    conversationIdIncludes: ["greetings_lesson_1"],
    paydadoshRuIncludes: [
      "ассалам",
      "алейкум",
      "здравствуй",
      "маршал",
      "доброе утро",
      "добрый день",
      "добрый вечер",
      "спокойной ночи",
      "до свидания",
      "как вы поживаете",
      "как здоровье"
    ],
    paydadoshMaxRuLen: 60,
    removeJunk: true,
    targetCount: 46,
    priorityRu: [
      "ассаламу алейкум",
      "ва алейкум салам",
      "здравствуй",
      "добрый день к 1 человеку",
      "как вы поживаете",
      "как здоровье",
      "живем потихоньку",
      "живем здоровые",
      "живите долго",
      "живи долго мужчине",
      "живи долго женщине",
      "доброе утро всем",
      "добрый день всем",
      "добрый вечер всем",
      "спокойной ночи всем",
      "здравствуйте друзья",
      "большой привет семье",
      "до свидания всем",
      "желаем успеха",
      "ассалам алейкум ахмед"
    ]
  }
};

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…«»":]/g, "").trim();
}

function cleanRu(ru) {
  return (ru || "")
    .replace(/^(приветствие|ответ)\s*:\s*/i, "")
    .trim();
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
  const text = cleanRu(ru);
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

function isJunkItem(item) {
  const ru = (item?.ru || "").trim();
  if (!ru || ru === "1" || ru === "Палец") return true;
  if (/^\d+$/.test(ru)) return true;
  return false;
}

function patternMatchesCategory(pattern, rules) {
  const id = pattern?.id || "";
  if (rules.skipPatternIds?.includes(id)) return false;
  if (rules.patternIdExact?.includes(id)) return true;
  if (rules.patternIdPrefix?.some((p) => id.startsWith(p))) return true;
  const desc = (pattern?.description || "").toLowerCase();
  return rules.descriptionIncludes?.some((part) => desc.includes(part.toLowerCase()));
}

function conversationMatchesCategory(item, rules) {
  const id = item?.id || "";
  return rules.conversationIdIncludes?.some((part) => id.includes(part));
}

function paydadoshMatchesCategory(item, rules) {
  const ru = (item?.ru || item?.ruNorm || "").toLowerCase();
  if (!ru) return false;
  if (rules.paydadoshMaxRuLen && ru.length > rules.paydadoshMaxRuLen) return false;
  return rules.paydadoshRuIncludes?.some((part) => ru.includes(part.toLowerCase()));
}

async function collectApiPhrases(category, rules) {
  const patterns = JSON.parse(await fs.readFile(PATTERNS_FILE, "utf8"));
  const conversationPath = path.join(CATEGORIES_DIR, "conversation.json");
  const conversation = JSON.parse(await fs.readFile(conversationPath, "utf8"));

  const out = [];
  const seen = new Set();

  function pushPhrase({ ru, ing, pron, id, source, priority = 999 }) {
    ru = cleanRu(ru);
    const ingText = (ing || "").trim();
    if (!ru || !ingText) return;
    const key = norm(ru);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ru, ing: ingText, pron, id, source, priority, key });
  }

  for (const pattern of patterns.patterns || []) {
    if (!patternMatchesCategory(pattern, rules)) continue;
    const ru = (pattern.examples?.[0]?.ru || pattern.ruPattern || "").trim();
    const ing = (pattern.ingTemplate || pattern.examples?.[0]?.ing_expected || "").trim();
    const priority = rules.priorityRu?.indexOf(norm(ru));
    pushPhrase({
      ru,
      ing,
      id: pattern.id.startsWith("numbers_") || pattern.id.startsWith("greeting_")
        ? `api_${pattern.id}`
        : pattern.id,
      source: "pattern",
      priority: priority >= 0 ? priority : 100 + out.length
    });
  }

  for (const item of conversation.items || []) {
    if (!conversationMatchesCategory(item, rules)) continue;
    const ru = (item.ru || "").trim();
    const ing = (item.ing || "").trim();
    const priority = rules.priorityRu?.indexOf(norm(ru));
    pushPhrase({
      ru,
      ing,
      pron: item.pron,
      id: item.id,
      source: "conversation",
      priority: priority >= 0 ? priority : 200 + out.length
    });
  }

  if (rules.paydadoshRuIncludes) {
    try {
      const paydadosh = JSON.parse(await fs.readFile(PAYDADOSH_FILE, "utf8"));
      for (const item of paydadosh.items || paydadosh || []) {
        if (!paydadoshMatchesCategory(item, rules)) continue;
        const ru = (item.ru || "").trim();
        const ing = (item.ing || "").trim();
        const priority = rules.priorityRu?.indexOf(norm(ru));
        pushPhrase({
          ru,
          ing,
          id: item.id ? `paydadosh_${item.id}` : undefined,
          source: "paydadosh",
          priority: priority >= 0 ? priority : 300 + out.length
        });
      }
    } catch {
      process.stderr.write(`PaydaDosh file not found, skipping.\n`);
    }
  }

  out.sort((a, b) => a.priority - b.priority);
  return out;
}

async function fillCategory(category, { dryRun = false } = {}) {
  const rules = CATEGORY_SOURCES[category];
  if (!rules) {
    throw new Error(`Unknown category "${category}". Available: ${Object.keys(CATEGORY_SOURCES).join(", ")}`);
  }

  const categoryPath = path.join(CATEGORIES_DIR, `${category}.json`);
  const habar = JSON.parse(await fs.readFile(categoryPath, "utf8"));

  if (rules.removeJunk) {
    const before = habar.items.length;
    habar.items = (habar.items || []).filter((it) => !isJunkItem(it));
    const removed = before - habar.items.length;
    if (removed) process.stdout.write(`Removed ${removed} junk item(s) from "${category}".\n`);
  }

  const existingKeys = new Set((habar.items || []).map((it) => norm(it.ru)));
  const apiPhrases = await collectApiPhrases(category, rules);

  const added = [];
  let index = (habar.items || []).length;
  const targetCount = rules.targetCount || Infinity;

  for (const phrase of apiPhrases) {
    if (habar.items.length + added.length >= targetCount) break;
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

  if (!added.length && !rules.removeJunk) {
    process.stdout.write(`No new phrases for "${category}" (${habar.items.length} items).\n`);
    return { category, added: 0, total: habar.items.length };
  }

  habar.items = [...(habar.items || []), ...added];
  habar.version = (habar.version || 0) + 1;
  habar.itemCount = habar.items.length;

  if (!dryRun) {
    await fs.writeFile(categoryPath, `${JSON.stringify(habar, null, 2)}\n`, "utf8");
  }

  process.stdout.write(
    `Added ${added.length} phrases to "${category}" (total ${habar.items.length}, target ${targetCount}).\n`
  );
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
