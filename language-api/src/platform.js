const fs = require("node:fs/promises");
const https = require("node:https");
const path = require("node:path");
const {
  SOURCE,
  normalizeText,
  normalizePhraseKey,
  phraseLookupKeys,
  tokenizeRu,
  tokenLookupVariants,
  toWordRecord,
  toPhraseRecord,
  toColloquialPhraseRecord,
  toCorpusRecord
} = require("./schema");

const {
  callLlm,
  getLlmConfig,
  testLlmConnection,
  testGeminiConnection
} = require("./llm");

const { loadNounClassKnowledge } = require("./noun-classes");

const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const HABAR_ROOT = WORKSPACE_ROOT;

const CATEGORY_DIR = path.join(HABAR_ROOT, "categories");
const GITHUB_CATEGORIES_API =
  "https://api.github.com/repos/ganizhevAmirkhan/ingush-phrasebook/contents/categories?ref=main";
const PAYDADOSH_PHRASES_FILE = path.join(ROOT, "data", "colloquial", "paydadosh-phrases.json");
const ING_TERM_FILE = path.join(ROOT, "data", "dictionary", "ing-term-2016.json");
const { splitRuIngPairs } = require("./phrase-split");
const CORPUS_STORIES_DIR = path.join(ROOT, "data", "corpus", "stories");
const CORPUS_NOVELLAS_DIR = path.join(ROOT, "data", "corpus", "novellas");
const BLACKLIST_FILE = path.join(ROOT, "data", "blacklist.json");
const MODERATION_LOG = path.join(ROOT, "data", "moderation-queue.log.jsonl");
const GRAMMAR_DIR = path.join(ROOT, "data", "grammar");
const GRAMMAR_PATTERNS_FILE = path.join(GRAMMAR_DIR, "patterns.json");
const GRAMMAR_RULES_FILE = path.join(GRAMMAR_DIR, "rules.json");
const GRAMMAR_LEXEMES_FILE = path.join(GRAMMAR_DIR, "lexemes.json");
const GRAMMAR_DECLENSIONS_FILE = path.join(GRAMMAR_DIR, "declensions.json");

const DOSH_URLS = [
  "https://dosh.inghub.ru/public/dictionary.json",
  "https://raw.githubusercontent.com/ganizhevAmirkhan/ingush-language/main/public/dictionary.json"
];

const state = {
  words: [],
  phrases: [],
  corpus: [],
  blacklist: [],
  grammar: {
    patterns: [],
    rules: [],
    lexemes: [],
    declensions: []
  },
  nounClasses: null,
  moderationQueue: [],
  metrics: {
    lookupsWord: 0,
    lookupsPhrase: 0,
    lookupsCorpus: 0,
    translateTotal: 0,
    translateFromDosh: 0,
    translateFromGrammar: 0,
    translateFromPhrase: 0,
    translateFromPaydaDosh: 0,
    translateFromCorpus: 0,
    translateFromIngTerm: 0,
    translateFromLLM: 0,
    translateRejected: 0,
    nounClassAgreementFixes: 0
  },
  phraseIndex: new Map(),
  inventoryStats: {}
};

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function safeListJsonFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((x) => x.endsWith(".json")).map((x) => path.join(dir, x));
  } catch {
    return [];
  }
}

async function loadDictionary() {
  for (const url of DOSH_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      const words = Array.isArray(json?.words) ? json.words : [];
      if (!words.length) continue;
      return words.map(toWordRecord).filter((w) => w.ruNorm && w.ingVariants.length);
    } catch {
      // continue next source
    }
  }
  return [];
}

async function loadTermEntries() {
  try {
    const json = await readJson(ING_TERM_FILE);
    return Array.isArray(json?.items) ? json.items : [];
  } catch {
    return [];
  }
}

function termToWordRecord(item) {
  const ru = (item?.ru || "").toString().trim();
  const ing = (item?.ing || "").toString().trim();
  if (!ru || !ing) return null;
  return {
    id: (item?.id || "").toString(),
    ru,
    ruNorm: normalizeText(ru),
    ruTokens: tokenizeRu(ru),
    ingVariants: [ing],
    pos: "term",
    source: SOURCE.ING_TERM,
    confidence: Number(item?.confidence) || 0.88
  };
}

async function loadAllWords() {
  const [dosh, termItems] = await Promise.all([loadDictionary(), loadTermEntries()]);
  const byRu = new Map();
  for (const word of dosh) {
    if (word?.ruNorm) byRu.set(word.ruNorm, word);
  }
  for (const item of termItems) {
    const word = termToWordRecord(item);
    if (!word?.ruNorm || byRu.has(word.ruNorm)) continue;
    byRu.set(word.ruNorm, word);
  }
  return [...byRu.values()];
}

function termItemsToPhrases(termItems) {
  return termItems
    .map((item) =>
      toColloquialPhraseRecord(
        {
          id: item?.id,
          ru: item?.ru,
          ing: item?.ing,
          confidence: Number(item?.confidence) || 0.88
        },
        SOURCE.ING_TERM,
        "term"
      )
    )
    .filter((rec) => rec.ruNorm && rec.ing);
}

async function loadHabarPhrases() {
  const files = await safeListJsonFiles(CATEGORY_DIR);
  const out = [];
  for (const filePath of files) {
    try {
      const json = await readJson(filePath);
      const category = (json?.category || path.basename(filePath, ".json")).toString();
      const items = Array.isArray(json?.items) ? json.items : [];
      items.forEach((item) => {
        const rec = toColloquialPhraseRecord(item, SOURCE.HABAR, category);
        if (rec.ruNorm && rec.ing) out.push(rec);
      });
    } catch {
      // ignore bad file
    }
  }
  return out;
}

async function loadPaydaDoshPhrases() {
  try {
    const json = await readJson(PAYDADOSH_PHRASES_FILE);
    const items = Array.isArray(json?.items) ? json.items : [];
    return items
      .map((item) => toColloquialPhraseRecord(item, SOURCE.PAYDADOSH, item?.category || "paydadosh"))
      .filter((rec) => rec.ruNorm && rec.ing);
  } catch {
    return [];
  }
}

async function loadLessonColloquialPhrases() {
  const storyFiles = await safeListJsonFiles(CORPUS_STORIES_DIR);
  const out = [];
  for (const filePath of storyFiles) {
    try {
      const json = await readJson(filePath);
      const genre = (json?.genre || "").toString();
      if (genre !== "lesson" && genre !== "dialogue") continue;
      const category = path.basename(filePath, ".json");
      const paragraphs = Array.isArray(json?.paragraphs) ? json.paragraphs : [];
      paragraphs.forEach((paragraph, index) => {
        const pairs = splitRuIngPairs(paragraph?.ru, paragraph?.ing);
        pairs.forEach((pair, subIndex) => {
          out.push(
            toColloquialPhraseRecord(
              {
                id: `${category}_${index + 1}_${subIndex + 1}`,
                ru: pair.ru,
                ing: pair.ing,
                confidence: genre === "dialogue" ? 0.94 : 0.92
              },
              SOURCE.CORPUS,
              category
            )
          );
        });
      });
    } catch {
      // ignore bad file
    }
  }
  return out;
}

const PARALLEL_CORPUS_SPLIT_OPTS = { maxRuLen: 280, maxRuWords: 35 };

function isGhalghayParallelStory(doc) {
  const id = (doc?.id || "").toString();
  const genre = (doc?.genre || "").toString();
  return genre === "story" && id.startsWith("ghalghay_") && !/lesson/.test(id);
}

function isParallelTitlePair(ru) {
  const t = (ru || "").trim();
  if (!t || t.length > 120) return false;
  return /^(р\.|а\.?\s*с\.|и\.?\s*с\.|дж\.|слово о полку)/i.test(t);
}

