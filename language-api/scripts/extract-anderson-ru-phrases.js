/**
 * Extract Russian phrases from Anderson_Skazki.pdf (digital text layer).
 * Output: tab-separated lines for manual Ingush fill-in.
 *
 * Usage:
 *   node scripts/extract-anderson-ru-phrases.js
 *   node scripts/extract-anderson-ru-phrases.js --pdf="C:/Users/admin/Downloads/Anderson_Skazki.pdf"
 *   node scripts/extract-anderson-ru-phrases.js --story="ГАДКИЙ УТЕНОК"
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const pdfParse = require("pdf-parse");

const ROOT = path.join(__dirname, "..");
const DEFAULT_PDF = "C:/Users/admin/Downloads/Anderson_Skazki.pdf";
const OUT_DIR = path.join(ROOT, "data", "external", "andersen-skazki");

function parseArgs(argv) {
  const pdfArg = argv.find((a) => a.startsWith("--pdf="));
  const storyArg = argv.find((a) => a.startsWith("--story="));
  return {
    pdfPath: pdfArg ? path.resolve(pdfArg.slice("--pdf=".length)) : DEFAULT_PDF,
    storyFilter: storyArg ? storyArg.slice("--story=".length).trim().toUpperCase() : ""
  };
}

function cleanPdfText(raw) {
  return (raw || "")
    .replace(/\r/g, "")
    .replace(/100 лучших книг[^\n]*/gi, "")
    .replace(/Ганс Христиан Андерсон[^\n]*Сказки[^\n]*/gi, "")
    .replace(/http:\/\/www\.100bestbooks\.ru\s*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isStoryTitle(line) {
  const t = line.trim();
  if (t.length < 4 || t.length > 120) return false;
  if (!/^[А-ЯЁ0-9][А-ЯЁа-яё0-9\s\-–—.,!?«»"()]+$/.test(t)) return false;
  if (/^\d+\.\s/.test(t)) return true;
  if (/^[А-ЯЁ][А-ЯЁ\s\-–—]{3,}$/.test(t) && t.length < 80) return true;
  return false;
}

function isNoiseLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^100 лучших|^http:/i.test(t)) return true;
  if (/^Ганс Христиан/i.test(t)) return true;
  if (/^Сказки\s*$/i.test(t)) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function splitIntoPhrases(paragraph) {
  const p = normalizeSpaces(paragraph);
  if (!p) return [];

  return p
    .split(/(?<=[.!?…])\s+(?=[А-ЯЁ«\-])/)
    .map(normalizeSpaces)
    .filter((s) => s.length >= 4);
}

function extractStories(text) {
  const lines = text.split("\n");
  const stories = [];
  let current = { title: "Вступление", paragraphs: [] };
  let paraBuf = [];

  const flushPara = () => {
    const joined = normalizeSpaces(paraBuf.join(" "));
    if (joined) current.paragraphs.push(joined);
    paraBuf = [];
  };

  const flushStory = () => {
    flushPara();
    if (current.paragraphs.length) stories.push(current);
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flushPara();
      continue;
    }
    if (isNoiseLine(t)) continue;

    if (isStoryTitle(t) && paraBuf.length === 0) {
      flushStory();
      current = { title: t.replace(/\s+/g, " "), paragraphs: [] };
      continue;
    }

    paraBuf.push(t);
  }
  flushStory();
  return stories;
}

function storyToPhrases(story) {
  const phrases = [];
  for (const para of story.paragraphs) {
    for (const ru of splitIntoPhrases(para)) {
      if (ru.length < 4 || ru.length > 320) continue;
      if (!/[а-яё]/i.test(ru)) continue;
      phrases.push(ru);
    }
  }
  return phrases;
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.pdfPath)) {
    process.stderr.write(`PDF not found: ${args.pdfPath}\n`);
    process.exit(1);
  }

  const data = await pdfParse(fs.readFileSync(args.pdfPath));
  const cleaned = cleanPdfText(data.text);
  let stories = extractStories(cleaned);

  if (args.storyFilter) {
    stories = stories.filter((s) => s.title.toUpperCase().includes(args.storyFilter));
    if (!stories.length) {
      process.stderr.write(`Story not found: ${args.storyFilter}\n`);
      process.exit(1);
    }
  }

  await fsp.mkdir(OUT_DIR, { recursive: true });
  const fullTxtPath = path.join(OUT_DIR, "anderson-skazki-ru-full.txt");
  await fsp.writeFile(fullTxtPath, cleaned, "utf8");

  const lines = [
    "# Андерсен — Сказки (русский текст из PDF)",
    "# Формат: РУССКИЙ<TAB>ИНГУШСКИЙ (ингушский — заполните сами)",
    "# PDF: Anderson_Skazki.pdf, страниц: " + data.numpages,
    ""
  ];

  let total = 0;
  const index = [];

  for (const story of stories) {
    const phrases = storyToPhrases(story);
    if (!phrases.length) continue;
    lines.push(`=== ${story.title} ===`);
    lines.push("");
    for (const ru of phrases) {
      lines.push(`${ru}\t`);
      total += 1;
    }
    lines.push("");
    index.push({ title: story.title, count: phrases.length });
  }

  const outPath = args.storyFilter
    ? path.join(OUT_DIR, `anderson-skazki-ru-phrases-${slugify(args.storyFilter)}.txt`)
    : path.join(OUT_DIR, "anderson-skazki-ru-phrases.txt");
  await fsp.writeFile(outPath, `${lines.join("\n")}\n`, "utf8");

  const summary = {
    pdfPath: args.pdfPath,
    pages: data.numpages,
    stories: index,
    phraseCount: total,
    outPhrases: path.relative(ROOT, outPath).replace(/\\/g, "/"),
    outFullText: path.relative(ROOT, fullTxtPath).replace(/\\/g, "/"),
    sample: index[0]
      ? storyToPhrases(stories.find((s) => s.title === index[0].title)).slice(0, 6)
      : [],
    finishedAt: new Date().toISOString()
  };
  await fsp.writeFile(path.join(OUT_DIR, "anderson-ru-extract-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  process.stdout.write(
    `Stories: ${index.length}\nPhrases: ${total}\n` +
      `Out: ${outPath}\nFull text: ${fullTxtPath}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
