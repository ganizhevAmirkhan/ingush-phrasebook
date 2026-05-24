const fs = require("node:fs/promises");
const path = require("node:path");
const {
  SOURCE,
  normalizeText,
  tokenizeRu,
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

const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const HABAR_ROOT = WORKSPACE_ROOT;

const CATEGORY_DIR = path.join(HABAR_ROOT, "categories");
const PAYDADOSH_PHRASES_FILE = path.join(ROOT, "data", "colloquial", "paydadosh-phrases.json");
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
    translateFromLLM: 0,
    translateRejected: 0
  }
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

// Habar categories in /translate (set DISABLE_HABAR_IN_TRANSLATE=true to skip).
const DISABLE_HABAR_PHRASE_SOURCE =
  String(process.env.DISABLE_HABAR_IN_TRANSLATE || "false").toLowerCase() === "true";

const PHRASE_SOURCE_PRIORITY = {
  [SOURCE.PAYDADOSH]: 4,
  [SOURCE.HABAR]: 3,
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

async function loadPhrases() {
  const [habar, paydadosh, lessons] = await Promise.all([
    loadHabarPhrases(),
    loadPaydaDoshPhrases(),
    loadLessonColloquialPhrases()
  ]);
  return mergePhraseRecords([...habar, ...lessons, ...paydadosh]);
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
  try {
    const json = await readJson(BLACKLIST_FILE);
    return Array.isArray(json?.blocked) ? json.blocked.map((x) => normalizeText(x)).filter(Boolean) : [];
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

function findWordForToken(token) {
  if (!token) return null;
  // Prefer exact normalized match first.
  const exact = state.words.find((w) => w.ruNorm === token);
  if (exact) return exact;

  // Then allow token match inside dictionary tokenization.
  const byToken = state.words.filter((w) => Array.isArray(w.ruTokens) && w.ruTokens.includes(token));
  if (!byToken.length) return null;

  // Prefer shorter entries (usually closer to a base lemma).
  byToken.sort((a, b) => (a.ruNorm.length - b.ruNorm.length));
  return byToken[0] || null;
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
        return (
          t === token
          || t.startsWith(token)
          || token.startsWith(t)
          || (tokenStem && tStem && tokenStem === tStem)
        );
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
    return out;
  }

  const tokens = tokenizeRu(slotText);
  if (tokens.length === 1) {
    const w = findWordForToken(tokens[0]);
    const base = pickBaseVariantFromWord(w);
    return { base, dat: base, goal: base, want: "деза" };
  }

  const composed = composeFromDictionaryTokens(slotText);
  if (composed.ok) return { base: composed.translation, dat: composed.translation, goal: composed.translation, want: "деза" };

  return { base: "", dat: "", goal: "", want: "деза" };
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

const NEED_INFINITIVE_VERB_DOSH = {
  "идти": "даваха"
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

function composeFromDictionaryTokens(ruText) {
  const atHome = tryComposeAtHomePhrase(ruText);
  if (atHome.ok) {
    return atHome;
  }

  const needInf = tryComposeNeedInfinitive(ruText);
  if (needInf.ok) {
    return needInf;
  }

  const cannotInf = tryComposeCannotInfinitive(ruText);
  if (cannotInf.ok) {
    return cannotInf;
  }

  const tokens = tokenizeRu(ruText);
  if (!tokens.length || tokens.length < 2) {
    return { ok: false, translation: "", covered: 0, total: tokens.length };
  }

  const ingTokens = [];
  let covered = 0;
  for (const token of tokens) {
    const word = findWordForToken(token);
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

function findPhraseBest(ruText, options = {}) {
  const exclude = new Set((options.excludeSources || []).map((s) => s.toLowerCase()));
  const phrases = exclude.size
    ? state.phrases.filter((phrase) => !exclude.has((phrase.source || "").toLowerCase()))
    : state.phrases;

  const norm = normalizeText(ruText);
  if (!norm) return null;

  const exactMatches = phrases.filter((phrase) => phrase.ruNorm === norm);
  if (exactMatches.length) {
    exactMatches.sort((a, b) => {
      const pa = PHRASE_SOURCE_PRIORITY[a.source] || 0;
      const pb = PHRASE_SOURCE_PRIORITY[b.source] || 0;
      if (pb !== pa) return pb - pa;
      return (b.confidence || 0) - (a.confidence || 0);
    });
    return exactMatches[0];
  }

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
      const pa = PHRASE_SOURCE_PRIORITY[phrase.source] || 0;
      const pb = PHRASE_SOURCE_PRIORITY[best.source] || 0;
      if (pa > pb) best = phrase;
    }
  }
  if (bestScore >= 0.75) return best;
  return null;
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

function validateIngText(ingText, ruText) {
  const ingNorm = normalizeText(ingText);
  if (!ingNorm) {
    return { ok: false, blockedReason: "empty_translation" };
  }

  for (const blocked of state.blacklist) {
    if (blocked && ingNorm.includes(blocked)) {
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

  const exactPhrase = findPhraseBest(ru, phraseOptions);
  if (exactPhrase && exactPhrase.ruNorm === normalizeText(ru)) {
    if (exactPhrase.source === SOURCE.PAYDADOSH) state.metrics.translateFromPaydaDosh += 1;
    else state.metrics.translateFromPhrase += 1;
    return {
      ok: true,
      translation: exactPhrase.ing,
      usedSource: exactPhrase.source === SOURCE.PAYDADOSH ? SOURCE.PAYDADOSH : SOURCE.HABAR,
      confidence: exactPhrase.confidence,
      fallbackUsed: false
    };
  }

  const ruNormForRouting = ` ${normalizeText(ru)} `;
  const isNegationInput = [" не ", " нет ", " никто ", " ничто ", " ничего ", " никогда "]
    .some((m) => ruNormForRouting.includes(m));

  // For negation phrases, prioritize grammar templates (particle/negative forms).
  if (isNegationInput) {
    const byGrammarNeg = tryGrammarPatternTranslate(ru);
    if (byGrammarNeg.ok) {
      state.metrics.translateFromGrammar += 1;
      return {
        ok: true,
        translation: byGrammarNeg.translation,
        usedSource: SOURCE.GRAMMAR,
        confidence: 0.9,
        fallbackUsed: false
      };
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
      state.metrics.translateFromGrammar += 1;
      return {
        ok: true,
        translation: byGrammarPhrase.translation,
        usedSource: SOURCE.GRAMMAR,
        confidence: 0.9,
        fallbackUsed: false
      };
    }
  }

  const exactWord = findWordExact(ru);
  if (exactWord) {
    state.metrics.translateFromDosh += 1;
    return {
      ok: true,
      translation: exactWord.ingVariants.slice(0, 2).join(" / "),
      usedSource: SOURCE.DOSH,
      confidence: 1,
      fallbackUsed: false
    };
  }

  const byGrammar = tryGrammarPatternTranslate(ru);
  if (byGrammar.ok) {
    state.metrics.translateFromGrammar += 1;
    return {
      ok: true,
      translation: byGrammar.translation,
      usedSource: SOURCE.GRAMMAR,
      confidence: 0.9,
      fallbackUsed: false
    };
  }

  const phrase = findPhraseBest(ru, phraseOptions);
  if (phrase) {
    if (phrase.source === SOURCE.PAYDADOSH) state.metrics.translateFromPaydaDosh += 1;
    else state.metrics.translateFromPhrase += 1;
    return {
      ok: true,
      translation: phrase.ing,
      usedSource: phrase.source === SOURCE.PAYDADOSH ? SOURCE.PAYDADOSH : SOURCE.HABAR,
      confidence: phrase.confidence,
      fallbackUsed: false
    };
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

function getMetrics() {
  return {
    ...state.metrics,
    current: {
      wordsLoaded: state.words.length,
      phrasesLoaded: state.phrases.length,
      paydaDoshPhrasesLoaded: state.phrases.filter((p) => p.source === SOURCE.PAYDADOSH).length,
      lessonPhrasesLoaded: state.phrases.filter((p) => p.source === SOURCE.CORPUS).length,
      corpusLoaded: state.corpus.length,
      grammarPatternsLoaded: state.grammar.patterns.length,
      grammarRulesLoaded: state.grammar.rules.length,
      grammarLexemesLoaded: state.grammar.lexemes.length,
      grammarDeclensionsLoaded: state.grammar.declensions.length,
      moderationPending: state.moderationQueue.length
    }
  };
}

function getModerationQueue() {
  return state.moderationQueue;
}

async function refreshAllSources() {
  const [words, phrases, corpus, blacklist, grammar] = await Promise.all([
    loadDictionary(),
    loadPhrases(),
    loadCorpus(),
    loadBlacklist(),
    loadGrammarData()
  ]);
  state.words = words;
  state.phrases = phrases;
  state.corpus = corpus;
  state.blacklist = blacklist;
  state.grammar = grammar;
}

module.exports = {
  refreshAllSources,
  lookupWord,
  lookupPhrase,
  lookupCorpus,
  translate,
  assistTask,
  getMetrics,
  getModerationQueue,
  testGeminiConnection,
  testLlmConnection,
  getLlmConfig
};