function normalizeParallelRu(ru) {
  return (ru || "")
    .toString()
    .replace(/\s*\|\s*/g, " ")
    .replace(/¶/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadParallelCorpusPhrases() {
  const storyFiles = await safeListJsonFiles(CORPUS_STORIES_DIR);
  const out = [];
  for (const filePath of storyFiles) {
    try {
      const json = await readJson(filePath);
      if (!isGhalghayParallelStory(json)) continue;
      const category = json.id;
      const paragraphs = Array.isArray(json?.paragraphs) ? json.paragraphs : [];
      paragraphs.forEach((paragraph, index) => {
        const ruRaw = (paragraph?.ru || "").toString();
        const ingRaw = (paragraph?.ing || "").toString().trim();
        if (!ruRaw || !ingRaw || isParallelTitlePair(ruRaw)) return;

        const seen = new Set();
        let subIndex = 0;
        const pushPair = (ru, ing) => {
          const ruClean = normalizeParallelRu(ru);
          if (!ruClean || !ing) return;
          const key = normalizePhraseKey(ruClean);
          if (!key || seen.has(key)) return;
          seen.add(key);
          subIndex += 1;
          out.push(
            toColloquialPhraseRecord(
              {
                id: `${category}_${index + 1}_${subIndex}`,
                ru: ruClean,
                ing,
                confidence: 0.88
              },
              SOURCE.CORPUS,
              category
            )
          );
        };

        for (const pair of splitRuIngPairs(ruRaw, ingRaw, PARALLEL_CORPUS_SPLIT_OPTS)) {
          pushPair(pair.ru, pair.ing.trim());
        }
        pushPair(ruRaw, ingRaw);
      });
    } catch {
      // ignore bad file
    }
  }
  return out;
}

// Habar UI sends skipHabar:true to avoid circular lookup. Public /translate uses Habar by default.
// Set DISABLE_HABAR_IN_TRANSLATE=true on VPS only if you need to turn phrasebook off globally.
const DISABLE_HABAR_PHRASE_SOURCE =
  String(process.env.DISABLE_HABAR_IN_TRANSLATE ?? "false").toLowerCase() === "true";

const PHRASE_SOURCE_PRIORITY = {
  [SOURCE.HABAR]: 5,
  [SOURCE.PAYDADOSH]: 4,
  [SOURCE.ING_TERM]: 3.5,
  [SOURCE.CORPUS]: 2,
  [SOURCE.GRAMMAR]: 1
};

function mergePhraseRecords(items) {
  const byRu = new Map();
  for (const item of items) {
    if (!item?.ruNorm || !item?.ing) continue;
    const prev = byRu.get(item.ruNorm);
    if (!prev) {
      byRu.set(item.ruNorm, item);
      continue;
    }
    const prevPriority = PHRASE_SOURCE_PRIORITY[prev.source] || 0;
    const nextPriority = PHRASE_SOURCE_PRIORITY[item.source] || 0;
    if (nextPriority > prevPriority || (nextPriority === prevPriority && (item.confidence || 0) > (prev.confidence || 0))) {
      byRu.set(item.ruNorm, item);
    }
  }
  return [...byRu.values()];
}

function phrasesFromGrammarPatterns(patterns) {
  const out = [];
  const seen = new Set();
  for (const pattern of patterns || []) {
    const ing = (pattern?.ingTemplate || "").toString().trim();
    if (!ing || ing.includes("{")) continue;
    if (Array.isArray(pattern?.slots) && pattern.slots.length) continue;
    const ruCandidates = [
      pattern?.examples?.[0]?.ru,
      pattern?.ruPattern
    ]
      .map((x) => (x || "").toString().trim())
      .filter(Boolean)
      .filter((ru) => !ru.includes("{"));
    for (const ru of ruCandidates) {
      const key = normalizePhraseKey(ru);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const isHabar = (pattern?.id || "").startsWith("habar_");
      out.push(
        toColloquialPhraseRecord(
          {
            id: pattern.id,
            ru,
            ing,
            confidence: isHabar ? 0.99 : Number(pattern?.priority) >= 98 ? 0.95 : 0.88
          },
          SOURCE.GRAMMAR,
          isHabar ? "habar_pattern" : "grammar_pattern"
        )
      );
    }
  }
  return out;
}

function pickBetterPhrase(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  const prevPriority = PHRASE_SOURCE_PRIORITY[prev.source] || 0;
  const nextPriority = PHRASE_SOURCE_PRIORITY[next.source] || 0;
  if (nextPriority !== prevPriority) return nextPriority > prevPriority ? next : prev;
  return (next.confidence || 0) >= (prev.confidence || 0) ? next : prev;
}

function rebuildPhraseIndex() {
  const index = new Map();
  for (const phrase of state.phrases) {
    const keys = new Set([phrase.ruNorm, normalizePhraseKey(phrase.ru), ...phraseLookupKeys(phrase.ru)]);
    for (const key of keys) {
      if (!key) continue;
      index.set(key, pickBetterPhrase(index.get(key), phrase));
    }
  }
  state.phraseIndex = index;
}

async function loadPhrases() {
  const [habar, paydadosh, lessons, parallel, termItems] = await Promise.all([
    loadHabarPhrases(),
    loadPaydaDoshPhrases(),
    loadLessonColloquialPhrases(),
    loadParallelCorpusPhrases(),
    loadTermEntries()
  ]);
  const termPhrases = termItemsToPhrases(termItems);
  state.inventoryStats = {
    habarItemsRaw: habar.length,
    habarBasicRaw: habar.filter((p) => p.category === "basic_phrases").length,
    habarConversationRaw: habar.filter((p) => p.category === "conversation").length,
    paydadoshRaw: paydadosh.length,
    paydadoshEverydayRaw: paydadosh.filter((p) => p.category === "everyday_phrase").length,
    paydadoshLessonRaw: paydadosh.filter((p) => p.category === "lesson_phrase").length,
    corpusPhrasesRaw: lessons.length,
    parallelCorpusPhrasesRaw: parallel.length,
    ingTermRaw: termItems.length,
    ingTermPhrasesRaw: termPhrases.length
  };
  return mergePhraseRecords([...habar, ...termPhrases, ...lessons, ...parallel, ...paydadosh]);
}

async function loadCorpus() {
  const storyFiles = await safeListJsonFiles(CORPUS_STORIES_DIR);
  const novellaFiles = await safeListJsonFiles(CORPUS_NOVELLAS_DIR);

  const out = [];
  for (const filePath of storyFiles) {
    try {
      const json = await readJson(filePath);
      out.push(toCorpusRecord(json, "story"));
    } catch {
      // ignore
    }
  }
  for (const filePath of novellaFiles) {
    try {
      const json = await readJson(filePath);
      out.push(toCorpusRecord(json, "novella"));
    } catch {
      // ignore
    }
  }
  return out.filter((x) => x.id && x.title);
}

async function loadBlacklist() {
  const protectedTerms = new Set([
    "ву", "vu", "ду", "du", "со", "so", "sa", "из", "iz", "ha", "ха"
  ]);
  try {
    const json = await readJson(BLACKLIST_FILE);
    const raw = Array.isArray(json?.blocked) ? json.blocked : [];
    return [...new Set(raw.map((x) => normalizeText(x)).filter(Boolean))]
      .filter((t) => !protectedTerms.has(t));
  } catch {
    return [];
  }
}

async function loadGrammarFile(filePath, key) {
  try {
    const json = await readJson(filePath);
    const arr = Array.isArray(json?.[key]) ? json[key] : [];
    return arr;
  } catch {
    return [];
  }
}

async function loadGrammarData() {
  const [patterns, rules, lexemes, declensions] = await Promise.all([
    loadGrammarFile(GRAMMAR_PATTERNS_FILE, "patterns"),
    loadGrammarFile(GRAMMAR_RULES_FILE, "rules"),
    loadGrammarFile(GRAMMAR_LEXEMES_FILE, "lexemes"),
    loadGrammarFile(GRAMMAR_DECLENSIONS_FILE, "declensions")
  ]);
  return { patterns, rules, lexemes, declensions };
}

function findWordExact(ruText) {
  const norm = normalizeText(ruText);
  if (!norm) return null;
  return state.words.find((w) => w.ruNorm === norm) || null;
}

function scoreWordForTokenMatch(word, variant, allTokens, tokenIndex) {
  let score = 0;
  if (word.ruNorm === variant) score += 120;
  if (Array.isArray(word.ruTokens) && word.ruTokens.includes(variant)) score += 80;
  score -= Math.min((word.ruNorm || "").length, 40);

  const neighbor = `${allTokens[tokenIndex + 1] || ""} ${allTokens[tokenIndex - 1] || ""}`.toLowerCase();
  const ru = (word.ruNorm || "").toLowerCase();
  if (ru.includes("о животном") && /живот|звер|скот|кот|соб|птиц|акха/.test(neighbor)) score += 45;
  if (ru.includes("о растени") && /растен|цвет|дерев|трав|плод|фрукт/.test(neighbor)) score += 45;
  return score;
}

function findWordForToken(token, context = {}) {
  if (!token) return null;
  const { allTokens = [], tokenIndex = 0 } = context;
  const variants = tokenLookupVariants(token);
  let best = null;
  let bestScore = -1;

  for (const variant of variants) {
    const exact = state.words.find((w) => w.ruNorm === variant);
    if (exact) {
      const score = scoreWordForTokenMatch(exact, variant, allTokens, tokenIndex) + 10;
      if (score > bestScore) {
        best = exact;
        bestScore = score;
      }
    }

    const byToken = state.words.filter((w) => {
      if (!Array.isArray(w.ruTokens) || !w.ruTokens.includes(variant)) return false;
      if (variant.length < 5) return w.ruNorm === variant;
      return true;
    });
    for (const word of byToken) {
      const score = scoreWordForTokenMatch(word, variant, allTokens, tokenIndex);
      if (score > bestScore) {
        best = word;
        bestScore = score;
      }
    }
  }

  if (best) return best;

  if (token.length >= 5) {
    let fuzzyBest = null;
    let fuzzyScore = -1;
    for (const word of state.words) {
      const candidates = new Set([
        (word.ruNorm || "").split(" ")[0],
        ...(word.ruTokens || [])
      ]);
      for (const candidate of candidates) {
        if (!candidate || candidate.length < 4) continue;
        if (Math.abs(candidate.length - token.length) > 1) continue;
        if (levenshteinAtMost(token, candidate, 1) > 1) continue;
        const score = scoreWordForTokenMatch(word, candidate, allTokens, tokenIndex);
        if (score > fuzzyScore) {
          fuzzyScore = score;
          fuzzyBest = word;
        }
      }
    }
    if (fuzzyBest) return fuzzyBest;
  }

  return null;
}

function pickBaseVariantFromWord(word) {
  const variants = Array.isArray(word?.ingVariants) ? word.ingVariants : [];
  if (!variants.length) return "";

  const ruNorm = (word?.ruNorm || "").toString();
  if (/^ближайш/i.test(ruNorm) || (variants.length > 1 && variants.every((v) => /^эггара\s/i.test(v)))) {
    const spatial = variants.find((v) => /гарг/i.test(v));
    if (spatial) {
      return spatial
        .split(/\*/)[0]
        .trim()
        .split(/\(/)[0]
        .trim();
    }
  }

  // Prefer shortest compact variant, then keep only first lexical part.
  const sorted = [...variants].sort((a, b) => a.length - b.length);
  const raw = sorted[0] || "";
  return raw
    .split(/[\/,;]+/)[0]
    .trim()
    .split(/\s+/)[0]
    .trim();
}

function buildPatternRegex(ruPattern) {
  const source = (ruPattern || "").toString().trim();
  if (!source) return null;

  const parts = source.split(/(\{[A-Za-z0-9_]+\})/).filter(Boolean);
  const slotNames = [];
  const reParts = parts.map((part) => {
    const slotMatch = part.match(/^\{([A-Za-z0-9_]+)\}$/);
    if (slotMatch) {
      slotNames.push(slotMatch[1]);
      return "(.+?)";
    }
    const escaped = normalizeText(part).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(/\s+/g, "\\s+");
  });
  if (!reParts.length) return null;
  return {
    regex: new RegExp(`^${reParts.join("")}$`, "i"),
    slotNames
  };
}

function findGrammarLexeme(ruText) {
  const norm = normalizeText(ruText);
  if (!norm) return null;
  const exact = state.grammar.lexemes.find((x) => normalizeText(x?.ru) === norm) || null;
  if (exact) return exact;

  const targetTokens = tokenizeRu(ruText);
  if (!targetTokens.length) return null;
  if (targetTokens.length === 1) {
    const token = targetTokens[0];
    const tokenStem = token.length > 3 ? token.replace(/[аеиоуыяю]$/i, "") : token;
    const candidates = state.grammar.lexemes.filter((x) => {
      const lt = tokenizeRu(x?.ru || "");
      return lt.some((t) => {
        const tStem = t.length > 3 ? t.replace(/[аеиоуыяю]$/i, "") : t;
        if (t === token) return true;
        if (t.length >= 4 && t.startsWith(token)) return true;
        if (token.length >= 4 && t.length >= 3 && token.startsWith(t)) return true;
        return Boolean(tokenStem && tStem && tokenStem.length >= 4 && tokenStem === tStem);
      });
    });
    if (!candidates.length) return null;
    const scoreLexeme = (lex) => {
      let score = 0;
      const ruNorm = normalizeText(lex?.ru || "");
      const pos = (lex?.pos || "").toString().toLowerCase();
      if (ruNorm === norm) score += 200;
      if (pos === "noun") score += 40;
      if (pos === "verb") score += 10;
      if (pos === "phrase" || pos === "adverb") score -= 25;
      if ((lex?.ru || "").includes(" ")) score -= 15;
      if (ruNorm.startsWith("на ") || ruNorm.startsWith("в ") || ruNorm.startsWith("к ")) score -= 20;
      return score;
    };
    candidates.sort((a, b) => scoreLexeme(b) - scoreLexeme(a));
    return candidates[0];
  }
  return null;
}

function getTargetFormForCase(requiredCase) {
  const rc = (requiredCase || "base").toString().toLowerCase();
  const rule = state.grammar.rules.find((r) =>
    r?.type === "slot_transform"
    && r?.apply === "use_lexeme_form"
    && (r?.when?.requiredCase || "").toString().toLowerCase() === rc
  );
  const byRule = (rule?.targetForm || "").toString().toLowerCase().trim();
  return byRule || "base";
}

function wantVerbForLexeme(lexeme) {
  const g = (lexeme?.gender || "").toString().toLowerCase();
  if (g === "f" || g === "fem" || g === "female") return "еза";
  return "деза";
}

function resolveSlotForms(slotRu) {
  const slotText = (slotRu || "").toString().trim();
  if (!slotText) return { base: "", dat: "", goal: "", want: "деза" };

  const lexeme = findGrammarLexeme(slotText);
  if (lexeme?.forms) {
    const out = {};
    for (const [k, v] of Object.entries(lexeme.forms || {})) {
      out[k.toLowerCase()] = (v || "").toString().trim();
    }
    out.base = out.base || "";
    out.dat = out.dat || out.base;
    out.goal = out.goal || out.dat || out.base;
    out.want = wantVerbForLexeme(lexeme);
    attachNounClassToForms(out, slotText, out.base);
    return out;
  }

  const tokens = tokenizeRu(slotText);
  if (tokens.length === 1) {
    const w = findWordForToken(tokens[0]);
    const base = pickBaseVariantFromWord(w);
    const out = { base, dat: base, goal: base, want: "деза" };
    attachNounClassToForms(out, slotText, base);
    return out;
  }

  const composed = composeFromDictionaryTokens(slotText);
  if (composed.ok) {
    const out = { base: composed.translation, dat: composed.translation, goal: composed.translation, want: "деза" };
    attachNounClassToForms(out, slotText, composed.translation);
    return out;
  }

  return { base: "", dat: "", goal: "", want: "деза" };
}

function attachNounClassToForms(forms, ruHint, ingHint) {
  const nc = state.nounClasses;
  if (!nc) return;
  const resolved = nc.getMarkerFor(ruHint, { preferRu: true, ingForm: ingHint || forms.base });
  if (!resolved?.copula) return;
  const verified = /verified/.test(resolved.entry?.reviewStatus || "");
  if (verified && resolved.entry?.ing) {
    forms.base = resolved.entry.ing;
    if (!forms.dat || forms.dat === ingHint) forms.dat = resolved.entry.ing;
  }
  forms.nounClass = resolved.marker;
  forms.copula = resolved.copula.pair;
  forms.classMarker = resolved.copula.marker;
  forms.nounClassRuleIds = resolved.ruleIds;
}

function fillIngTemplate(template, slotValues) {
  let out = (template || "").toString();
  for (const [slotName, forms] of Object.entries(slotValues || {})) {
    const base = (forms?.base || "").toString().trim();
    const dat = (forms?.dat || base).toString().trim();
    const selected = (forms?.selected || base).toString().trim();

    for (const [formKey, formValue] of Object.entries(forms || {})) {
      if (formKey === "selected") continue;
      const val = (formValue || "").toString().trim();
      if (!val) continue;
      out = out.replace(new RegExp(`\\{${slotName}_${formKey.toUpperCase()}\\}`, "g"), val);
    }

    out = out
      .replace(new RegExp(`\\{${slotName}_BASE\\}`, "g"), base)
      .replace(new RegExp(`\\{${slotName}_DAT\\}`, "g"), dat)
      .replace(new RegExp(`\\{${slotName}_COPULA\\}`, "g"), (forms?.copula || "").toString())
      .replace(new RegExp(`\\{${slotName}_CLASS\\}`, "g"), (forms?.classMarker || "").toString())
      .replace(new RegExp(`\\{${slotName}\\}`, "g"), selected);
  }
  return out.replace(/\s+/g, " ").trim();
}

function tryGrammarPatternTranslate(ruText) {
  const ruNorm = normalizeText(ruText);
  if (!ruNorm) return { ok: false, translation: "" };

  const patterns = [...state.grammar.patterns]
    .sort((a, b) => Number(b?.priority || 0) - Number(a?.priority || 0));

  const isQuestionInput = (() => {
    const src = (ruText || "").toString().trim().toLowerCase();
    if (!src) return false;
    if (/[?？]\s*$/.test(src)) return true;
    const first = normalizeText(src).split(" ")[0] || "";
    const qWords = new Set([
      "кто", "что", "какой", "когда", "где", "куда", "почему", "кому", "сколько", "как", "откуда"
    ]);
    return qWords.has(first);
  })();

  const isNegationInput = (() => {
    const src = ` ${normalizeText(ruText)} `;
    if (!src.trim()) return false;
    const markers = [" не ", " нет ", " никто ", " ничто ", " ничего ", " никогда "];
    return markers.some((m) => src.includes(m));
  })();

  const isQuestionPattern = (pattern) => {
    const ruPattern = normalizeText(pattern?.ruPattern || "");
    const ingTemplate = (pattern?.ingTemplate || "").toString();
    if (ingTemplate.includes("?")) return true;
    const first = ruPattern.split(" ")[0] || "";
    const qWords = new Set([
      "кто", "что", "какой", "когда", "где", "куда", "почему", "кому", "сколько", "как", "откуда"
    ]);
    return qWords.has(first);
  };

  const isNegationPattern = (pattern) => {
    const ruPattern = ` ${normalizeText(pattern?.ruPattern || "")} `;
    const ingTemplate = ` ${(pattern?.ingTemplate || "").toString().toLowerCase()} `;
    const markersRu = [" не ", " нет ", " никто ", " ничто ", " ничего "];
    const markersIng = [" ма ", "а,", "ац", "цар", "цхьаккха", "хiамма", "хIамма"];
    return markersRu.some((m) => ruPattern.includes(m)) || markersIng.some((m) => ingTemplate.includes(m));
  };

  const ordered = (() => {
    if (isQuestionInput) {
      return [
        ...patterns.filter((p) => isQuestionPattern(p)),
        ...patterns.filter((p) => !isQuestionPattern(p))
      ];
    }
    if (isNegationInput) {
      return [
        ...patterns.filter((p) => isNegationPattern(p)),
        ...patterns.filter((p) => !isNegationPattern(p))
      ];
    }
    return patterns;
  })();

  for (const pattern of ordered) {
    const parsed = buildPatternRegex(pattern?.ruPattern || "");
    if (!parsed) continue;

    const match = ruNorm.match(parsed.regex);
    if (!match) continue;

    const slotValues = {};
    let failed = false;
    for (let i = 0; i < parsed.slotNames.length; i += 1) {
      const slotName = parsed.slotNames[i];
      const slotRu = (match[i + 1] || "").trim();
      const forms = resolveSlotForms(slotRu);
      if (!forms.base) {
        failed = true;
        break;
      }
      const slotSpec = Array.isArray(pattern?.slots)
        ? pattern.slots.find((s) => (s?.name || "") === slotName)
        : null;
      const targetForm = getTargetFormForCase(slotSpec?.requiredCase || "base");
      slotValues[slotName] = {
        ...forms,
        selected: targetForm === "dat" ? (forms.dat || forms.base) : forms.base
      };
    }
    if (failed) continue;

    const translation = fillIngTemplate(pattern?.ingTemplate || "", slotValues);
    if (!translation) continue;

    return {
      ok: true,
      translation,
      patternId: (pattern?.id || "").toString()
    };
  }
  return { ok: false, translation: "" };
}

function applyNounClassAgreementToResult(translation, ruHint = "") {
  const nc = state.nounClasses;
  if (!nc || !translation) return { translation, nounClass: null };

  const hints = {};
  if (ruHint) {
    const tokens = tokenizeRu(ruHint);
    if (tokens.length === 1) hints.subjectRu = ruHint.trim();
  }

  const fixed = nc.applyCopulaAgreement(translation, hints);
  if (fixed.changed) state.metrics.nounClassAgreementFixes += 1;
  return {
    translation: fixed.text,
    nounClass: fixed.changed || fixed.entry
      ? {
          applied: fixed.changed,
          subjectIng: fixed.subjectIng || null,
          marker: fixed.marker || null,
          previousMarker: fixed.previousMarker || null,
          ruleIds: fixed.ruleIds || [],
          entryId: fixed.entry?.id || null
        }
      : null
  };
}

function grammarTranslateResult(translation, ruHint = "", extra = {}) {
  state.metrics.translateFromGrammar += 1;
  const agreed = applyNounClassAgreementToResult(translation, ruHint);
  return {
    ok: true,
    translation: agreed.translation,
    usedSource: SOURCE.GRAMMAR,
    confidence: extra.confidence ?? 0.9,
    fallbackUsed: extra.fallbackUsed ?? false,
    patternId: extra.patternId,
    nounClass: agreed.nounClass
  };
}

const NEED_INFINITIVE_VERB_DOSH = {
  "идти": "даваха",
  "сказать": "ала",
  "поговорить": "къамаьл ду",
  "спать": "наб",
  "пить": "мала"
};

const PAST_WANT_EXACT = {
  "я хотел сказать": "Со ала валлар",
  "я хотела сказать": "Со ала валлар",
  "мне хотелось сказать": "Сона ала валлар"
};

const WANT_INFINITIVE_EXACT = {
  "я хочу сказать": "Со ала безам ба",
  "я хочу пить": "Со мал безам ба",
  "я хочу спать": "Са наб е безам ба",
  "я хочу есть": "Са безам ба яаахьам яаа",
  "хочу есть": "Са безам ба яаахьам яаа"
};

function lookupDoshInfinitive(ruVerb) {
  const norm = normalizeText(ruVerb);
  if (!norm) return "";
  if (NEED_INFINITIVE_VERB_DOSH[norm]) {
    return NEED_INFINITIVE_VERB_DOSH[norm];
  }

  const word = findWordExact(ruVerb) || findWordForToken(norm);
  if (!word) return "";

  const variants = Array.isArray(word.ingVariants) ? word.ingVariants : [];
  const expanded = variants
    .flatMap((raw) => (raw ?? "").toString().split("*"))
    .map((part) => part.split("(")[0].replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const motion = expanded.find((v) => /вах/i.test(v));
  if (motion) return motion;

  return pickBaseVariantFromWord(word);
}

function tryComposeNeedInfinitive(ruText) {
  const norm = normalizeText(ruText).replace(/[!?.…]+$/g, "").trim();

  if (norm === "мне нужно идти") {
    return { ok: true, translation: "Са давах вез" };
  }

  const match = norm.match(/^мне надо (.+)$/);
  if (!match) {
    return { ok: false, translation: "" };
  }

  const verbRu = match[1].trim();
  const verbIng = lookupDoshInfinitive(verbRu);
  if (!verbIng) {
    return { ok: false, translation: "" };
  }

  return { ok: true, translation: `Са веза ${verbIng}` };
}

function tryComposePastWantInfinitive(ruText) {
  const norm = normalizeText(ruText).replace(/[!?.…]+$/g, "").trim();
  if (PAST_WANT_EXACT[norm]) {
    return { ok: true, translation: PAST_WANT_EXACT[norm] };
  }

  let subject = "Со";
  let match = norm.match(/^я\s+хотел[а]?\s+(.+)$/);
  if (!match) {
    match = norm.match(/^мне\s+хотелось\s+(.+)$/);
    if (match) subject = "Сона";
  }
  if (!match) {
    return { ok: false, translation: "" };
  }

  const verbRu = match[1].trim();
  const verbIng = lookupDoshInfinitive(verbRu);
  if (!verbIng || verbIng.length > 35) {
    return { ok: false, translation: "" };
  }

  return { ok: true, translation: `${subject} ${verbIng} валлар` };
}

function tryComposeWantInfinitive(ruText) {
  const norm = normalizeText(ruText).replace(/[!?.…]+$/g, "").trim();
  if (WANT_INFINITIVE_EXACT[norm]) {
    return { ok: true, translation: WANT_INFINITIVE_EXACT[norm] };
  }

  const match = norm.match(/^я\s+хочу\s+(.+)$/);
  if (!match) {
    return { ok: false, translation: "" };
  }

  const verbRu = match[1].trim();
  const verbIng = lookupDoshInfinitive(verbRu);
  if (!verbIng || verbIng.length > 35) {
    return { ok: false, translation: "" };
  }

  return { ok: true, translation: `Со ${verbIng} безам ба` };
}

const CANNOT_INFINITIVE_DOSH = {
  "дышать": "Суна са дах могац"
};

// Locative presence / activity at home (ва/бу copula markers must not be dropped).
const AT_HOME_PHRASES_DOSH = {
  "я дома": "Со ц1ага ва",
  "я дома работаю": "Аз ц1г1а болх бу"
};

function tryComposeAtHomePhrase(ruText) {
  const norm = normalizeText(ruText).replace(/[!?.…]+$/g, "").trim();
  const translation = AT_HOME_PHRASES_DOSH[norm];
  if (!translation) {
    return { ok: false, translation: "" };
  }
  return { ok: true, translation };
}

function tryComposeCannotInfinitive(ruText) {
  const norm = normalizeText(ruText).replace(/[!?.…]+$/g, "").trim();
  const match = norm.match(/^я не могу (.+)$/);
  if (!match) {
    return { ok: false, translation: "" };
  }

  const verbRu = match[1].trim();
  const translation = CANNOT_INFINITIVE_DOSH[verbRu];
  if (!translation) {
    return { ok: false, translation: "" };
  }

  return { ok: true, translation };
}

const RU_GLUE_STOPWORDS = new Set([
  "я", "ты", "он", "она", "мы", "вы", "они",
  "в", "на", "к", "с", "по", "из", "у", "за", "о", "об", "от", "до", "при", "без", "для",
  "и", "а", "но", "что", "как", "это", "то", "не", "ни"
]);

function composeFromDictionaryTokens(ruText) {
  const atHome = tryComposeAtHomePhrase(ruText);
  if (atHome.ok) {
    return atHome;
  }

  const pastWant = tryComposePastWantInfinitive(ruText);
  if (pastWant.ok) {
    return pastWant;
  }

  const wantInf = tryComposeWantInfinitive(ruText);
  if (wantInf.ok) {
    return wantInf;
  }

  const needInf = tryComposeNeedInfinitive(ruText);
  if (needInf.ok) {
    return needInf;
  }

  const cannotInf = tryComposeCannotInfinitive(ruText);
  if (cannotInf.ok) {
    return cannotInf;
  }

  const tokens = normalizeText(ruText).split(" ").filter(Boolean);
  // Не склеивать «я иду в магазин» → az se =a тика — только отдельные слова без предлогов
  if (tokens.length > 3 || tokens.some((t) => RU_GLUE_STOPWORDS.has(t))) {
    return { ok: false, translation: "", covered: 0, total: tokens.length };
  }

  if (!tokens.length || tokens.length < 2) {
    return { ok: false, translation: "", covered: 0, total: tokens.length };
  }

  const ingTokens = [];
  let covered = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const word = findWordForToken(token, { allTokens: tokens, tokenIndex: i });
    const firstVariant = pickBaseVariantFromWord(word);
    if (!firstVariant) continue;
    covered += 1;
    ingTokens.push(firstVariant);
  }

  if (!ingTokens.length) {
    return { ok: false, translation: "", covered, total: tokens.length };
  }

  // Require near-full coverage to avoid random partial output.
  const coverage = covered / tokens.length;
  if (coverage < 0.8) {
    return { ok: false, translation: "", covered, total: tokens.length };
  }

  return {
    ok: true,
    translation: ingTokens.join(" ").replace(/\s+/g, " ").trim(),
    covered,
    total: tokens.length
  };
}

function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let intersection = 0;
  for (const token of aSet) if (bSet.has(token)) intersection += 1;
  const union = aSet.size + bSet.size - intersection;
  return union ? intersection / union : 0;
}

function phraseSourceAllowed(phrase, exclude) {
  return phrase && !exclude.has((phrase.source || "").toLowerCase());
}

function findPhraseExact(ruText, options = {}) {
  const exclude = new Set((options.excludeSources || []).map((s) => s.toLowerCase()));
  let best = null;
  for (const key of phraseLookupKeys(ruText)) {
    const hit = state.phraseIndex.get(key);
    if (!phraseSourceAllowed(hit, exclude)) continue;
    best = pickBetterPhrase(best, hit);
  }
  return best;
}

function findPhraseBest(ruText, options = {}) {
  const exclude = new Set((options.excludeSources || []).map((s) => s.toLowerCase()));
  const exact = findPhraseExact(ruText, options);
  if (exact) return exact;

  const phrases = exclude.size
    ? state.phrases.filter((phrase) => !exclude.has((phrase.source || "").toLowerCase()))
    : state.phrases;

  const norm = normalizePhraseKey(ruText);
  if (!norm) return null;

  const target = new Set(tokenizeRu(ruText));
  if (!target.size) return null;

  let best = null;
  let bestScore = 0;
  for (const phrase of phrases) {
    if (!phrase.ruTokens.length) continue;
    const score = jaccard(target, new Set(phrase.ruTokens));
    if (score > bestScore) {
      best = phrase;
      bestScore = score;
    } else if (score === bestScore && best && score > 0) {
      best = pickBetterPhrase(best, phrase);
    }
  }
  if (bestScore >= 0.75) return best;

  // Короткие фразы: те же слова, другой порядок / лишний «!»
  if (target.size <= 6) {
    const targetKey = [...target].sort().join("|");
    let tokenBest = null;
    for (const phrase of phrases) {
      if (!phrase.ruTokens.length || phrase.ruTokens.length !== target.size) continue;
      const phraseKey = [...new Set(phrase.ruTokens)].sort().join("|");
      if (phraseKey === targetKey) {
        tokenBest = pickBetterPhrase(tokenBest, phrase);
      }
    }
    if (tokenBest) return tokenBest;
  }

  return null;
}

function phraseTranslateResult(phrase) {
  if (phrase.source === SOURCE.PAYDADOSH) state.metrics.translateFromPaydaDosh += 1;
  else if (phrase.source === SOURCE.CORPUS) state.metrics.translateFromCorpus += 1;
  else if (phrase.source === SOURCE.ING_TERM) state.metrics.translateFromIngTerm += 1;
  else if (phrase.source === SOURCE.GRAMMAR) state.metrics.translateFromGrammar += 1;
  else state.metrics.translateFromPhrase += 1;
  const usedSource =
    phrase.source === SOURCE.PAYDADOSH
      ? SOURCE.PAYDADOSH
      : phrase.source === SOURCE.CORPUS
        ? SOURCE.CORPUS
        : phrase.source === SOURCE.ING_TERM
          ? SOURCE.ING_TERM
          : phrase.source === SOURCE.GRAMMAR
            ? SOURCE.GRAMMAR
            : SOURCE.HABAR;
  return {
    ok: true,
    translation: phrase.ing,
    usedSource,
    confidence: phrase.confidence,
    fallbackUsed: false
  };
}

function buildDictionaryHints(ruText, limit = 12) {
  const tokens = [...new Set(tokenizeRu(ruText))];
  if (!tokens.length) return [];
  const hints = [];
  for (const word of state.words) {
    if (!word.ruTokens.length) continue;
    const intersects = word.ruTokens.some((t) => tokens.includes(t));
    if (!intersects) continue;
    hints.push(`${word.ru} -> ${word.ingVariants.join(" / ")}`);
    if (hints.length >= limit) break;
  }
  return hints;
}

function findPhrasePronByIng(ingText) {
  const target = normalizeText(ingText);
  if (!target) return "";
  const hit = state.phrases.find((p) => normalizeText(p.ing) === target && p.pron);
  return (hit?.pron || "").toString().trim();
}

function transliterateIngushToPron(ingText) {
  const src = (ingText || "").toString().trim();
  if (!src) return "";

  // Если текст уже латиницей, просто нормализуем пробелы.
  if (/^[a-z0-9\s'`".,!?;:()\-]+$/i.test(src)) {
    return src.replace(/\s+/g, " ").trim().toLowerCase();
  }

  let t = src.toLowerCase();

  const multi = [
    [/кх/g, "kh"],
    [/къ/g, "k'"],
    [/к1/g, "k1"],
    [/г1/g, "g1"],
    [/х1/g, "h1"],
    [/ц1/g, "ts1"],
    [/ч1/g, "ch1"],
    [/ш1/g, "sh1"],
    [/т1/g, "t1"],
    [/п1/g, "p1"],
    [/б1/g, "b1"],
    [/д1/g, "d1"],
    [/ж1/g, "zh1"],
    [/гӀ/g, "gh1"],
    [/гӏ/g, "gh1"],
    [/хь/g, "h'"],
    [/аъ/g, "a'"],
    [/оъ/g, "o'"],
    [/уъ/g, "u'"],
    [/еъ/g, "e'"],
    [/иъ/g, "i'"],
    [/яъ/g, "ya'"],
    [/юъ/g, "yu'"]
  ];
  for (const [re, to] of multi) t = t.replace(re, to);

  const single = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "Ӏ": "1", "ӏ": "1", "і": "1", "1": "1"
  };

  let out = "";
  for (const ch of t) {
    out += Object.prototype.hasOwnProperty.call(single, ch) ? single[ch] : ch;
  }
  return out.replace(/\s+/g, " ").trim().toLowerCase();
}

function ingContainsBlockedForm(ingNorm, blocked) {
  if (!blocked) return false;
  const b = normalizeText(blocked);
  if (!b) return false;
  const tokens = ingNorm.split(/\s+/).filter(Boolean);
  // Только целое слово/фраза — иначе режет ингушское «хьога», «хьоб» из‑за «хьоь» в списке
  if (b.includes(" ")) return ingNorm.includes(b);
  return tokens.includes(b);
}

const COMMON_RU_TYPOS = {
  чпать: "спать",
  спаь: "спать",
  пит: "пить",
  кушаь: "кушать"
};

function fixCommonRuTypos(ruText) {
  const words = normalizeText(ruText).split(" ").filter(Boolean);
  if (!words.length) return "";
  const fixed = words.map((w) => COMMON_RU_TYPOS[w] || w);
  if (fixed.join(" ") === words.join(" ")) return "";
  return fixed.join(" ");
}

function levenshteinAtMost(a, b, maxDist) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > maxDist) return maxDist + 1;
  }
  return dp[a.length][b.length];
}

