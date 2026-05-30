/**
 * Импорт «Ingush Grammar» (Johanna Nichols, 2011) — оглавление и выдержки на русском.
 *
 * Источник текста (вне git):
 *   ../textbooks-ingush/nichols-ingush-grammar-2011/_extracted/text.txt
 *
 * Пишет:
 *   data/grammar/nichols-ingush-grammar-sections.json
 *
 * Usage:
 *   node scripts/import-nichols-grammar.js
 *   node scripts/import-nichols-grammar.js --text=path/to/text.txt
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_TEXT = path.join(
  "C:",
  "Users",
  "admin",
  "Desktop",
  "РАЗГОВОРНИК",
  "textbooks-ingush",
  "nichols-ingush-grammar-2011",
  "_extracted",
  "text.txt"
);
const OUT = path.join(ROOT, "data", "grammar", "nichols-ingush-grammar-sections.json");

const CHAPTERS_RU = [
  { n: 1, titleEn: "The Ingush language and its speakers", titleRu: "Язык ингушский и его носители" },
  { n: 2, titleEn: "Sound system", titleRu: "Звуковая система" },
  { n: 3, titleEn: "Phonological processes, phonotactics, and word structure", titleRu: "Фонологические процессы, фонотактика и структура слова" },
  { n: 4, titleEn: "Prosody and prosodic wordhood", titleRu: "Просодия и просодическое слово" },
  { n: 5, titleEn: "Word classes", titleRu: "Части речи" },
  { n: 6, titleEn: "Noun declension", titleRu: "Склонение существительных" },
  { n: 7, titleEn: "Gender", titleRu: "Род (классы согласования V/J/B/D)" },
  { n: 8, titleEn: "Derivation and formation of nouns", titleRu: "Словообразование и образование существительных" },
  { n: 9, titleEn: "Pronominals and deictics", titleRu: "Местоимения и указательные слова" },
  { n: 10, titleEn: "Numerals: morphology", titleRu: "Числительные: морфология" },
  { n: 11, titleEn: "Adjectives and participles", titleRu: "Прилагательные и причастия" },
  { n: 12, titleEn: "Verb conjugation classes", titleRu: "Классы спряжения глаголов" },
  { n: 13, titleEn: "Inflectional categories of the verb", titleRu: "Формы и категории глагола" },
  { n: 14, titleEn: "Verbal number, pluractionality, and aktionsart", titleRu: "Число глагола, плюракциональность, акционарт" },
  { n: 15, titleEn: "Verb structure and derivation", titleRu: "Структура и словообразование глагола" },
  { n: 16, titleEn: "Non-inflecting words", titleRu: "Несклоняемые слова" },
  { n: 17, titleEn: "Postpositions and PP's", titleRu: "Послелоги и послелогальные группы" },
  { n: 18, titleEn: "Functions of cases and adpositions", titleRu: "Функции падежей и послелогов" },
  { n: 19, titleEn: "Agreement", titleRu: "Согласование (род, лицо, число, падеж)" },
  { n: 20, titleEn: "Phrases: NP's and PP's", titleRu: "Фразы: именные и послелогальные группы" },
  { n: 21, titleEn: "Valence, argument structure, and alignment", titleRu: "Валентность, аргументы и эргативное выравнивание" },
  { n: 22, titleEn: "Non-arguments", titleRu: "Обстоятельства (неаргументы)" },
  { n: 23, titleEn: "Comparison", titleRu: "Сравнение" },
  { n: 24, titleEn: "Coordination and chaining", titleRu: "Сочинение и цепочечные конструкции" },
  { n: 25, titleEn: "Complementation", titleRu: "Комплементация (придаточные дополнения)" },
  { n: 26, titleEn: "Relative clauses", titleRu: "Относительные придаточные" },
  { n: 27, titleEn: "Adjunct subordination", titleRu: "Обстоятельственные придаточные" },
  { n: 28, titleEn: "Nominalization and clefting", titleRu: "Номинализация и расщеплённые конструкции" },
  { n: 29, titleEn: "Coreference: anaphora, reflexivization, obviation", titleRu: "Кореференция, анафора, рефлексивы" },
  { n: 30, titleEn: "Word order", titleRu: "Порядок слов" },
  { n: 31, titleEn: "Negation", titleRu: "Отрицание" },
  { n: 32, titleEn: "Questions, answers, rebuttals", titleRu: "Вопросы, ответы, возражения" },
  { n: 33, titleEn: "Pragmatic and discourse phenomena", titleRu: "Прагматика и дискурс" },
  { n: 34, titleEn: "Lexicon", titleRu: "Лексикон (быть, движение, родство и др.)" },
  { n: 35, titleEn: "Texts", titleRu: "Тексты (фольклор и разговорная речь)" }
];

const APPENDICES_RU = [
  { id: "appendix_1", titleEn: "Inflection of nouns", titleRu: "Приложение 1: склонение существительных" },
  { id: "appendix_2", titleEn: "Personal and reflexive pronouns", titleRu: "Приложение 2: личные и возвратные местоимения" },
  { id: "appendix_3", titleEn: "Adjectives", titleRu: "Приложение 3: прилагательные" },
  { id: "appendix_4", titleEn: "Numerals", titleRu: "Приложение 4: числительные" },
  { id: "appendix_5", titleEn: "Inflection of verbs", titleRu: "Приложение 5: спряжение глаголов" }
];

/** Ключевые главы для API (согласование, эргатив, падежи) */
const API_PRIORITY = [6, 7, 9, 10, 18, 19, 21, 24, 31, 32, 34];

