const fs = require("node:fs/promises");
const path = require("node:path");
const {
  SOURCE,
  normalizeText,
  tokenizeRu,
  toWordRecord,
  toPhraseRecord,
  toCorpusRecord
} = require("./schema");

const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const HABAR_ROOT = path.resolve(WORKSPACE_ROOT, "ingush-phrasebook-main");

const CATEGORY_DIR = path.join(HABAR_ROOT, "categories");
const CORPUS_STORIES_DIR = path.join(ROOT, "data", "corpus", "stories");
const CORPUS_NOVELLAS_DIR = path.join(ROOT, "data", "corpus", "novellas");
const BLACKLIST_FILE = path.join(ROOT, "data", "blacklist.json");
const MODERATION_LOG = path.join(ROOT, "data", "moderation-queue.log.jsonl");

const DOSH_URLS = [
  "https://dosh.inghub.ru/public/dictionary.json",
  "https://raw.githubusercontent.com/ganizhevAmirkhan/ingush-language/main/public/dictionary.json"
];

const state = {
  words: [],
  phrases: [],
  corpus: [],
  blacklist: [],
  moderationQueue: [],
  metrics: {
    lookupsWord: 0,
    lookupsPhrase: 0,
    lookupsCorpus: 0,
    translateTotal: 0,
    translateFromDosh: 0,
    translateFromPhrase: 0,
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

async function loadPhrases() {
  const files = await safeListJsonFiles(CATEGORY_DIR);
  const out = [];
  for (const filePath of files) {
    try {
      const json = await readJson(filePath);
      const category = (json?.category || path.basename(filePath, ".json")).toString();
      const items = Array.isArray(json?.items) ? json.items : [];
      items.forEach((item) => {
        const rec = toPhraseRecord(item, category);
        if (rec.ruNorm && rec.ing) out.push(rec);
      });
    } catch {
      // ignore bad file
    }
  }
  return out;
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

function findWordExact(ruText) {
  const norm = normalizeText(ruText);
  if (!norm) return null;
  return state.words.find((w) => w.ruNorm === norm) || null;
}

function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let intersection = 0;
  for (const token of aSet) if (bSet.has(token)) intersection += 1;
  const union = aSet.size + bSet.size - intersection;
  return union ? intersection / union : 0;
}

function findPhraseBest(ruText) {
  const target = new Set(tokenizeRu(ruText));
  if (!target.size) return null;

  let best = null;
  let bestScore = 0;
  for (const phrase of state.phrases) {
    if (!phrase.ruTokens.length) continue;
    const score = jaccard(target, new Set(phrase.ruTokens));
    if (score > bestScore) {
      best = phrase;
      bestScore = score;
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

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) {
    return { ok: false, text: "", error: "missing_gemini_key" };
  }

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash-latest"];
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 }
  };

  let lastError = "llm_failed";
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        lastError = `llm_http_${res.status}`;
        continue;
      }
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((x) => x?.text || "").join("").trim();
      if (text) return { ok: true, text, error: "" };
      lastError = "llm_empty";
    } catch {
      lastError = "llm_fetch_failed";
    }
  }
  return { ok: false, text: "", error: lastError };
}

async function assistTask(task, text) {
  const cleanText = (text || "").toString().trim();
  if (!cleanText) return { ok: false, status: 400, error: "empty_text" };

  const prompts = {
    fix_ru: `Исправь орфографию и стиль, не меняя смысл. Верни только исправленный текст.\n\n${cleanText}`,
    make_pron: `Сделай латинскую транскрипцию (произношение) одной строкой. Без кавычек и без пояснений.\n\n${cleanText}`
  };
  const prompt = prompts[task];
  if (!prompt) return { ok: false, status: 400, error: "unsupported_task" };

  const llm = await callGemini(prompt);
  if (!llm.ok) return { ok: false, status: 503, error: llm.error };
  return { ok: true, text: llm.text };
}

async function appendModeration(item) {
  state.moderationQueue.unshift(item);
  if (state.moderationQueue.length > 200) state.moderationQueue.length = 200;
  await fs.appendFile(MODERATION_LOG, `${JSON.stringify(item)}\n`, "utf8").catch(() => {});
}

async function translate(ruText) {
  state.metrics.translateTotal += 1;
  const ru = (ruText || "").toString().trim();
  if (!ru) {
    return { ok: false, status: 400, error: "empty_ru" };
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

  const phrase = findPhraseBest(ru);
  if (phrase) {
    state.metrics.translateFromPhrase += 1;
    return {
      ok: true,
      translation: phrase.ing,
      usedSource: SOURCE.HABAR,
      confidence: phrase.confidence,
      fallbackUsed: false
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

  const llm = await callGemini(prompt);
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
    return { ok: false, status: 503, error: llm.error };
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
      corpusLoaded: state.corpus.length,
      moderationPending: state.moderationQueue.length
    }
  };
}

function getModerationQueue() {
  return state.moderationQueue;
}

async function refreshAllSources() {
  const [words, phrases, corpus, blacklist] = await Promise.all([
    loadDictionary(),
    loadPhrases(),
    loadCorpus(),
    loadBlacklist()
  ]);
  state.words = words;
  state.phrases = phrases;
  state.corpus = corpus;
  state.blacklist = blacklist;
}

module.exports = {
  refreshAllSources,
  lookupWord,
  lookupPhrase,
  lookupCorpus,
  translate,
  assistTask,
  getMetrics,
  getModerationQueue
};