function findPhraseNearTypo(ruText, options = {}) {
  const exclude = new Set((options.excludeSources || []).map((s) => s.toLowerCase()));
  const words = normalizePhraseKey(ruText).split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;

  let best = null;
  let bestEdits = 99;
  for (const [key, phrase] of state.phraseIndex) {
    if (!phraseSourceAllowed(phrase, exclude)) continue;
    const keyWords = key.split(" ").filter(Boolean);
    if (keyWords.length !== words.length) continue;
    let edits = 0;
    for (let i = 0; i < words.length; i += 1) {
      if (words[i] === keyWords[i]) continue;
      if (levenshteinAtMost(words[i], keyWords[i], 1) <= 1) edits += 1;
      else {
        edits = 99;
        break;
      }
    }
    if (edits > 0 && edits < bestEdits) {
      bestEdits = edits;
      best = phrase;
    }
  }
  return bestEdits <= 2 ? best : null;
}

function findPhraseBagMatch(ruText, options = {}) {
  const exclude = new Set((options.excludeSources || []).map((s) => s.toLowerCase()));
  const words = normalizePhraseKey(ruText).split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 8) return null;

  const targetKey = [...words].sort().join("|");
  let best = null;
  for (const phrase of state.phrases) {
    if (!phraseSourceAllowed(phrase, exclude)) continue;
    const phraseWords = (phrase.ruNorm || "").split(" ").filter(Boolean);
    if (phraseWords.length !== words.length) continue;
    if ([...phraseWords].sort().join("|") !== targetKey) continue;
    best = pickBetterPhrase(best, phrase);
  }
  return best;
}

