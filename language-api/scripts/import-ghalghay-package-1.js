const fs = require("node:fs/promises");
const path = require("node:path");

const PACKAGE_SIZE = 500;
const PACKAGE_NOTE = "GHALGHAY package 1 (KUR05/KOD21, phrasebook batch)";

const CURATED_FILE = path.join(__dirname, "..", "data", "external", "ghalghay", "extracted", "lexemes_ghalghay_curated.json");
const LEXEMES_FILE = path.join(__dirname, "..", "data", "grammar", "lexemes.json");
const REGRESSION_FILE = path.join(__dirname, "..", "data", "regression-tests.json");
const MANIFEST_FILE = path.join(__dirname, "..", "data", "external", "ghalghay", "extracted", "package_1_manifest.json");

const ALLOWED_SOURCES = new Set(["ghalghay:kur05", "ghalghay:kod21"]);
const ALLOWED_POS = new Set(["noun", "verb", "adj", "adv"]);

const RU_BLOCKLIST = new Set([
  "нет", "да", "или", "и", "а", "о", "за", "в", "на", "к", "с", "у", "по", "от", "до", "из",
  "не", "ни", "но", "же", "ли", "бы", "то", "что", "как", "где", "кто", "чем", "для"
]);

const THEME_HINTS = [
  "дом", "комнат", "двер", "окн", "стол", "стул", "кров", "кухн", "улиц", "дорог", "город",
  "магаз", "рын", "деньг", "руб", "работ", "школ", "учит", "книг", "пис", "чит",
  "мать", "отец", "брат", "сестр", "сын", "доч", "семь", "муж", "жен", "друг", "сосед",
  "хлеб", "молок", "мяс", "суп", "чай", "коф", "вод", "соль", "сахар", "яблок", "карто",
  "бол", "лекар", "врач", "больн", "голов", "живот", "рук", "ног", "глаз", "ух", "зуб",
  "собак", "кош", "лошад", "коров", "овц", "коз", "кури", "птиц", "рыб",
  "день", "ноч", "утр", "вечер", "недел", "месяц", "год", "час", "минут",
  "больш", "мал", "хорош", "плох", "нов", "стар", "горяч", "холод", "быстр", "медлен",
  "идти", "ехать", "говор", "слуш", "смотр", "есть", "пить", "спать", "работ", "жить"
];

function normalizeRu(value) {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-zа-я0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCleanIng(base) {
  if (!base || base.length < 2 || base.length > 18) return false;
  if (/[|<>{}\\]/.test(base)) return false;
  if (/\s/.test(base)) return false;
  if (/^[a-z0-9._-]+$/i.test(base) && !/[а-я]/i.test(base)) return false;
  return true;
}

function isCleanRu(ru) {
  if (!ru || ru.length < 3 || ru.length > 22) return false;
  if (ru.split(" ").length !== 1) return false;
  if (!/^[а-яёА-ЯЁ-]+$/i.test(ru)) return false;
  if (RU_BLOCKLIST.has(normalizeRu(ru))) return false;
  if (/^\d/.test(ru)) return false;
  return true;
}

function scoreEntry(item, priorityWords) {
  const ruNorm = normalizeRu(item.ru);
  let score = 0;

  if (priorityWords.has(ruNorm)) score += 120;
  if (item.pos === "noun") score += 25;
  if (item.pos === "verb") score += 20;
  if (item.pos === "adj") score += 15;
  if (item.pos === "adv") score += 10;
  if (item.source === "ghalghay:kod21") score += 5;

  for (const hint of THEME_HINTS) {
    if (ruNorm.includes(hint)) {
      score += 12;
      break;
    }
  }

  if (ruNorm.length <= 8) score += 4;
  return score;
}

function pickBestCandidates(curated, knownRu) {
  const byRu = new Map();

  for (const item of curated) {
    if (!ALLOWED_SOURCES.has(item.source)) continue;
    if (item.confidence !== "high") continue;
    if (!ALLOWED_POS.has(item.pos)) continue;
    if (!isCleanRu(item.ru)) continue;
    if (!isCleanIng(item.forms?.base)) continue;

    const ruNorm = normalizeRu(item.ru);
    if (knownRu.has(ruNorm)) continue;

    const prev = byRu.get(ruNorm);
    if (!prev) {
      byRu.set(ruNorm, item);
      continue;
    }

    const rank = (x) => {
      let r = 0;
      if (x.source === "ghalghay:kod21") r += 2;
      if (x.pos === "noun") r += 1;
      return r;
    };
    if (rank(item) > rank(prev)) byRu.set(ruNorm, item);
  }

  return [...byRu.values()];
}

async function loadPriorityWords() {
  const regression = JSON.parse(await fs.readFile(REGRESSION_FILE, "utf8"));
  const items = Array.isArray(regression?.items) ? regression.items : [];
  const out = new Set();

  for (const item of items) {
    const ru = (item.ru || "").trim();
    if (!ru || ru.includes("?")) continue;
    if (ru.split(/\s+/).length !== 1) continue;
    out.add(normalizeRu(ru));
  }

  return out;
}

async function main() {
  const [curatedJson, lexJson, priorityWords] = await Promise.all([
    fs.readFile(CURATED_FILE, "utf8").then(JSON.parse),
    fs.readFile(LEXEMES_FILE, "utf8").then(JSON.parse),
    loadPriorityWords()
  ]);

  const existing = Array.isArray(lexJson?.lexemes) ? lexJson.lexemes : [];
  const kept = existing.filter((x) => !(x.notes || "").includes("GHALGHAY package 1"));
  const knownRu = new Set(kept.map((x) => normalizeRu(x.ru)));
  const curated = Array.isArray(curatedJson?.lexemes) ? curatedJson.lexemes : [];

  const candidates = pickBestCandidates(curated, knownRu)
    .map((item) => ({ item, score: scoreEntry(item, priorityWords) }))
    .sort((a, b) => b.score - a.score || a.item.ru.localeCompare(b.item.ru, "ru"));

  const selected = candidates.slice(0, PACKAGE_SIZE).map((x) => x.item);
  const added = selected.map((item) => ({
    ru: item.ru,
    pos: item.pos,
    forms: {
      base: item.forms.base,
      dat: item.forms.dat || item.forms.base
    },
    notes: `${PACKAGE_NOTE}; source=${item.source}`
  }));

  lexJson.lexemes = [...kept, ...added];
  await fs.writeFile(LEXEMES_FILE, JSON.stringify(lexJson, null, 2), "utf8");

  const manifest = {
    package: 1,
    added: added.length,
    totalLexemes: lexJson.lexemes.length,
    sources: ["kur05", "kod21"],
    priorityWordsUsed: priorityWords.size,
    topSamples: added.slice(0, 25).map((x) => ({ ru: x.ru, ing: x.forms.base, pos: x.pos })),
    scoreRange: candidates.length
      ? {
          max: candidates[0].score,
          minSelected: candidates[Math.min(PACKAGE_SIZE - 1, candidates.length - 1)]?.score ?? null
        }
      : null
  };

  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 1;
});