function parseArgs(argv) {
  let text = DEFAULT_TEXT;
  for (const arg of argv) {
    if (arg.startsWith("--text=")) text = arg.slice("--text=".length);
  }
  return { text };
}

function findChapterStart(text, chapterNum) {
  const re = new RegExp(`\\nCHAPTER\\s+${chapterNum}\\s*\\n`, "i");
  const m = text.match(re);
  return m ? m.index + 1 : -1;
}

function excerptFrom(text, start, maxLen = 520) {
  if (start < 0) return "";
  const slice = text.slice(start, start + maxLen * 3);
  const cleaned = slice
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E\u0400-\u04FFӀ]+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen);
}

async function main() {
  const { text: textPath } = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(textPath, "utf8");

  const sections = CHAPTERS_RU.map((ch) => {
    const start = findChapterStart(raw, ch.n);
    return {
      id: `nichols_ch${ch.n}`,
      number: ch.n,
      titleEn: ch.titleEn,
      titleRu: ch.titleRu,
      apiPriority: API_PRIORITY.includes(ch.n),
      excerptEn: excerptFrom(raw, start)
    };
  });

  const appendices = APPENDICES_RU.map((a) => ({
    ...a,
    excerptEn: ""
  }));

  const out = {
    schema: "nichols-ingush-grammar-sections/v1",
    source: "nichols-ingush-grammar-2011",
    sourceUrl: "https://escholarship.org/uc/item/3nn7z6w5",
    author: "Johanna Nichols",
    titleEn: "Ingush Grammar",
    titleRu: "Грамматика ингушского языка",
    publisher: "University of California Press, 2011",
    isbn: "978-0-520-09877-0",
    pages: 829,
    language: "en",
    catalogLanguage: "ru",
    noteRu:
      "Академическая грамматика на английском. Оглавление и описания разделов — на русском. Полный текст PDF вне git: textbooks-ingush/nichols-ingush-grammar-2011/",
    relevanceRu: {
      nounClasses: "гл. 7, 19 — система согласования (V/J/B/D), не муж/жен род",
      ergative: "гл. 18.4, 21 — эргативный падеж и выравнивание",
      cases: "гл. 6, 18, прилож. 1 — падежи (в т.ч. пространственные)",
      postpositions: "гл. 17 — послелоги вместо предлогов",
      numerals: "гл. 10, прилож. 4 — двадцатеричная система",
      verbTenses: "гл. 13 — времена, наклонения, converbs",
      wordOrder: "гл. 30 — порядок слов, вопросы, existentials"
    },
    generatedAt: new Date().toISOString(),
    sections,
    appendices
  };

  await fs.writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${OUT}\n`);
  process.stdout.write(`Sections: ${sections.length}, appendices: ${appendices.length}\n`);
  process.stdout.write(`Priority for API: ${sections.filter((s) => s.apiPriority).map((s) => s.number).join(", ")}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
