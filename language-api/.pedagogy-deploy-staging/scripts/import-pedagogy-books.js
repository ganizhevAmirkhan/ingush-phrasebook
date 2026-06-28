/**
 * Import pedagogy textbooks from data/external/* → grammar knowledge + corpus excerpts.
 *
 * Usage:
 *   node scripts/import-pedagogy-books.js
 *   node scripts/import-pedagogy-books.js --only=ozdoev-1970,iomabara-praktikum
 *   node scripts/import-pedagogy-books.js --book=ozdoev-1970 --pdf=C:/path/to.pdf
 *   node scripts/import-pedagogy-books.js --check          # VPS: только проверить JSON
 *   node scripts/import-pedagogy-books.js --skip-existing  # пропустить книги, если JSON уже есть
 */
const fs = require("node:fs");
const path = require("node:path");
const pdfParse = require("pdf-parse");
const {
  parseOzdoev1970Text,
  parseIomabaraPraktikumText,
  parseOzdoevOrtographyText,
  parseHlanzaraText
} = require("./lib/pedagogy-parse");

const ROOT = path.join(__dirname, "..");

const BOOKS = {
  "ozdoev-1970": {
    titleRu: "ГӀалгӀай мотт — пособие для педучилищ (Оздоев, 1970)",
    authors: "И. А. Оздоев",
    externalDir: "ozdoev-1970",
    knowledgeFile: "ozdoev-1970-knowledge.json",
    phrasesFile: "ozdoev-1970-phrases.json",
    corpusFile: "pedagogy_ozdoev_1970.json",
    schema: "ozdoev-1970-knowledge/v1",
    source: "ozdoev_1970",
    parse: parseOzdoev1970Text,
    noteRu:
      "Лексика, фонетика, морфология, синтаксис. §1–122. Упражнения и отрывки художественных текстов (ингуш.)."
  },
  "iomabara-praktikum": {
    titleRu: "ГӀалгӀай мотт Ӏомабара практикум (педучилище)",
    authors: "коллектив авторов",
    externalDir: "iomabara-praktikum",
    knowledgeFile: "iomabara-praktikum-knowledge.json",
    phrasesFile: "iomabara-praktikum-phrases.json",
    corpusFile: "pedagogy_iomabara_praktikum.json",
    schema: "iomabara-praktikum-knowledge/v1",
    source: "iomabara_praktikum",
    parse: parseIomabaraPraktikumText,
    noteRu: "Практикум по грамматике и орфографии для студентов педучилищ."
  },
  "ozdoev-ortography-2003": {
    titleRu: "ГӀалгӀай метта орфографи (Оздоев И.А., Оздоев Р.И., 2003)",
    authors: "И. А. Оздоев, Р. И. Оздоев",
    externalDir: "ozdoev-ortography",
    knowledgeFile: "ozdoev-ortography-2003-knowledge.json",
    phrasesFile: null,
    corpusFile: null,
    schema: "ozdoev-ortography-2003-knowledge/v1",
    source: "ozdoev_ortography_2003",
    parse: parseOzdoevOrtographyText,
    noteRu: "Справочник правил орфографии ингушского языка, 32 с."
  },
  "hlanzara-ingush": {
    titleRu: "Хlанзара гӀалгӀай мотт (учебник ИнгГУ)",
    authors: "Р. И. Ахриева и др.",
    externalDir: "hlanzara-ingush",
    knowledgeFile: "hlanzara-ingush-knowledge.json",
    phrasesFile: "hlanzara-ingush-phrases.json",
    corpusFile: "pedagogy_hlanzara.json",
    schema: "hlanzara-ingush-knowledge/v1",
    source: "hlanzara_ingush",
    parse: parseHlanzaraText,
    noteRu: "Университетский курс: лексикология, морфология, фонетика, синтаксис, части речи."
  }
};

async function extractPdfText(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  return (data.text || "").replace(/\r/g, "");
}

function bookOutputPaths(book) {
  const grammarDir = path.join(ROOT, "data", "grammar");
  const colloquialDir = path.join(ROOT, "data", "colloquial");
  const corpusDir = path.join(ROOT, "data", "corpus", "stories");
  return {
    knowledge: path.join(grammarDir, book.knowledgeFile),
    phrases: book.phrasesFile ? path.join(colloquialDir, book.phrasesFile) : null,
    corpus: book.corpusFile ? path.join(corpusDir, book.corpusFile) : null
  };
}

