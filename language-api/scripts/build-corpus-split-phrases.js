const fs = require("node:fs/promises");
const path = require("node:path");

const { splitRuIngPairs, isUsableShortRu } = require("../src/phrase-split");

const ROOT = path.join(__dirname, "..");
const STORIES_DIR = path.join(ROOT, "data", "corpus", "stories");
const OUT = path.join(ROOT, "data", "colloquial", "corpus-split-phrases.json");
const HABAR_CONV = path.join(ROOT, "..", "categories", "conversation.json");
const PAYDADOSH = path.join(ROOT, "data", "colloquial", "paydadosh-phrases.json");

function normalizeRu(value) {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateIngushToPron(ingText) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
    8: "8", 9: "9", 0: "0", "'": "'", "I": "i", "i": "i"
  };
  return (ingText || "")
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      if (map[ch] !== undefined) return map[ch];
      if (map[lower] !== undefined) return map[lower];
      return ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

async function listJsonFiles(dir) {
  try {
    const names = await fs.readdir(dir);
    return names.filter((n) => n.endsWith(".json")).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

async function extractFromCorpus() {
  const files = await listJsonFiles(STORIES_DIR);
  const items = [];

  for (const filePath of files) {
    const json = JSON.parse(await fs.readFile(filePath, "utf8"));
    const genre = (json?.genre || "").toString();
    if (genre !== "lesson" && genre !== "dialogue") continue;

    const category = path.basename(filePath, ".json");
    const paragraphs = Array.isArray(json?.paragraphs) ? json.paragraphs : [];

    paragraphs.forEach((paragraph, index) => {
      const pairs = splitRuIngPairs(paragraph?.ru, paragraph?.ing);
      pairs.forEach((pair, subIndex) => {
        items.push({
          id: `${category}_${index + 1}_${subIndex + 1}`,
          ru: pair.ru,
          ruNorm: normalizeRu(pair.ru),
          ing: pair.ing,
          category,
          source: "corpus_split",
          confidence: genre === "dialogue" ? 0.94 : 0.92
        });
      });
    });
  }

  return items;
}

async function extractShortPaydaDosh(limit = 800) {
  try {
    const json = JSON.parse(await fs.readFile(PAYDADOSH, "utf8"));
    const items = Array.isArray(json?.items) ? json.items : [];
    const short = items.filter((item) => {
      if (!item?.ru || !item?.ing) return false;
      if (item.category === "proverb") return false;
      if (!isUsableShortRu(item.ru)) return false;
      return (item.confidence || 0) >= 0.9;
    });
    short.sort((a, b) => a.ru.length - b.ru.length);
    return short.slice(0, limit).map((item) => ({
      id: item.id,
      ru: item.ru,
      ruNorm: item.ruNorm || normalizeRu(item.ru),
      ing: item.ing,
      category: item.category || "paydadosh_short",
      source: "paydadosh_short",
      confidence: item.confidence || 0.93
    }));
  } catch {
    return [];
  }
}

function dedupeByRu(items) {
  const byRu = new Map();
  for (const item of items) {
    if (!item?.ruNorm || !item?.ing) continue;
    const prev = byRu.get(item.ruNorm);
    if (!prev || (item.confidence || 0) > (prev.confidence || 0)) {
      byRu.set(item.ruNorm, item);
    }
  }
  return [...byRu.values()].sort((a, b) => a.ru.localeCompare(b.ru, "ru"));
}

async function syncToHabar(items, { dryRun = false } = {}) {
  let habar = { category: "conversation", items: [] };
  try {
    habar = JSON.parse(await fs.readFile(HABAR_CONV, "utf8"));
  } catch {
    // new file
  }

  const existing = new Set(
    (Array.isArray(habar.items) ? habar.items : []).map((x) => normalizeRu(x.ru))
  );

  const added = [];
  for (const item of items) {
    if (existing.has(item.ruNorm)) continue;
    existing.add(item.ruNorm);
    added.push({
      ru: item.ru,
      ing: item.ing,
      pron: transliterateIngushToPron(item.ing),
      id: `imp_${item.id}`.slice(0, 40)
    });
  }

  if (!added.length) {
    console.log("Habar conversation: nothing new to add");
    return 0;
  }

  habar.items = [...(Array.isArray(habar.items) ? habar.items : []), ...added];
  if (!dryRun) {
    await fs.writeFile(HABAR_CONV, `${JSON.stringify(habar, null, 2)}\n`, "utf8");
  }
  console.log(`Habar conversation: +${added.length} phrases (${habar.items.length} total)`);
  return added.length;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const skipHabar = args.has("--no-habar");

  const [corpus, paydadoshShort] = await Promise.all([
    extractFromCorpus(),
    extractShortPaydaDosh()
  ]);

  const merged = dedupeByRu([...corpus, ...paydadoshShort]);
  const payload = {
    version: 1,
    builtAt: new Date().toISOString(),
    count: merged.length,
    fromCorpus: corpus.length,
    fromPaydaDoshShort: paydadoshShort.length,
    items: merged
  };

  if (!dryRun) {
    await fs.writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  console.log(`Corpus split phrases: ${corpus.length} raw → ${merged.length} unique`);
  console.log(`  PaydaDosh short pool: ${paydadoshShort.length}`);
  console.log(`  Output: ${OUT}`);

  if (!skipHabar) {
    await syncToHabar(merged.filter((x) => x.source === "corpus_split"), { dryRun });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