function findPhraseBagNearTypo(ruText, options = {}) {
  const exclude = new Set((options.excludeSources || []).map((s) => s.toLowerCase()));
  const words = normalizePhraseKey(ruText).split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 6) return null;

  const sortedTarget = [...words].sort();
  let best = null;
  let bestEdits = 99;

  for (const phrase of state.phrases) {
    if (!phraseSourceAllowed(phrase, exclude)) continue;
    const phraseWords = (phrase.ruNorm || "").split(" ").filter(Boolean);
    if (phraseWords.length !== words.length) continue;

    const sortedPhrase = [...phraseWords].sort();
    let edits = 0;
    for (let i = 0; i < sortedTarget.length; i += 1) {
      const a = sortedTarget[i];
      const b = sortedPhrase[i];
      if (a === b) continue;
      if (levenshteinAtMost(a, b, 1) <= 1) edits += 1;
      else {
        edits = 99;
        break;
      }
    }
    if (edits > 0 && edits < bestEdits) {
      bestEdits = edits;
      best = phrase;
    }
  }
  const maxEdits = words.length <= 3 ? 1 : 2;
  return bestEdits <= maxEdits ? best : null;
}

function validateIngText(ingText, ruText) {
  const ingNorm = normalizeText(ingText);
  if (!ingNorm) {
    return { ok: false, blockedReason: "empty_translation" };
  }

  for (const blocked of state.blacklist) {
    if (ingContainsBlockedForm(ingNorm, blocked)) {
      return { ok: false, blockedReason: `blocked_form:${blocked}` };
    }
  }

  const word = findWordExact(ruText);
  if (word) {
    const hasAllowedVariant = word.ingVariants.some((variant) => {
      const vNorm = normalizeText(variant);
      return vNorm && ingNorm.includes(vNorm);
    });
    if (!hasAllowedVariant) {
      return { ok: false, blockedReason: "dictionary_mismatch" };
    }
  }

  return { ok: true, blockedReason: "" };
}

