/**
 * Import «Уроки ингушского языка» (Хайрова, Баркинхоева, Костоев) → JSON + knowledge.
 *
 * Usage:
 *   node scripts/import-uroki-ingush.js
 *   node scripts/import-uroki-ingush.js --text=path/to/extracted.txt
 */
const fs = require("node:fs");
const path = require("node:path");
const { parseUrokiText } = require("./lib/uroki-ingush-parse");

const ROOT = path.join(__dirname, "..");
const EXTERNAL = path.join(ROOT, "data", "external", "uroki-ingush");
const DEFAULT_TEXT = path.join(EXTERNAL, "extracted-raw.txt");
const OUT_FILE = path.join(ROOT, "data", "dictionary", "uroki-ingush.json");
const KNOWLEDGE_FILE = path.join(ROOT, "data", "grammar", "uroki-ingush-knowledge.json");

function lessonKnowledgeSection(lesson) {
  return {
    id: lesson.id,
    lesson: lesson.number,
    titleRu: lesson.titleRu,
    titleIng: lesson.titleIng,
    kind: lesson.kind,
    phraseCount: lesson.phraseCount,
    vocabularyCount: lesson.vocabularyCount,
    grammarNoteCount: lesson.grammarNotes.length
  };
}

async function main() {
  const textArg = process.argv.find((a) => a.startsWith("--text="));
  const textPath = textArg ? path.resolve(textArg.slice(7)) : DEFAULT_TEXT;
  if (!fs.existsSync(textPath)) {
    console.error(`Text file not found: ${textPath}`);
    console.error("Convert source.doc to docx, then: node scripts/extract-docx-text.js ...");
    process.exit(1);
  }

  const text = fs.readFileSync(textPath, "utf8");
  const parsed = parseUrokiText(text);

  const items = parsed.lessons.map((lesson) => ({
    id: lesson.id,
    number: lesson.number,
    titleRu: lesson.titleRu,
    titleIng: lesson.titleIng,
    kind: lesson.kind,
    pairs: lesson.pairs,
    vocabulary: lesson.vocabulary,
    grammarNotes: lesson.grammarNotes,
    source: "uroki_2009"
  }));

  const dictionary = {
    schema: "uroki-ingush/v1",
    source: "uroki_2009",
    authors: "Хайрова Х. А., Баркинхоева З. К., Костоев Х. М.",
    titleRu: "Уроки ингушского языка",
    publisherNote: "Учебный курс 37 уроков: диалоги, лексика, грамматика (классы, падежи, наклонения).",
    lessonCount: parsed.lessonCount,
    phraseCount: parsed.phraseCount,
    vocabCount: parsed.vocabCount,
    items
  };

  const knowledge = {
    schema: "uroki-ingush-knowledge/v1",
    source: "uroki-ingush",
    authors: dictionary.authors,
    titleRu: dictionary.titleRu,
    noteRu:
      "Полный учебник Хайрова/Баркинхоева/Костоева. Дополняет фрагменты с PaydaDosh/ghalghay.com полной структурой уроков.",
    stats: {
      lessons: parsed.lessonCount,
      phrases: parsed.phraseCount,
      vocabulary: parsed.vocabCount,
      grammarLessons: items.filter((it) => it.kind === "grammar").length
    },
    sections: items.map(lessonKnowledgeSection)
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(dictionary, null, 2), "utf8");
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(knowledge, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        dictionary: OUT_FILE,
        knowledge: KNOWLEDGE_FILE,
        lessons: parsed.lessonCount,
        phrases: parsed.phraseCount,
        vocabulary: parsed.vocabCount,
        sample: items[0]?.pairs?.slice(0, 3)
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
