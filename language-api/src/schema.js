const SOURCE = {
  DOSH: "dosh",
  GRAMMAR: "grammar",
  HABAR: "habar",
  PAYDADOSH: "paydadosh",
  CORPUS: "corpus",
  ING_TERM: "ing_term",
  MED_KODZOEV: "med_kodzoev",
  TARIEV_2009: "tariev_2009",
  UROKI_2009: "uroki_2009",
  SULTYGOVA_RAZGOVORNIK: "sultygova_razgovornik",
  LLM: "llm"
};

function normalizeText(value) {
  return (value || "")
    .toString()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Агрессивный ключ для поиска готовых фраз (пунктуация, префиксы «Ответ:» и т.д.) */
function normalizePhraseKey(value) {
  let t = normalizeText(value);
  if (!t) return "";
  t = t
    .replace(/^(приветствие|ответ|вопрос|фраза|пример)\s*:\s*/i, "")
    .replace(/[!?.,…«»":;()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

function phraseLookupKeys(ru) {
  const keys = new Set();
  const full = normalizeText(ru);
  const compact = normalizePhraseKey(ru);
  if (full) keys.add(full);
  if (compact) keys.add(compact);
  if (full) {
    const noTail = full.replace(/\s+(к\s+1\s+человеку|всем|мужчине|женщине)$/i, "").trim();
    if (noTail && noTail !== full) keys.add(noTail);
  }
  return [...keys];
}

function normalizeWordToken(token) {
  let t = normalizeText(token);
  if (!t) return "";
  if (t === "стоят") t = "стоит";

  const endings = [
    "ами", "ями", "ого", "ему", "ому", "иях", "ах", "ях",
    "ов", "ев", "ом", "ам", "ям", "ы", "и", "а", "я", "у", "ю"
  ];
  if (t.length > 5) {
    for (const suffix of endings) {
      if (t.endsWith(suffix) && t.length - suffix.length >= 4) {
        t = t.slice(0, -suffix.length);
        break;
      }
    }
  }
  return t;
}

/** Варианты русского слова для поиска в Dosh (падежи, мн. ч., опечатка в 1 букве). */
function tokenLookupVariants(token) {
  const raw = normalizeText(token);
  if (!raw) return [];

  const variants = new Set([raw]);
  const norm = normalizeWordToken(raw);
  if (norm) variants.add(norm);

  if (raw.endsWith("ие") && raw.length > 4) {
    variants.add(`${raw.slice(0, -2)}ые`);
    variants.add(`${raw.slice(0, -2)}ое`);
  }
  if (raw.endsWith("ые") && raw.length > 4) {
    variants.add(`${raw.slice(0, -2)}ое`);
  }

  const morphRules = [
    ["ие", "ий"], ["ые", "ое"], ["ая", "ий"], ["яя", "ий"],
    ["ое", "ий"], ["ее", "ий"], ["ей", "ий"], ["ий", "ие"],
    ["ого", "ий"], ["ому", "ий"], ["ых", "ий"], ["их", "ий"],
    ["ами", ""], ["ями", ""], ["ов", ""], ["ев", ""]
  ];

  for (const src of [...variants]) {
    if (src.length < 4) continue;
    for (const [from, to] of morphRules) {
      if (!src.endsWith(from) || src.length <= from.length + 2) continue;
      const stem = src.slice(0, -from.length);
      if (to) variants.add(stem + to);
    }
  }

  return [...variants].filter(Boolean);
}

function tokenizeRu(text) {
  return normalizeText(text)
    .split(" ")
    .map(normalizeWordToken)
    .filter(Boolean);
}

function toWordRecord(word) {
  const senses = Array.isArray(word?.senses) ? word.senses : [];
  const variants = senses
    .flatMap((s) => ((s?.ing || "").toString().split("*")))
    .map((x) => x.split("(")[0].trim())
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    id: word?.id || "",
    ru: (word?.ru || "").toString().trim(),
    ruNorm: normalizeText(word?.ru),
    ruTokens: tokenizeRu(word?.ru),
    ingVariants: [...new Set(variants)].slice(0, 8),
    pos: (word?.pos || "").toString().trim(),
    source: SOURCE.DOSH,
    confidence: 1
  };
}

function toColloquialPhraseRecord(item, source, category) {
  const ru = (item?.ru || "").toString().trim();
  const ing = (item?.ing || "").toString().trim();
  return {
    id: (item?.id || "").toString(),
    category: (category || item?.category || "").toString(),
    ru,
    ruNorm: normalizeText(ru),
    ruTokens: tokenizeRu(ru),
    ing,
    pron: (item?.pron || "").toString().trim(),
    audio: (item?.audio || "").toString().trim(),
    source: source || SOURCE.HABAR,
    confidence: Number(item?.confidence) || 0.93
  };
}

function toPhraseRecord(item, category) {
  return toColloquialPhraseRecord(item, SOURCE.HABAR, category);
}

function toCorpusRecord(doc, bucket) {
  const paragraphs = Array.isArray(doc?.paragraphs) ? doc.paragraphs : [];
  return {
    id: doc?.id || "",
    title: (doc?.title || "").toString().trim(),
    level: (doc?.level || "A1").toString(),
    genre: (doc?.genre || bucket || "story").toString(),
    paragraphs,
    glossary: Array.isArray(doc?.glossary) ? doc.glossary : [],
    source: SOURCE.CORPUS,
    confidence: 0.9
  };
}

module.exports = {
  SOURCE,
  normalizeText,
  normalizePhraseKey,
  phraseLookupKeys,
  normalizeWordToken,
  tokenLookupVariants,
  tokenizeRu,
  toWordRecord,
  toPhraseRecord,
  toColloquialPhraseRecord,
  toCorpusRecord
};