async function assistTask(task, text) {
  const cleanText = (text || "").toString().trim();
  if (!cleanText) return { ok: false, status: 400, error: "empty_text" };

  if (task === "make_pron") {
    const fromPhrase = findPhrasePronByIng(cleanText);
    if (fromPhrase) return { ok: true, text: fromPhrase };
    return { ok: true, text: transliterateIngushToPron(cleanText) };
  }

  const prompts = {
    fix_ru: `Исправь орфографию и стиль, не меняя смысл. Верни только исправленный текст.\n\n${cleanText}`
  };
  const prompt = prompts[task];
  if (!prompt) return { ok: false, status: 400, error: "unsupported_task" };

  const llm = await callLlm(prompt);
  if (!llm.ok) {
    // fix_ru is an auxiliary UI action; never fail UX for any LLM outage.
    if (task === "fix_ru") {
      return { ok: true, text: cleanText };
    }
    return { ok: false, status: 503, error: llm.error };
  }
  return { ok: true, text: llm.text };
}

async function appendModeration(item) {
  state.moderationQueue.unshift(item);
  if (state.moderationQueue.length > 200) state.moderationQueue.length = 200;
  await fs.appendFile(MODERATION_LOG, `${JSON.stringify(item)}\n`, "utf8").catch(() => {});
}

