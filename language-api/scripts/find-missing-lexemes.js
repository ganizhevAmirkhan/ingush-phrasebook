const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const LEXEMES_FILE = path.join(ROOT, "data", "grammar", "lexemes.json");
const PATTERNS_FILE = path.join(ROOT, "data", "grammar", "patterns.json");
const GHALGHAY_CURATED = path.join(ROOT, "data", "external", "ghalghay", "extracted", "lexemes_ghalghay_curated.json");
const OUT_FILE = path.join(ROOT, "data", "grammar", "lexeme-candidates.json");

const DOSH_URLS = [
  "https://dosh.inghub.ru/public/dictionary.json",
  "https://raw.githubusercontent.com/ganizhevAmirkhan/ingush-language/main/public/dictionary.json"
];

const RU_STOP = new Set([
  "я", "ты", "он", "она", "мы", "вы", "они", "мне", "тебе", "ему", "ей", "нам", "вам", "им",
  "мой", "твой", "его", "ее", "наш", "ваш", "их", "этот", "тот", "такой", "какой", "который",
  "не", "нет", "ни", "да", "или", "и", "а", "но", "же", "ли", "бы", "то", "что", "как", "где",
  "кто", "когда", "куда", "откуда", "почему", "сколько", "очень", "уже", "еще", "ещё", "тоже",
  "в", "на", "к", "с", "у", "о", "об", "за", "по", "от", "до", "из", "для", "при", "без", "через",
  "есть", "был", "была", "были", "будет", "можно", "нужно", "надо", "хочу", "хочет", "могу", "может"
]);

function normalizeRu(value) {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token) {
  let t = normalizeRu(token);
  if (!t || t.length < 2) return "";
  const endings = ["ами", "ями", "ого", "ему", "ому", "иях", "ах", "ях", "ов", "ев", "ом", "ам", "ям", "ы", "и", "а", "я", "у", "ю", "е"];
  if (t.length > 4) {
    for (const suffix of endings) {
      if (t.endsWith(suffix) && t.length - suffix.length >= 3) {
        t = t.slice(0, -suffix.length);
        break;
      }
    }
  }
  return t;
}

