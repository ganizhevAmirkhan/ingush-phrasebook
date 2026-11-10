/**
 * Export workbench JSON → story corpus + lesson phrases for API.
 *
 * Usage:
 *   node scripts/export-workbench-to-corpus.js data/workbench/synovya-beki.workbench.json
 *   node scripts/export-workbench-to-corpus.js --all
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const WORKBENCH_DIR = path.join(ROOT, "data", "workbench");
const STORIES_DIR = path.join(ROOT, "data", "corpus", "stories");
const PHRASES_DIR = path.join(ROOT, "data", "colloquial");

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[Ӏӏ]/g, "1")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function loadWorkbench(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!raw || !Array.isArray(raw.units)) {
    throw new Error(`Bad workbench: ${filePath}`);
  }
  return raw;
}

function exportOne(wb, filePath) {
  const units = wb.units.filter((u) => (u.ru || "").trim() && (u.ing || "").trim());
  const verified = units.filter((u) => u.status === "verified");
  const forStory = verified.length ? verified : units;

  const storyId = wb.storyId || `story_${path.basename(filePath, ".workbench.json").replace(/\W+/g, "_")}`;
  const story = {
    id: storyId,
    title: wb.title || storyId,
    titleIng: wb.titleIng || "",
    level: wb.level || "B1",
    genre: wb.genre || "novella",
    authorRu: wb.authorRu || "",
    translator: wb.translator || "workbench manual",
    source: wb.source || path.basename(filePath),
    note: wb.note || "Exported from workbench (RU→ING + phrases).",
    paragraphs: forStory.map((u) => ({
      ru: String(u.ru).trim(),
      ing: String(u.ing).trim(),
      ...(u.id ? { unitId: u.id } : {}),
      ...(u.status ? { status: u.status } : {}),
    })),
  };

  // Prefer stable names for known stories
  const storyFile =
    storyId === "story_synovya_beki_001"
      ? path.join(STORIES_DIR, "synovya-beki.json")
      : path.join(STORIES_DIR, `${storyId}.json`);

  fs.mkdirSync(STORIES_DIR, { recursive: true });
  fs.writeFileSync(storyFile, JSON.stringify(story, null, 2) + "\n", "utf8");

  const phraseItems = [];
  const seen = new Set();
  for (const u of forStory) {
    // sentence-level as lesson phrase
    const sentKey = `s:${normalize(u.ru)}|${normalize(u.ing)}`;
    if (!seen.has(sentKey)) {
      seen.add(sentKey);
      phraseItems.push({
        id: `wb_${u.id || phraseItems.length}_sent`,
        ru: String(u.ru).trim(),
        ruNorm: normalize(u.ru),
        ing: String(u.ing).trim(),
        category: "lesson_phrase",
        source: "workbench",
        sourceLabel: wb.title || "workbench",
        confidence: u.status === "verified" ? 0.97 : 0.85,
        unitId: u.id || "",
        kind: "sentence",
      });
    }
    for (const [i, ph] of (u.phrases || []).entries()) {
      if (!(ph.ru || "").trim() || !(ph.ing || "").trim()) continue;
      const key = `p:${normalize(ph.ru)}|${normalize(ph.ing)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      phraseItems.push({
        id: `wb_${u.id || "x"}_ph_${i}`,
        ru: String(ph.ru).trim(),
        ruNorm: normalize(ph.ru),
        ing: String(ph.ing).trim(),
        category: "lesson_phrase",
        source: "workbench",
        sourceLabel: wb.title || "workbench",
        confidence: u.status === "verified" ? 0.96 : 0.84,
        unitId: u.id || "",
        kind: "phrase",
      });
    }
  }

  const phrasesFile = path.join(
    PHRASES_DIR,
    `${(wb.storyId || path.basename(filePath, ".json")).replace(/\W+/g, "-")}-workbench-phrases.json`
  );
  fs.mkdirSync(PHRASES_DIR, { recursive: true });
  const phrasesDoc = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "workbench",
    storyId,
    count: phraseItems.length,
    items: phraseItems,
  };
  fs.writeFileSync(phrasesFile, JSON.stringify(phrasesDoc, null, 2) + "\n", "utf8");

  // Word draft (not merged into lexemes automatically)
  const wordItems = [];
  const wseen = new Set();
  for (const u of forStory) {
    for (const w of u.words || []) {
      if (!(w.ru || "").trim() || !(w.ing || "").trim()) continue;
      const key = normalize(w.ru);
      if (wseen.has(key)) continue;
      wseen.add(key);
      wordItems.push({
        ru: String(w.ru).trim(),
        ing: String(w.ing).trim(),
        pos: w.pos || "",
        note: w.note || "",
        unitId: u.id || "",
      });
    }
  }
  const wordsFile = path.join(WORKBENCH_DIR, `${path.basename(filePath, ".workbench.json")}.words-draft.json`);
  fs.writeFileSync(
    wordsFile,
    JSON.stringify({ version: 1, storyId, count: wordItems.length, items: wordItems }, null, 2) + "\n",
    "utf8"
  );

  return {
    storyFile,
    phrasesFile,
    wordsFile,
    units: forStory.length,
    phrases: phraseItems.length,
    words: wordItems.length,
  };
}

function main() {
  const args = process.argv.slice(2);
  let files = [];
  if (args.includes("--all") || args.length === 0) {
    files = fs
      .readdirSync(WORKBENCH_DIR)
      .filter((f) => f.endsWith(".workbench.json"))
      .map((f) => path.join(WORKBENCH_DIR, f));
  } else {
    files = args.filter((a) => !a.startsWith("-")).map((a) => path.resolve(a));
  }
  if (!files.length) {
    process.stderr.write("No workbench files found.\n");
    process.exit(1);
  }
  for (const f of files) {
    const wb = loadWorkbench(f);
    const r = exportOne(wb, f);
    process.stdout.write(
      `OK ${path.basename(f)} → story=${r.units} phrases=${r.phrases} words=${r.words}\n  ${r.storyFile}\n  ${r.phrasesFile}\n  ${r.wordsFile}\n`
    );
  }
}

main();