async function translate(ruText, options = {}) {
  state.metrics.translateTotal += 1;
  const ru = (ruText || "").toString().trim();
  if (!ru) {
    return { ok: false, status: 400, error: "empty_ru" };
  }

  const excludeSources = [
    ...(Array.isArray(options.excludeSources) ? options.excludeSources : [])
  ];
  if (DISABLE_HABAR_PHRASE_SOURCE || options.skipHabar) {
    excludeSources.push(SOURCE.HABAR);
  }
  if (options.skipHabar) {
    excludeSources.push(SOURCE.CORPUS);
  }
  const phraseOptions = excludeSources.length ? { excludeSources } : {};

  // 1) Готовые фразы: Habar, PaydaDosh, уроки, шаблоны (+ опечатка в 1 слове, напр. «чпать»→«спать»)
  const ruTry = [ru, fixCommonRuTypos(ru)].filter((v, i, arr) => v && arr.indexOf(v) === i);
  let exactPhrase = null;
  for (const variant of ruTry) {
    exactPhrase =
      findPhraseExact(variant, phraseOptions) ||
      findPhraseBagMatch(variant, phraseOptions) ||
      findPhraseNearTypo(variant, phraseOptions) ||
      findPhraseBagNearTypo(variant, phraseOptions) ||
      findPhraseBest(variant, phraseOptions);
    if (exactPhrase) break;
  }
  if (exactPhrase) {
    return phraseTranslateResult(exactPhrase);
  }

  const pastWantEarly = tryComposePastWantInfinitive(ru);
  if (pastWantEarly.ok) {
    state.metrics.translateFromGrammar += 1;
    return {
      ok: true,
      translation: pastWantEarly.translation,
      usedSource: SOURCE.GRAMMAR,
      confidence: 0.9,
      fallbackUsed: false
    };
  }

  const wantInfEarly = tryComposeWantInfinitive(ru);
  if (wantInfEarly.ok) {
    state.metrics.translateFromGrammar += 1;
    return {
      ok: true,
      translation: wantInfEarly.translation,
      usedSource: SOURCE.GRAMMAR,
      confidence: 0.9,
      fallbackUsed: false
    };
  }

  // Короткие фразы: сначала грамматические шаблоны (классы, слоты), потом Dosh
  const ruWordsEarly = normalizeText(ru).split(" ").filter(Boolean);
  if (ruWordsEarly.length >= 2) {
    const byGrammarEarly = tryGrammarPatternTranslate(ru);
    if (byGrammarEarly.ok) {
      return grammarTranslateResult(byGrammarEarly.translation, ru, {
        patternId: byGrammarEarly.patternId
      });
    }
  }

  if (ruWordsEarly.length >= 2 && ruWordsEarly.length <= 4) {
    const composedEarly = composeFromDictionaryTokens(ru);
    if (composedEarly.ok) {
      state.metrics.translateFromDosh += 1;
      return {
        ok: true,
        translation: composedEarly.translation,
        usedSource: SOURCE.DOSH,
        confidence: 0.82,
        fallbackUsed: true
      };
    }
  }

  const ruNormForRouting = ` ${normalizeText(ru)} `;
  const isNegationInput = [" не ", " нет ", " никто ", " ничто ", " ничего ", " никогда "]
    .some((m) => ruNormForRouting.includes(m));

  // For negation phrases, prioritize grammar templates (particle/negative forms).
  if (isNegationInput) {
    const byGrammarNeg = tryGrammarPatternTranslate(ru);
    if (byGrammarNeg.ok) {
      return grammarTranslateResult(byGrammarNeg.translation, ru, {
        patternId: byGrammarNeg.patternId
      });
    }
  }

  const exactGrammarLexeme = findGrammarLexeme(ru);
  if (exactGrammarLexeme && normalizeText(exactGrammarLexeme.ru || "") === normalizeText(ru)) {
    const base = (exactGrammarLexeme?.forms?.base || "").toString().trim();
    if (base) {
      state.metrics.translateFromGrammar += 1;
      return {
        ok: true,
        translation: base,
        usedSource: SOURCE.GRAMMAR,
        confidence: 0.95,
        fallbackUsed: false
      };
    }
  }

  const ruTokens = tokenizeRu(ru);
  if (ruTokens.length >= 2) {
    const byGrammarPhrase = tryGrammarPatternTranslate(ru);
    if (byGrammarPhrase.ok) {
      return grammarTranslateResult(byGrammarPhrase.translation, ru, {
        patternId: byGrammarPhrase.patternId
      });
    }
  }

  const exactWord = findWordExact(ru);
  if (exactWord) {
    if (exactWord.source === SOURCE.ING_TERM) state.metrics.translateFromIngTerm += 1;
    else state.metrics.translateFromDosh += 1;
    return {
      ok: true,
      translation: exactWord.ingVariants.slice(0, 2).join(" / "),
      usedSource: exactWord.source === SOURCE.ING_TERM ? SOURCE.ING_TERM : SOURCE.DOSH,
      confidence: exactWord.confidence ?? 1,
      fallbackUsed: false
    };
  }

  const byGrammar = tryGrammarPatternTranslate(ru);
  if (byGrammar.ok) {
    return grammarTranslateResult(byGrammar.translation, ru, {
      patternId: byGrammar.patternId
    });
  }

  // Deterministic fallback: compose phrase from dosh token matches.
  // This keeps translation working when LLM is unavailable.
  const composed = composeFromDictionaryTokens(ru);
  if (composed.ok) {
    state.metrics.translateFromDosh += 1;
    return {
      ok: true,
      translation: composed.translation,
      usedSource: SOURCE.DOSH,
      confidence: 0.82,
      fallbackUsed: true
    };
  }

  const hints = buildDictionaryHints(ru).join("\n");
  const prompt = [
    "Ты переводчик на ингушский язык.",
    "Используй только проверенные формы, не используй чеченские формы.",
    hints ? `Словарный контекст:\n${hints}` : "",
    `Текст:\n${ru}`,
    "Верни только перевод, без пояснений."
  ].filter(Boolean).join("\n\n");

  const llm = await callLlm(prompt);
  if (!llm.ok) {
    state.metrics.translateRejected += 1;
    const event = {
      id: `mod_${Date.now()}`,
      createdAt: nowIso(),
      ru,
      proposedIng: "",
      reason: llm.error,
      usedSource: SOURCE.LLM
    };
    await appendModeration(event);
    return { ok: false, status: 503, error: llm.error, detail: llm.detail || "" };
  }

  const validation = validateIngText(llm.text, ru);
  if (!validation.ok) {
    state.metrics.translateRejected += 1;
    const event = {
      id: `mod_${Date.now()}`,
      createdAt: nowIso(),
      ru,
      proposedIng: llm.text,
      reason: validation.blockedReason,
      usedSource: SOURCE.LLM
    };
    await appendModeration(event);
    return { ok: false, status: 422, error: validation.blockedReason };
  }

  state.metrics.translateFromLLM += 1;
  return {
    ok: true,
    translation: llm.text,
    usedSource: SOURCE.LLM,
    confidence: 0.55,
    fallbackUsed: true
  };
}

