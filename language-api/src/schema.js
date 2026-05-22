const SOURCE = {
  DOSH: "dosh",
  GRAMMAR: "grammar",
  HABAR: "habar",
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

function toPhraseRecord(item, category) {
  return {
    id: item?.id || "",
    category: category || "",
    ru: (item?.ru || "").toString().trim(),
    ruNorm: normalizeText(item?.ru),
    ruTokens: tokenizeRu(item?.ru),
    ing: (item?.ing || "").toString().trim(),
    pron: (item?.pron || "").toString().trim(),
    audio: (item?.audio || "").toString().trim(),
    source: SOURCE.HABAR,
    confidence: 0.95
  };
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
  normalizeWordToken,
  tokenizeRu,
  toWordRecord,
  toPhraseRecord,
  toCorpusRecord
};