function readExistingStats(filePath) {
  try {
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return json.stats || { sections: (json.sections || []).length };
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const onlyArg = argv.find((a) => a.startsWith("--only="));
  const bookArg = argv.find((a) => a.startsWith("--book="));
  const pdfArg = argv.find((a) => a.startsWith("--pdf="));
  const only = onlyArg
    ? onlyArg
        .slice(7)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  return {
    only: bookArg ? [bookArg.slice(7)] : only,
    pdfPath: pdfArg ? path.resolve(pdfArg.slice(6)) : null,
    checkOnly: argv.includes("--check"),
    skipExisting: argv.includes("--skip-existing") || argv.includes("--check")
  };
}

async function importBook(key, book, pdfOverride) {
  const external = path.join(ROOT, "data", "external", book.externalDir);
  const extractedPath = path.join(external, "extracted.txt");
  const defaultPdf = path.join(external, "source.pdf");

  if (pdfOverride && fs.existsSync(pdfOverride)) {
    fs.mkdirSync(external, { recursive: true });
    const text = await extractPdfText(pdfOverride);
    fs.copyFileSync(pdfOverride, defaultPdf);
    fs.writeFileSync(extractedPath, text, "utf8");
  } else if (!fs.existsSync(extractedPath)) {
    if (fs.existsSync(defaultPdf)) {
      const text = await extractPdfText(defaultPdf);
      fs.writeFileSync(extractedPath, text, "utf8");
    } else {
      throw new Error(`No extracted.txt or source.pdf in ${external}`);
    }
  }

  const text = fs.readFileSync(extractedPath, "utf8");
  if (text.length < 500) {
    throw new Error(`Text too short (${text.length} chars) — PDF may be scan-only: ${key}`);
  }

  const parsed = book.parse(text);
  const knowledge = {
    schema: book.schema,
    source: book.source,
    authors: book.authors,
    titleRu: book.titleRu,
    noteRu: book.noteRu,
    stats: parsed.stats,
    sections: parsed.sections.map((s) => ({
      id: s.id,
      paragraph: s.paragraph,
      part: s.part,
      partTitleRu: s.partTitleRu,
      titleRu: s.titleRu,
      charCount: s.charCount,
      exampleCount: (s.examples || []).length,
      sourceRef: s.sourceRef,
      bodyRu: s.bodyRu,
      examples: s.examples || []
    }))
  };

  const grammarDir = path.join(ROOT, "data", "grammar");
  fs.mkdirSync(grammarDir, { recursive: true });
  const knowledgePath = path.join(grammarDir, book.knowledgeFile);
  fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2), "utf8");

  let phrasesPath = null;
  if (book.phrasesFile && parsed.phrases.length) {
    const phrases = {
      schema: `${book.source}-phrases/v1`,
      source: book.source,
      itemCount: parsed.phrases.length,
      items: parsed.phrases.map((p, i) => ({
        id: `${book.source}_${i + 1}`,
        ru: p.ru,
        ing: p.ing,
        kind: p.kind || "phrase",
        category: book.source
      }))
    };
    const colloquialDir = path.join(ROOT, "data", "colloquial");
    fs.mkdirSync(colloquialDir, { recursive: true });
    phrasesPath = path.join(colloquialDir, book.phrasesFile);
    fs.writeFileSync(phrasesPath, JSON.stringify(phrases, null, 2), "utf8");
  }

  let corpusPath = null;
  if (book.corpusFile && parsed.literature.length) {
    const corpus = {
      id: book.corpusFile.replace(".json", ""),
      title: book.titleRu,
      level: "B2",
      genre: "pedagogy",
      source: book.source,
      paragraphs: parsed.literature.map((ex, i) => ({
        ru: `${ex.author} — отрывок из учебника`,
        ing: ex.ing
      })),
      glossary: []
    };
    const corpusDir = path.join(ROOT, "data", "corpus", "stories");
    fs.mkdirSync(corpusDir, { recursive: true });
    corpusPath = path.join(corpusDir, book.corpusFile);
    fs.writeFileSync(corpusPath, JSON.stringify(corpus, null, 2), "utf8");
  }

  return {
    key,
    knowledge: knowledgePath,
    phrases: phrasesPath,
    corpus: corpusPath,
    stats: parsed.stats
  };
}

async function main() {
  const { only, pdfPath, checkOnly, skipExisting } = parseArgs(process.argv);
  const keys = only || Object.keys(BOOKS);
  const results = [];
  const skipped = [];
  const errors = [];

  for (const key of keys) {
    const book = BOOKS[key];
    if (!book) {
      errors.push({ key, error: "unknown_book" });
      continue;
    }
    const paths = bookOutputPaths(book);
    if (checkOnly || skipExisting) {
      if (fs.existsSync(paths.knowledge)) {
        skipped.push({
          key,
          mode: checkOnly ? "check_ok" : "skip_existing",
          knowledge: paths.knowledge,
          phrases: paths.phrases && fs.existsSync(paths.phrases) ? paths.phrases : null,
          corpus: paths.corpus && fs.existsSync(paths.corpus) ? paths.corpus : null,
          stats: readExistingStats(paths.knowledge)
        });
        continue;
      }
      if (checkOnly) {
        errors.push({
          key,
          error: `missing ${paths.knowledge} — залейте JSON с ПК (WinSCP), импорт PDF на VPS не нужен`
        });
        continue;
      }
    }
    try {
      const pdfOverride = keys.length === 1 && pdfPath ? pdfPath : null;
      results.push(await importBook(key, book, pdfOverride));
    } catch (err) {
      if (skipExisting && fs.existsSync(paths.knowledge)) {
        skipped.push({
          key,
          mode: "skip_existing_after_error",
          knowledge: paths.knowledge,
          stats: readExistingStats(paths.knowledge),
          note: err.message
        });
      } else {
        errors.push({ key, error: err.message });
      }
    }
  }

  const ok = errors.length === 0;
  const payload = { ok, results, skipped, errors };
  if (checkOnly) {
    payload.hint =
      "На VPS не запускайте импорт из PDF. Залейте pedagogy-deploy.zip или JSON вручную, затем: bash scripts/install-pedagogy-on-vps.sh";
  }
  console.log(JSON.stringify(payload, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