function lookupWord(ruText) {
  state.metrics.lookupsWord += 1;
  const norm = normalizeText(ruText);
  if (!norm) return [];
  return state.words
    .filter((w) => w.ruNorm.includes(norm) || norm.includes(w.ruNorm))
    .slice(0, 25);
}

function lookupPhrase(ruText) {
  state.metrics.lookupsPhrase += 1;
  const norm = normalizeText(ruText);
  if (!norm) return [];
  return state.phrases
    .filter((p) => p.ruNorm.includes(norm) || norm.includes(p.ruNorm))
    .slice(0, 25);
}

function lookupCorpus(query) {
  state.metrics.lookupsCorpus += 1;
  const norm = normalizeText(query);
  if (!norm) return [];
  const out = [];
  for (const doc of state.corpus) {
    const paragraph = (doc.paragraphs || []).find((p) => {
      const ru = normalizeText(p?.ru);
      const ing = normalizeText(p?.ing);
      return ru.includes(norm) || ing.includes(norm) || norm.includes(ru) || norm.includes(ing);
    });
    if (!paragraph) continue;
    out.push({
      id: doc.id,
      title: doc.title,
      level: doc.level,
      genre: doc.genre,
      snippet: {
        ru: paragraph.ru || "",
        ing: paragraph.ing || ""
      },
      source: SOURCE.CORPUS,
      confidence: doc.confidence
    });
    if (out.length >= 25) break;
  }
  return out;
}

