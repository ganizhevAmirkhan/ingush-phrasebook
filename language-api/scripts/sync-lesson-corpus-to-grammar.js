/**
 * Extract full-sentence pairs from school lesson corpus (ghalghay + imported lessons)
 * and add grammar patterns for phrases not yet covered by Habar sync.
 *
 * Sources already in repo: language-api/data/corpus/stories/*lesson*.json (37+ files)
 * Run after import-ghalghay-lessons.js or manual corpus edits.
 *
 * Usage: node scripts/sync-lesson-corpus-to-grammar.js [--dry-run]
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CORPUS_DIR = path.join(ROOT, "data", "corpus", "stories");
const PATTERNS_FILE = path.join(ROOT, "data", "grammar", "patterns.json");

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…:;«»""]/g, "").trim();
}

function isUsableSentence(ru) {
  const t = (ru || "").replace(/\s+/g, " ").trim();
  if (t.length < 4 || t.length > 100) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 14) return false;
  if (/^\d/.test(t)) return false;
  if (/^[A-Za-zА-Яа-яЁё]+\s*[—–-]/.test(t)) return false;
  if (/\d\s*,\s*\d/.test(t)) return false;
  return true;
}

function slugId(prefix, ru) {
  const s = norm(ru).replace(/[^a-zа-я0-9]+/gi, "_").slice(0, 40);
  return `${prefix}_${s || "phrase"}`;
}

async function loadCorpusPairs() {
  const files = (await fs.readdir(CORPUS_DIR)).filter((f) => f.endsWith(".json"));
  const pairs = [];
  const seen = new Set();

  for (const file of files) {
    if (!/lesson/i.test(file)) continue;
    const data = JSON.parse(await fs.readFile(path.join(CORPUS_DIR, file), "utf8"));
    const prefix = (data.id || file.replace(".json", "")).replace(/[^a-zA-Z0-9_]/g, "_");
    for (const p of data.paragraphs || []) {
      const ru = (p.ru || "").replace(/\s+/g, " ").trim();
      const ing = (p.ing || "").replace(/\s+/g, " ").trim();
      if (!isUsableSentence(ru) || !ing) continue;
      const key = norm(ru);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ ru, ing, key, prefix, source: data.source || file });
    }
  }
  return pairs;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pairs = await loadCorpusPairs();
  const patterns = JSON.parse(await fs.readFile(PATTERNS_FILE, "utf8"));
  const byKey = new Map();
  for (const p of patterns.patterns || []) {
    byKey.set(norm(p.ruPattern), p);
  }

  let added = 0;
  let skipped = 0;

  for (const pair of pairs) {
    const existing = byKey.get(pair.key);
    if (existing) {
      skipped += 1;
      continue;
    }
    const pattern = {
      id: slugId("lesson", pair.key),
      ruPattern: pair.key,
      description: `School lesson corpus (${pair.prefix})`,
      slots: [],
      ingTemplate: pair.ing,
      priority: 98,
      examples: [{ ru: pair.key, ing_expected: pair.ing }]
    };
    patterns.patterns.push(pattern);
    byKey.set(pair.key, pattern);
    added += 1;
  }

  if (!dryRun && added) {
    await fs.writeFile(PATTERNS_FILE, `${JSON.stringify(patterns, null, 2)}\n`, "utf8");
  }

  process.stdout.write(
    `Lesson corpus pairs: ${pairs.length}\n` +
      `Patterns added: ${added}\n` +
      `Skipped (already in patterns): ${skipped}\n` +
      `Total patterns: ${patterns.patterns.length}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
