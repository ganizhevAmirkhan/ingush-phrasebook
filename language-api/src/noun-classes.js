/**
 * Noun class agreement (ва / я / ба / да) from noun-class-knowledge.json
 */
const fs = require("node:fs/promises");
const path = require("node:path");

const KNOWLEDGE_FILE = path.join(__dirname, "..", "data", "grammar", "noun-class-knowledge.json");

const COPULA_BY_MARKER = {
  va: { marker: "ва", aux: "вар", pair: "вар ва", existential: "ва" },
  ya: { marker: "я", aux: "бу", pair: "бу я", existential: "я" },
  ba: { marker: "ба", aux: "бай", pair: "бай ба", existential: "ба" },
  da: { marker: "да", aux: "ду", pair: "ду да", existential: "да" }
};

const PLURAL_SUFFIXES = /(?:аш|ий|яш|наш)$/i;

function normIngKey(s) {
  return String(s || "")
    .replace(/[Ӏ]/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normRuKey(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function markerFromRu(raw) {
  const m = String(raw || "").toLowerCase().replace(/\s/g, "");
  if (m === "ва" || m === "в") return "va";
  if (m === "я" || m === "й") return "ya";
  if (m === "ба" || m === "б") return "ba";
  if (m === "да" || m === "д") return "da";
  return null;
}

function isPluralForm(ing) {
  return PLURAL_SUFFIXES.test(String(ing || ""));
}

function pickMarker(entry, ingForm) {
  if (!entry) return null;
  const pl = isPluralForm(ingForm);
  if (pl && entry.markerPl) return entry.markerPl;
  if (pl && entry.flipBaDa && entry.markerSg === "ba") return "da";
  return entry.markerSg || entry.markerPl || null;
}

function buildIndex(knowledge) {
  const byIng = new Map();
  const byRu = new Map();
  for (const entry of knowledge?.entries || []) {
    const ing = (entry.ing || "").trim();
    if (!ing) continue;
    byIng.set(normIngKey(ing), entry);
    if (entry.ru) byRu.set(normRuKey(entry.ru), entry);
  }
  return {
    loadedAt: knowledge?.generatedAt || null,
    rules: knowledge?.composerRules || [],
    byIng,
    byRu,
    count: byIng.size
  };
}

function createNounClassService(index) {
  function lookupByIng(ing) {
    if (!ing) return null;
    return index.byIng.get(normIngKey(ing)) || null;
  }

  function lookupByRu(ru) {
    if (!ru) return null;
    return index.byRu.get(normRuKey(ru)) || null;
  }

  function getMarkerFor(ingOrRu, { preferRu = false, ingForm = "" } = {}) {
    let entry = preferRu ? lookupByRu(ingOrRu) : lookupByIng(ingOrRu);
    if (!entry && !preferRu) entry = lookupByRu(ingOrRu);
    if (!entry && preferRu) entry = lookupByIng(ingOrRu);
    if (!entry) return null;
    const ing = ingForm || entry.ing;
    const marker = pickMarker(entry, ing);
    if (!marker) return null;
    return {
      entry,
      marker,
      copula: COPULA_BY_MARKER[marker] || null,
      ruleIds: entry.composerRuleIds || [],
      reviewStatus: entry.reviewStatus || "draft"
    };
  }

  function markerToCopulaPair(markerKey) {
    return (COPULA_BY_MARKER[markerKey] || {}).pair || "";
  }

  function findSubjectsInIngText(ingText) {
    const text = String(ingText || "");
    const hits = [];
    for (const [key, entry] of index.byIng.entries()) {
      const ing = entry.ing;
      if (!ing || ing.length < 2) continue;
      const re = new RegExp(`(?:^|[\\s,;:!?«»\\-—])(${escapeRe(ing)})(?=[\\s,;:!?»\\-—]|$)`, "giu");
      let m;
      while ((m = re.exec(text)) !== null) {
        hits.push({ index: m.index + m[0].length - m[1].length, ing: m[1], entry });
      }
    }
    hits.sort((a, b) => b.index - a.index || b.ing.length - a.ing.length);
    return hits;
  }

  function applyCopulaAgreement(ingText, hints = {}) {
    const text = String(ingText || "").trim();
    if (!text) return { text, changed: false };

    const tailRe =
      /^(.*?)(?:\s+(бай|ду|бу|вар|беш|денна|деннад))?\s+(ба|да|я|ва)\s*([.!?…]*)\s*$/iu;
    const tail = text.match(tailRe);
    if (!tail) return { text, changed: false };

    const body = tail[1].trim();
    const currentMarker = markerFromRu(tail[3]);
    if (!currentMarker) return { text, changed: false };

    let subjectEntry = null;
    let subjectIng = hints.subjectIng || "";

    if (hints.subjectRu) {
      const fromRu = getMarkerFor(hints.subjectRu, { preferRu: true, ingForm: subjectIng });
      if (fromRu) {
        subjectEntry = fromRu.entry;
        subjectIng = subjectIng || subjectEntry.ing;
      }
    }

    if (!subjectEntry) {
      const subjects = findSubjectsInIngText(body);
      if (subjects.length) {
        subjectEntry = subjects[0].entry;
        subjectIng = subjects[0].ing;
      }
    }

    if (!subjectEntry) return { text, changed: false };

    const expected = pickMarker(subjectEntry, subjectIng);
    if (!expected || expected === currentMarker) {
      return {
        text,
        changed: false,
        subjectIng,
        marker: currentMarker,
        entry: subjectEntry
      };
    }

    const copula = COPULA_BY_MARKER[expected];
    const punct = tail[4] || "";
    const aux = tail[2] ? tail[2].trim() : copula.aux;
    const newTail = `${aux} ${copula.marker}${punct ? ` ${punct.trim()}` : ""}`.trim();
    const newText = `${body} ${newTail}`.replace(/\s+/g, " ").trim();

    return {
      text: newText,
      changed: true,
      subjectIng,
      marker: expected,
      previousMarker: currentMarker,
      entry: subjectEntry,
      ruleIds: subjectEntry.composerRuleIds || []
    };
  }

  return {
    index,
    lookupByIng,
    lookupByRu,
    getMarkerFor,
    markerToCopulaPair,
    applyCopulaAgreement,
    findSubjectsInIngText,
    rules: index.rules
  };
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let cached = null;

async function loadNounClassKnowledge() {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(KNOWLEDGE_FILE, "utf8");
    const json = JSON.parse(raw);
    cached = createNounClassService(buildIndex(json));
    return cached;
  } catch {
    cached = createNounClassService(buildIndex({ entries: [], composerRules: [] }));
    return cached;
  }
}

function setNounClassKnowledge(json) {
  cached = createNounClassService(buildIndex(json));
  return cached;
}

module.exports = {
  loadNounClassKnowledge,
  setNounClassKnowledge,
  createNounClassService,
  COPULA_BY_MARKER,
  KNOWLEDGE_FILE
};