function countPhrasesBy(filterFn) {
  return state.phrases.filter(filterFn).length;
}

function getMetrics() {
  const inv = state.inventoryStats || {};
  const paydaDoshItems = state.phrases.filter((p) => p.source === SOURCE.PAYDADOSH);
  const habarItems = state.phrases.filter((p) => p.source === SOURCE.HABAR);
  return {
    ...state.metrics,
    current: {
      wordsLoaded: state.words.length,
      phrasesLoaded: state.phrases.length,
      phraseIndexKeys: state.phraseIndex.size,
      habarItemsRaw: inv.habarItemsRaw ?? habarItems.length,
      habarBasicRaw: inv.habarBasicRaw ?? 0,
      habarConversationRaw: inv.habarConversationRaw ?? 0,
      habarPhrasesLoaded: habarItems.length,
      habarBasicPhrasesLoaded: countPhrasesBy((p) => p.source === SOURCE.HABAR && p.category === "basic_phrases"),
      habarConversationLoaded: countPhrasesBy((p) => p.source === SOURCE.HABAR && p.category === "conversation"),
      paydadoshRaw: inv.paydadoshRaw ?? paydaDoshItems.length,
      paydaDoshPhrasesLoaded: paydaDoshItems.length,
      paydaDoshEverydayLoaded: countPhrasesBy((p) => p.source === SOURCE.PAYDADOSH && p.category === "everyday_phrase"),
      paydaDoshLessonLoaded: countPhrasesBy((p) => p.source === SOURCE.PAYDADOSH && p.category === "lesson_phrase"),
      paydadoshEverydayRaw: inv.paydadoshEverydayRaw ?? 0,
      paydadoshLessonRaw: inv.paydadoshLessonRaw ?? 0,
      corpusPhrasesRaw: inv.corpusPhrasesRaw ?? 0,
      parallelCorpusPhrasesRaw: inv.parallelCorpusPhrasesRaw ?? 0,
      ingTermRaw: inv.ingTermRaw ?? 0,
      ingTermPhrasesLoaded: countPhrasesBy((p) => p.source === SOURCE.ING_TERM),
      ingTermWordsLoaded: state.words.filter((w) => w.source === SOURCE.ING_TERM).length,
      corpusPhrasesInIndex: countPhrasesBy((p) => p.source === SOURCE.CORPUS),
      parallelCorpusInIndex: countPhrasesBy(
        (p) => p.source === SOURCE.CORPUS && (p.category || "").startsWith("ghalghay_") && !/lesson/.test(p.category || "")
      ),
      lessonPhrasesLoaded: countPhrasesBy((p) => p.source === SOURCE.CORPUS),
      grammarPhraseKeys: countPhrasesBy((p) => p.source === SOURCE.GRAMMAR),
      corpusLoaded: state.corpus.length,
      grammarPatternsLoaded: state.grammar.patterns.length,
      grammarRulesLoaded: state.grammar.rules.length,
      grammarLexemesLoaded: state.grammar.lexemes.length,
      grammarDeclensionsLoaded: state.grammar.declensions.length,
      nounClassEntriesLoaded: state.nounClasses?.index?.count ?? 0,
      nounClassAgreementFixes: state.metrics.nounClassAgreementFixes,
      moderationPending: state.moderationQueue.length
    }
  };
}

function getModerationQueue() {
  return state.moderationQueue;
}

function fetchGithubText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "ingush-language-api" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          resolve(data);
        });
      })
      .on("error", reject);
  });
}

/** Подтянуть categories/*.json с GitHub (после правок в Habar на сайте). */
async function pullCategoriesFromGitHub() {
  const raw = await fetchGithubText(GITHUB_CATEGORIES_API);
  const list = JSON.parse(raw);
  let pulled = 0;
  for (const entry of list) {
    if (entry.type !== "file" || !entry.name.endsWith(".json") || !entry.download_url) continue;
    const content = await fetchGithubText(entry.download_url);
    const cleaned = content.replace(
      /<<<<<<< HEAD[\s\S]*?=======\n([\s\S]*?)>>>>>>>[^\n]*/g,
      "$1"
    );
    JSON.parse(cleaned);
    await fs.writeFile(path.join(CATEGORY_DIR, entry.name), cleaned, "utf8");
    pulled += 1;
  }
  return pulled;
}

async function refreshAllSources({ pullCategories = false } = {}) {
  let categoriesPulled = 0;
  if (pullCategories) {
    try {
      categoriesPulled = await pullCategoriesFromGitHub();
    } catch (err) {
      return {
        ok: false,
        error: "github_pull_failed",
        detail: err?.message || String(err)
      };
    }
  }

  const [words, phrases, corpus, blacklist, grammar, nounClasses] = await Promise.all([
    loadAllWords(),
    loadPhrases(),
    loadCorpus(),
    loadBlacklist(),
    loadGrammarData(),
    loadNounClassKnowledge()
  ]);
  state.words = words;
  state.grammar = grammar;
  state.nounClasses = nounClasses;
  state.phrases = mergePhraseRecords([...phrases, ...phrasesFromGrammarPatterns(grammar.patterns)]);
  state.corpus = corpus;
  state.blacklist = blacklist;
  rebuildPhraseIndex();
  return { ok: true, categoriesPulled, phrasesLoaded: state.phrases.length, phraseIndexKeys: state.phraseIndex.size };
}

function lookupNounClass(query, { by = "auto" } = {}) {
  const nc = state.nounClasses;
  if (!nc || !query) return null;
  const q = String(query).trim();
  if (by === "ru") return nc.getMarkerFor(q, { preferRu: true });
  if (by === "ing") return nc.getMarkerFor(q, { preferRu: false, ingForm: q });
  return nc.getMarkerFor(q, { preferRu: true, ingForm: q }) || nc.getMarkerFor(q);
}

module.exports = {
  refreshAllSources,
  pullCategoriesFromGitHub,
  lookupWord,
  lookupPhrase,
  lookupCorpus,
  lookupNounClass,
  translate,
  assistTask,
  getMetrics,
  getModerationQueue,
  testGeminiConnection,
  testLlmConnection,
  getLlmConfig
};

