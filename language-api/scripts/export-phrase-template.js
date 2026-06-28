/**
 * Export phrase template: RU text + empty ING column for manual translation.
 *
 * Usage:
 *   node scripts/export-phrase-template.js --corpus=telephone_conversation_lesson_14.json
 *   node scripts/export-phrase-template.js --text=path/to/story.txt --title="Название"
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const CORPUS_DIR = path.join(ROOT, "data", "corpus", "stories");
const OUT_DIR = path.join(ROOT, "data", "corpus", "templates");

function parseArgs(argv) {
  const corpusArg = argv.find((a) => a.startsWith("--corpus="));
  const textArg = argv.find((a) => a.startsWith("--text="));
  const titleArg = argv.find((a) => a.startsWith("--title="));
  const outArg = argv.find((a) => a.startsWith("--out="));
  return {
    corpus: corpusArg ? corpusArg.slice("--corpus=".length) : "",
    textPath: textArg ? path.resolve(textArg.slice("--text=".length)) : "",
    title: titleArg ? titleArg.slice("--title=".length) : "",
    outPath: outArg ? path.resolve(outArg.slice("--out=".length)) : ""
  };
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return normalizeSpaces(text)
    .split(/(?<=[.!?…])\s+(?=[А-ЯЁ«\-])/)
    .map(normalizeSpaces)
    .filter((s) => s.length >= 4 && /[а-яё]/i.test(s));
}

function isGrammarNoise(ru) {
  return /^(Вопросительные местоимения|Главные слова|УРОК\s*\d)/i.test(ru);
}

async function fromCorpus(corpusFile, titleOverride) {
  const filePath = path.join(CORPUS_DIR, corpusFile);
  const json = JSON.parse(await fsp.readFile(filePath, "utf8"));
  const title = titleOverride || json.title || corpusFile;
  const phrases = (json.paragraphs || [])
    .map((p) => normalizeSpaces(p.ru))
    .filter((ru) => ru && !isGrammarNoise(ru));
  return { title, phrases, source: `corpus:${corpusFile}` };
}

async function fromText(textPath, title) {
  const raw = await fsp.readFile(textPath, "utf8");
  const body = raw.replace(/^#.*$/gm, "").trim();
  const phrases = splitSentences(body);
  return { title: title || path.basename(textPath, path.extname(textPath)), phrases, source: textPath };
}

function toTemplateLines(meta, phrases) {
  const lines = [
    `# ${meta.title}`,
    `# Формат: РУССКИЙ<TAB>ИНГУШСКИЙ (вставьте перевод во 2-й колонке)`,
    `# Источник: ${meta.source}`,
    `# Фраз: ${phrases.length}`,
    "",
    `=== ${meta.title} ===`,
    ""
  ];
  for (const ru of phrases) lines.push(`${ru}\t`);
  lines.push("");
  return lines.join("\n");
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fsp.mkdir(OUT_DIR, { recursive: true });

  let meta;
  if (args.corpus) {
    meta = await fromCorpus(args.corpus, args.title);
  } else if (args.textPath) {
    meta = await fromText(args.textPath, args.title);
  } else {
    process.stderr.write(
      "Usage:\n" +
        "  node scripts/export-phrase-template.js --corpus=telephone_conversation_lesson_14.json\n" +
        "  node scripts/export-phrase-template.js --text=path.txt --title=\"Название\"\n"
    );
    process.exit(1);
  }

  const outPath =
    args.outPath || path.join(OUT_DIR, `${slugify(meta.title)}-phrases.txt`);
  await fsp.writeFile(outPath, toTemplateLines(meta, meta.phrases), "utf8");
  process.stdout.write(`OK: ${meta.phrases.length} phrases → ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