function pickIngBase(word) {
  const senses = Array.isArray(word?.senses) ? word.senses : [];
  const variants = senses
    .flatMap((s) => ((s?.ing || "").toString().split("*")))
    .map((x) => x.split("(")[0].replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return variants[0] || "";
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fetchDosh() {
  for (const url of DOSH_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const words = Array.isArray(json?.words) ? json.words : [];
      if (words.length) return words;
    } catch {
      // try next
    }
  }
  return [];
}

function lexemeKey(ru) {
  return normalizeRu(ru);
}

function buildKnownLexemeSet(lexemes) {
  const set = new Set();
  for (const lx of lexemes) {
    const k = lexemeKey(lx?.ru);
    if (k) set.add(k);
    for (const alt of lx?.aliases || []) {
      const ak = lexemeKey(alt);
      if (ak) set.add(ak);
    }
  }
  return set;
}

function wordsFromPatternExamples(patterns) {
  const hits = new Map();
  for (const pattern of patterns) {
    const examples = Array.isArray(pattern?.examples) ? pattern.examples : [];
    for (const ex of examples) {
      const ru = (ex?.ru || "").toString();
      if (!ru) continue;
      for (const token of normalizeRu(ru).split(" ")) {
        const stem = stemToken(token);
        if (!stem || stem.length < 2 || RU_STOP.has(stem)) continue;
        const prev = hits.get(stem) || { count: 0, patterns: new Set(), examples: [] };
        prev.count += 1;
        prev.patterns.add(pattern.id || pattern.ruPattern || "?");
        if (prev.examples.length < 3) prev.examples.push(ru);
        hits.set(stem, prev);
      }
    }
  }
  return hits;
}

function candidateFromDosh(word, reason, extra = {}) {
  const ru = (word?.ru || word?.lemma || "").toString().trim();
  const base = pickIngBase(word);
  if (!ru || !base) return null;
  const ruNorm = normalizeRu(ru);
  if (ruNorm.includes(" ") || RU_STOP.has(ruNorm)) return null;
  return {
    ru,
    pos: (word?.pos || "noun").toString().toLowerCase(),
    forms: { base },
    notes: reason,
    source: "dosh",
    ...extra
  };
}

async function main() {
  const applyLimit = Number(process.argv.find((a) => a.startsWith("--apply="))?.split("=")[1] || 0);

  const lexJson = await readJson(LEXEMES_FILE);
  const patJson = await readJson(PATTERNS_FILE);
  const lexemes = Array.isArray(lexJson?.lexemes) ? lexJson.lexemes : [];
  const patterns = Array.isArray(patJson?.patterns) ? patJson.patterns : [];
  const known = buildKnownLexemeSet(lexemes);

  const doshWords = await fetchDosh();
  const patternWordHits = wordsFromPatternExamples(patterns);

  const missingFromPatterns = [];
  for (const [stem, meta] of patternWordHits.entries()) {
    if (known.has(stem)) continue;
    missingFromPatterns.push({
      ru: stem,
      inExamples: meta.count,
      patterns: [...meta.patterns].slice(0, 5),
      sampleRu: meta.examples
    });
  }
  missingFromPatterns.sort((a, b) => b.inExamples - a.inExamples);

  const missingFromDosh = [];
  for (const word of doshWords) {
    const ru = (word?.ru || "").toString().trim();
    const ruNorm = normalizeRu(ru);
    if (!ruNorm || ruNorm.includes(" ") || RU_STOP.has(ruNorm)) continue;
    const stem = stemToken(ruNorm);
    if (!stem || known.has(stem) || known.has(ruNorm)) continue;
    const base = pickIngBase(word);
    if (!base) continue;
    missingFromDosh.push({
      ru,
      pos: (word?.pos || "noun").toString().toLowerCase(),
      forms: { base },
      source: "dosh"
    });
  }

  let missingFromGhalghay = [];
  try {
    const gh = await readJson(GHALGHAY_CURATED);
    const curated = Array.isArray(gh?.lexemes) ? gh.lexemes : [];
    missingFromGhalghay = curated.filter((lx) => {
      const k = lexemeKey(lx?.ru);
      return k && !known.has(k) && lx?.forms?.base;
    });
  } catch {
    // optional file
  }

  const mergedCandidates = new Map();
  for (const item of missingFromDosh) {
    mergedCandidates.set(lexemeKey(item.ru), { ...item, priority: 10, reason: "dosh_not_in_lexemes" });
  }
  for (const item of missingFromPatterns) {
    const key = lexemeKey(item.ru);
    const prev = mergedCandidates.get(key);
    mergedCandidates.set(key, {
      ru: item.ru,
      pos: prev?.pos || "noun",
      forms: prev?.forms || { base: "" },
      source: prev?.source || "pattern_gap",
      priority: (prev?.priority || 0) + item.inExamples * 5,
      reason: "used_in_pattern_examples",
      inExamples: item.inExamples,
      patterns: item.patterns,
      sampleRu: item.sampleRu,
      needsDoshLookup: !prev?.forms?.base
    });
  }
  for (const item of missingFromGhalghay.slice(0, 2000)) {
    const key = lexemeKey(item.ru);
    if (known.has(key) || mergedCandidates.has(key)) continue;
    mergedCandidates.set(key, {
      ru: item.ru,
      pos: item.pos || "noun",
      forms: item.forms,
      source: "ghalghay_curated",
      priority: 15,
      reason: "ghalghay_curated_not_merged"
    });
  }

  const ranked = [...mergedCandidates.values()]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const cand of ranked) {
    if (cand.needsDoshLookup && !cand.forms?.base) {
      const w = doshWords.find((d) => stemToken(d.ru) === lexemeKey(cand.ru) || normalizeRu(d.ru) === lexemeKey(cand.ru));
      if (w) {
        const base = pickIngBase(w);
        if (base) {
          cand.forms = { base };
          cand.pos = (w?.pos || cand.pos || "noun").toString().toLowerCase();
          cand.source = "dosh+pattern";
          delete cand.needsDoshLookup;
        }
      }
    }
  }

  const readyToImport = ranked.filter((c) => c.forms?.base && normalizeRu(c.ru) && !known.has(lexemeKey(c.ru)));

  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      lexemesNow: lexemes.length,
      patterns: patterns.length,
      doshWords: doshWords.length,
      missingInPatternExamples: missingFromPatterns.length,
      missingFromDosh: missingFromDosh.length,
      missingFromGhalghay: missingFromGhalghay.length,
      candidatesReady: readyToImport.length
    },
    topPatternGaps: missingFromPatterns.slice(0, 30),
    topCandidates: readyToImport.slice(0, 100)
  };

  await fs.writeFile(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("=== Поиск лексем ===");
  console.log(`Сейчас в lexemes.json: ${lexemes.length}`);
  console.log(`Шаблонов grammar: ${patterns.length}`);
  console.log(`Слов в dosh: ${doshWords.length}`);
  console.log(`—`);
  console.log(`Нет в лексемах, но есть в примерах шаблонов: ${missingFromPatterns.length}`);
  console.log(`Нет в лексемах, но есть в dosh: ${missingFromDosh.length}`);
  console.log(`Ещё не влиты из ghalghay curated: ${missingFromGhalghay.length}`);
  console.log(`Готовых кандидатов (с формой base): ${readyToImport.length}`);
  console.log(`Отчёт: ${OUT_FILE}`);
  console.log("\nТоп-15 для шаблонов:");
  for (const row of missingFromPatterns.slice(0, 15)) {
    console.log(`  ${row.ru}  (примеров: ${row.inExamples})`);
  }
  console.log("\nТоп-15 кандидатов из dosh:");
  for (const row of readyToImport.filter((c) => c.source === "dosh" || c.source === "dosh+pattern").slice(0, 15)) {
    console.log(`  ${row.ru} → ${row.forms.base}`);
  }

  if (applyLimit > 0) {
    const toAdd = readyToImport.slice(0, applyLimit).map((c) => ({
      ru: c.ru,
      pos: c.pos || "noun",
      forms: c.forms,
      notes: `auto-import ${c.reason || c.source}`
    }));
    const existingKeys = buildKnownLexemeSet(lexemes);
    const added = toAdd.filter((x) => !existingKeys.has(lexemeKey(x.ru)));
    lexJson.lexemes = [...lexemes, ...added].sort((a, b) => lexemeKey(a.ru).localeCompare(lexemeKey(b.ru), "ru"));
    await fs.writeFile(LEXEMES_FILE, `${JSON.stringify(lexJson, null, 2)}\n`, "utf8");
    console.log(`\n✓ Добавлено в lexemes.json: ${added.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
