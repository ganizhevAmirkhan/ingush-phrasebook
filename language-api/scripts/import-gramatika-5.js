/**
 * Import «ГIалгIай метта грамматика» 5 класс (2010) into grammar API data.
 *
 * Sources:
 *   data/external/textbooks/gialgiai-metta-gramatika-5-klass-2010/_digitized/*.txt
 *
 * Writes / merges:
 *   data/grammar/gramatika-5-sections.json   — § catalog
 *   data/grammar/patterns.json                — RU→ING phrase patterns
 *   data/grammar/rules.json                 — reference markers (pronouns, particles)
 *   data/corpus/stories/gramatika_5_grammar.json — lesson corpus
 *
 * Usage:
 *   node scripts/import-gramatika-5.js [--dry-run]
 *   node scripts/import-gramatika-5.js --text=path/to.txt
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { isUsableRu } = require("../src/phrase-split");

const ROOT = path.join(__dirname, "..");
const DEFAULT_TEXT = path.join(
  ROOT,
  "data/external/textbooks/gialgiai-metta-gramatika-5-klass-2010/_digitized/gialgiai-metta-gramatika-5-klass-2010.txt"
);
const SECTIONS_FILE = path.join(ROOT, "data/grammar/gramatika-5-sections.json");
const PATTERNS_FILE = path.join(ROOT, "data/grammar/patterns.json");
const RULES_FILE = path.join(ROOT, "data/grammar/rules.json");
const CORPUS_FILE = path.join(ROOT, "data/corpus/stories/gramatika_5_grammar.json");

const XOKHAM_RE = /^(X\s*ь\s*о\s*к\s*х\s*а\s*м|Хьокхам)\s*[:：]?\s*(.*)$/i;

function parseArgs(argv) {
  const out = { text: DEFAULT_TEXT, dryRun: false };
  for (const arg of argv) {
    if (arg.startsWith("--text=")) out.text = arg.slice("--text=".length);
    else if (arg === "--dry-run") out.dryRun = true;
  }
  return out;
}

function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…:;«»""]/g, "").trim();
}

function slugId(prefix, ru) {
  const s = norm(ru).replace(/[^a-zа-я0-9]+/gi, "_").slice(0, 48);
  return `${prefix}_${s || "item"}`;
}

function cleanSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function normalizeIngFromPdf(s) {
  return cleanSpaces(
    (s || "")
      .replace(/Г1/g, "ГI")
      .replace(/г1/g, "гI")
      .replace(/К1/g, "КI")
      .replace(/к1/g, "кI")
      .replace(/Х1/g, "ХI")
      .replace(/х1/g, "хI")
      .replace(/Ц1/g, "ЦI")
      .replace(/ц1/g, "цI")
      .replace(/Ч1/g, "ЧI")
      .replace(/ч1/g, "чI")
      .replace(/П1/g, "ПI")
      .replace(/п1/g, "пI")
      .replace(/Т1/g, "ТI")
      .replace(/т1/g, "тI")
      .replace(/Й1/g, "ЙI")
      .replace(/й1/g, "йI")
      .replace(/1аж/g, "Ӏаж")
      .replace(/1а/g, "Ӏа")
      .replace(/1о/g, "Ӏо")
      .replace(/1у/g, "Ӏу")
  );
}

function looksIngush(s) {
  return /[гкхцчшщ]I|Ӏ|кI|гI|къ|оаз|мотт|Хь|Хьо|со\b|ва\b|да\b|ба\b|деш|цI|чI/i.test(s);
}

function looksRussian(s) {
  const letters = (s || "").replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
  if (letters.length < 3) return false;
  const cyr = (letters.match(/[а-яА-ЯёЁ]/g) || []).length;
  return cyr / letters.length >= 0.9;
}

function isValidImportPair(ru, ing) {
  if (!isUsableRu(ru) || ing.length < 4) return false;
  if (!looksIngush(ing)) return false;
  if (!looksRussian(ru)) return false;
  if (norm(ru) === norm(ing)) return false;
  if (/[гкхцчшщдтнлмрсбвзфп]1|1[а-я]/i.test(ru)) return false;
  if (/^[а-яё.\s\d\-–—,]+$/i.test(ru) && !/\s(в|на|и|не|где|что|как|у|к|из|для|это|есть|нет)\s/i.test(` ${ru} `)) {
    const ruWords = ru.split(/\s+/).filter((w) => w.length > 2);
    if (ruWords.length < 2) return false;
  }
  return true;
}

function isRussianGloss(inner) {
  const t = cleanSpaces(inner).replace(/[?？]/g, "").trim();
  if (t.length < 2 || t.length > 40) return false;
  if (!/[а-яё]/i.test(t)) return false;
  if (/[г1Г1a-zA-Z]{2,}/.test(t)) return false;
  if (/^(ж|кх|д|т)[-®'^]/i.test(t)) return false;
  if (/^\d/.test(t)) return false;
  if (t.split(/\s+/).length > 5) return false;
  return true;
}

function pairFromParenLine(line) {
  const raw = cleanSpaces(line);
  if (!raw || raw.length > 120) return null;
  const parens = [...raw.matchAll(/\(([^)]+)\)/g)];
  if (!parens.length) return null;
  if (!parens.every((m) => isRussianGloss(m[1]))) return null;

  let ru = raw;
  let ing = raw;
  for (const m of parens) {
    const gloss = cleanSpaces(m[1]).replace(/[?？]\s*$/, "?");
    ru = ru.replace(m[0], ` ${gloss} `);
    ing = ing.replace(m[0], " ");
  }
  ru = cleanSpaces(ru);
  ing = normalizeIngFromPdf(cleanSpaces(ing));
  if (!isValidImportPair(ru, ing)) return null;
  if (ru.length > 90) return null;
  return { ru, ing };
}

function pairFromDashLine(line) {
  const m = cleanSpaces(line).match(/^[-—]\s*(.+?)\s*[-—]\s*(.+)$/);
  if (!m) return null;
  const left = normalizeIngFromPdf(m[1]);
  const right = normalizeIngFromPdf(m[2]);
  if (left.length < 2 || right.length < 2) return null;
  if (/[а-яё]{4,}/i.test(left) && /[а-яё]{4,}/i.test(right)) return null;
  return null;
}

function parseSections(text) {
  const sections = [];
  const re = /^§\s*(\d+)\s*\.?\s*(.+)$/gm;
  let m;
  const hits = [];
  while ((m = re.exec(text))) {
    hits.push({ num: Number(m[1]), title: cleanSpaces(m[2]), index: m.index });
  }
  for (let i = 0; i < hits.length; i += 1) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const body = text.slice(start, end).replace(/^§\s*\d+[^\n]*\n?/, "").trim();
    sections.push({
      id: `gramatika5_s${hits[i].num}`,
      number: hits[i].num,
      title: hits[i].title,
      excerpt: body.slice(0, 800).replace(/\s+/g, " ")
    });
  }
  return sections;
}

function extractParenPairs(text) {
  const pairs = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    const pair = pairFromParenLine(line);
    if (!pair) continue;
    const key = norm(pair.ru);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(pair);
  }
  return pairs;
}

function extractXokhamPairs(text) {
  const pairs = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(XOKHAM_RE);
    if (!m) continue;
    const rest = cleanSpaces(m[2]);
    if (!rest) continue;

    const fromParen = pairFromParenLine(rest);
    if (fromParen) {
      const key = norm(fromParen.ru);
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ ...fromParen, kind: "xokham_paren" });
      }
      continue;
    }

    const qa = rest.match(/^(.+?)\s*[-—]\s*(.+)$/);
    if (qa) {
      const q = cleanSpaces(qa[1]);
      const a = normalizeIngFromPdf(cleanSpaces(qa[2]));
      if (q.length <= 40 && a.length <= 60 && /[?？]/.test(q)) {
        const ru = q.replace(/[?？]\s*$/, "").trim();
        if (isUsableRu(ru) || (ru.length >= 3 && ru.length <= 35)) {
          const key = norm(`${ru} ${a}`);
          if (!seen.has(key)) {
            seen.add(key);
            pairs.push({ ru: `${ru}?`, ing: a, kind: "xokham_qa" });
          }
        }
      }
    }
  }
  return pairs;
}

function buildStaticRules() {
  return [
    {
      id: "gramatika5_person_pronouns",
      type: "reference",
      source: "gramatika-5-klass-2010",
      title: "Личные местоимения",
      markers: [
        { ru: "я", ing: "Со" },
        { ru: "мы (с тобой)", ing: "Вай" },
        { ru: "мы (без тебя)", ing: "Тхо" },
        { ru: "ты", ing: "Хьо" },
        { ru: "вы", ing: "Шо" },
        { ru: "он", ing: "Из" },
        { ru: "она", ing: "Из" },
        { ru: "оно", ing: "Уж" },
        { ru: "они", ing: "Ужаш" }
      ],
      notes: "§9 Йовхьий цIерметтдешаш"
    },
    {
      id: "gramatika5_interrogative_particles",
      type: "reference",
      source: "gramatika-5-klass-2010",
      title: "Кертерза маьжена (вопросительные частицы)",
      markers: [
        { ru: "кто? (кхоачам)", ing: "Хьан?" },
        { ru: "что? (кхоачам)", ing: "Сен?" },
        { ru: "кого? (кхоачам)", ing: "Хьанна?" },
        { ru: "чего? (кхоачам)", ing: "Сенна?" },
        { ru: "кому? (кхоачам)", ing: "Хьанда?" },
        { ru: "чему? (кхоачам)", ing: "Сенца?" },
        { ru: "кого? (кхоачам)", ing: "Хьанах?" },
        { ru: "чего? (кхоачам)", ing: "Сенах?" },
        { ru: "к кому? (кхоачам)", ing: "Хьанга?" },
        { ru: "к чему? (кхоачам)", ing: "Сенга?" },
        { ru: "о ком? (кхоачам)", ing: "Хьанал?" },
        { ru: "о чём? (кхоачам)", ing: "Сенал?" }
      ],
      notes: "§14 кхоачам; къоастам — косвенный вопрос; лоаттам — вопрос к слову"
    },
    {
      id: "gramatika5_aux_ba_da",
      type: "reference",
      source: "gramatika-5-klass-2010",
      title: "Вспомогательные ба / да",
      markers: [
        { ru: "есть (ба)", ing: "ба" },
        { ru: "нет (бац)", ing: "бац" },
        { ru: "есть (да)", ing: "да" },
        { ru: "нет (дац)", ing: "дац" }
      ],
      notes: "Существование / отрицание (см. также rules aux_neg_*)"
    }
  ];
}

function buildCorpusParagraphs(sections, pairs) {
  const paragraphs = [
    {
      ru: "Грамматика ингушского языка, 5 класс (Мальсагова, Цицкиева, 2010).",
      ing: "ГIалгIай метта грамматика, 5 класс."
    },
    {
      ru: "В ингушском языке восемь падежей.",
      ing: "ГIалгIай мотта ворхIан падеж йисте хинна."
    },
    {
      ru: "Кхоачам, къоастам, лоаттам — кертерза маьжена (вопросительные частицы).",
      ing: "Кхоачам, къоастам, лоаттам — кертерза маьжена я."
    }
  ];

  for (const s of sections.slice(0, 25)) {
    if (!s.title || s.title.length < 4) continue;
    paragraphs.push({
      ru: `§${s.number}. ${s.title}`,
      ing: s.excerpt.slice(0, 200) || s.title
    });
  }

  for (const p of pairs.slice(0, 120)) {
    paragraphs.push({ ru: p.ru, ing: p.ing });
  }

  const seen = new Set();
  return paragraphs.filter((p) => {
    const k = norm(p.ru);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return isUsableRu(p.ru) && p.ing;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const textPath = path.isAbsolute(args.text) ? args.text : path.join(ROOT, args.text);
  const raw = await fs.readFile(textPath, "utf8");

  const sections = parseSections(raw);
  const parenPairs = extractParenPairs(raw);
  const xokhamPairs = extractXokhamPairs(raw);
  const allPairs = [...parenPairs, ...xokhamPairs];

  const patterns = JSON.parse(await fs.readFile(PATTERNS_FILE, "utf8"));
  const rules = JSON.parse(await fs.readFile(RULES_FILE, "utf8"));

  const before = patterns.patterns.length;
  patterns.patterns = (patterns.patterns || []).filter(
    (p) => p.source !== "gramatika-5-klass-2010" && !String(p.id || "").startsWith("gram5_")
  );
  const removed = before - patterns.patterns.length;

  const byKey = new Map();
  for (const p of patterns.patterns || []) {
    byKey.set(norm(p.ruPattern), p);
  }

  let patternsAdded = 0;
  let patternsSkipped = 0;
  for (const pair of allPairs) {
    const key = norm(pair.ru);
    if (byKey.has(key)) {
      patternsSkipped += 1;
      continue;
    }
    const pattern = {
      id: slugId("gram5", key),
      ruPattern: pair.ru,
      description: `Грамматика 5 кл. (${pair.kind || "paren"})`,
      slots: [],
      ingTemplate: pair.ing,
      priority: 96,
      source: "gramatika-5-klass-2010",
      examples: [{ ru: pair.ru, ing_expected: pair.ing }]
    };
    patterns.patterns.push(pattern);
    byKey.set(key, pattern);
    patternsAdded += 1;
  }

  const staticRules = buildStaticRules();
  const ruleIds = new Set((rules.rules || []).map((r) => r.id));
  let rulesAdded = 0;
  for (const rule of staticRules) {
    if (ruleIds.has(rule.id)) continue;
    rules.rules.push(rule);
    ruleIds.add(rule.id);
    rulesAdded += 1;
  }

  const corpusPairs = allPairs.filter((p) => isUsableRu(p.ru));
  const corpusDoc = {
    id: "gramatika_5_grammar_001",
    title: "Грамматика 5 класс (учебник)",
    level: "B1",
    genre: "lesson",
    source: "gramatika-5-klass-2010",
    paragraphs: buildCorpusParagraphs(sections, corpusPairs),
    glossary: staticRules.flatMap((r) => (r.markers || []).slice(0, 12))
  };

  const sectionsDoc = {
    source: "gramatika-5-klass-2010",
    title: "ГIалгIай метта грамматика, 5 класс",
    sections
  };

  if (!args.dryRun) {
    await fs.writeFile(SECTIONS_FILE, `${JSON.stringify(sectionsDoc, null, 2)}\n`, "utf8");
    await fs.writeFile(PATTERNS_FILE, `${JSON.stringify(patterns, null, 2)}\n`, "utf8");
    await fs.writeFile(RULES_FILE, `${JSON.stringify(rules, null, 2)}\n`, "utf8");
    await fs.writeFile(CORPUS_FILE, `${JSON.stringify(corpusDoc, null, 2)}\n`, "utf8");
  }

  process.stdout.write(
    `Text: ${textPath}\n` +
      `§ sections: ${sections.length}\n` +
      `Paren pairs: ${parenPairs.length}\n` +
      `Xьокхам pairs: ${xokhamPairs.length}\n` +
      `Old gram5 patterns removed: ${removed}\n` +
      `Patterns added: ${patternsAdded}\n` +
      `Patterns skipped (dup): ${patternsSkipped}\n` +
      `Rules added: ${rulesAdded}\n` +
      `Corpus paragraphs: ${corpusDoc.paragraphs.length}\n` +
      `Total patterns now: ${patterns.patterns.length}\n` +
      (args.dryRun ? "(dry-run, no files written)\n" : `Written:\n  ${SECTIONS_FILE}\n  ${CORPUS_FILE}\n`)
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
