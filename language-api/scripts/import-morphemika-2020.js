/**
 * Import «Современный ингушский язык. Морфемика. Словообразование» (2020).
 *
 * Usage:
 *   node scripts/import-morphemika-2020.js
 *   node scripts/import-morphemika-2020.js --pdf=path/to/source.pdf
 */
const fs = require("node:fs");
const path = require("node:path");
const pdfParse = require("pdf-parse");
const { parseMorphemikaText } = require("./lib/morphemika-2020-parse");

const ROOT = path.join(__dirname, "..");
const EXTERNAL = path.join(ROOT, "data", "external", "morphemika-2020");
const DEFAULT_PDF = path.join(EXTERNAL, "source.pdf");
const EXTRACTED_FILE = path.join(EXTERNAL, "extracted.txt");
const KNOWLEDGE_FILE = path.join(ROOT, "data", "grammar", "morphemika-2020-knowledge.json");
const AFFIXES_FILE = path.join(ROOT, "data", "grammar", "morphemika-2020-affixes.json");

async function extractPdfText(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  return (data.text || "").replace(/\r/g, "");
}

async function main() {
  const pdfArg = process.argv.find((a) => a.startsWith("--pdf="));
  const pdfPath = pdfArg ? path.resolve(pdfArg.slice(6)) : DEFAULT_PDF;
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const text = await extractPdfText(pdfPath);
  fs.mkdirSync(EXTERNAL, { recursive: true });
  fs.writeFileSync(EXTRACTED_FILE, text, "utf8");

  const parsed = parseMorphemikaText(text);

  const knowledge = {
    schema: "morphemika-2020-knowledge/v1",
    source: "morphemika-2020",
    authors: "Н.М. Барахоева, Ф.М. Илиева, Р.Р. Хайрова",
    titleRu: "Современный ингушский язык. Морфемика. Словообразование",
    publisherNote: "ФГБОУ ВО «ИнГУ» / ГБУ «ИнгНИИ», Магас, 2020. ISBN 978-5-4482-0072-4.",
    noteRu:
      "103 параграфа (§ 1–103): морфемика, словообразование по частям речи, инвентарь глагольных префиксов. Не дублирует declensions.json, noun-class-knowledge, desheriev conjugation.",
    affixesRef: "data/grammar/morphemika-2020-affixes.json",
    stats: parsed.stats,
    sections: parsed.sections.map((s) => ({
      id: s.id,
      paragraph: s.paragraph,
      part: s.part,
      partTitleRu: s.partTitleRu,
      titleRu: s.titleRu,
      charCount: s.charCount,
      exampleCount: s.examples.length,
      affixCount: s.affixes.length,
      dedupeRef: s.dedupeRef,
      sourceRef: s.sourceRef,
      bodyRu: s.bodyRu,
      examples: s.examples,
      affixes: s.affixes
    }))
  };

  const affixes = {
    schema: "morphemika-2020-affixes/v1",
    source: "morphemika-2020",
    knowledgeRef: "data/grammar/morphemika-2020-knowledge.json",
    stats: {
      entries: parsed.affixes.length,
      prefixes: parsed.affixes.filter((a) => a.kind === "prefix").length,
      suffixes: parsed.affixes.filter((a) => a.kind === "suffix").length
    },
    items: parsed.affixes
  };

  fs.mkdirSync(path.dirname(KNOWLEDGE_FILE), { recursive: true });
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(knowledge, null, 2), "utf8");
  fs.writeFileSync(AFFIXES_FILE, JSON.stringify(affixes, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        pdf: pdfPath,
        extracted: EXTRACTED_FILE,
        knowledge: KNOWLEDGE_FILE,
        affixes: AFFIXES_FILE,
        stats: parsed.stats,
        sampleSection: {
          id: parsed.sections[0]?.id,
          title: parsed.sections[0]?.titleRu,
          examples: parsed.sections[0]?.examples?.slice(0, 2)
        },
        verbPrefixSample: parsed.sections.find((s) => s.paragraph === 72)
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
