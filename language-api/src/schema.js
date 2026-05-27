const SOURCE = {
  DOSH: "dosh",
  GRAMMAR: "grammar",
  HABAR: "habar",
  PAYDADOSH: "paydadosh",
  CORPUS: "corpus",
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
  tokenizeRu,
  toWordRecord,
  toPhraseRecord,
  toColloquialPhraseRecord,
  toCorpusRecord
};

