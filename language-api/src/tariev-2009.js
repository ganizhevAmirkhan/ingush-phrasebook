/**
 * Tarieva et al. 2009 dictionary — load, index, lookup, translate helpers.
 */
const path = require("node:path");
const fs = require("node:fs/promises");
const { SOURCE, normalizeText, toColloquialPhraseRecord } = require("./schema");

const ROOT = path.resolve(__dirname, "..");
const TARIEV_FILE = path.join(ROOT, "data", "dictionary", "tariev-2009.json");

function normalizeIng(value) {
  return normalizeText(value).replace(/-/g, "");
}

function pickIngForm(item, tense) {
  const p = item?.paradigm;
  const lemma = (item?.ing || "").toString().toLowerCase();
  if (!p?.byTense && !p?.imperative) return lemma;
  const map = {
    imperative: p.imperative,
    present: p.present,
    past: p.past,
    future: p.future
  };
  const key = tense && map[tense] ? tense : "imperative";
  return (map[key] || p.imperative || lemma).toString().replace(/\s+/g, " ").trim();
}

async function loadTarievEntries() {
  try {
    const json = JSON.parse(await fs.readFile(TARIEV_FILE, "utf8"));
    return Array.isArray(json?.items) ? json.items : [];
  } catch {
    return [];
  }
}

function buildIndexes(items) {
  const byId = new Map();
  const ingIndex = new Map();
  const ruIndex = new Map();

  for (const item of items) {
    if (!item?.id) continue;
    byId.set(item.id, item);

    const ru = normalizeText(item.ru);
    if (ru && !ruIndex.has(ru)) ruIndex.set(ru, item.id);

    const keys = new Set();
    if (item.ing) keys.add(normalizeIng(item.ing));
    const p = item.paradigm;
    if (p) {
      for (const f of [p.imperative, p.present, p.past, p.future]) {
        if (f) keys.add(normalizeIng(f));
      }
    }
    for (const k of keys) {
      if (k && !ingIndex.has(k)) ingIndex.set(k, item.id);
    }
  }

  return { byId, ingIndex, ruIndex };
}

function tarievToWordRecord(item) {
  const ru = (item?.ru || "").toString().trim();
  if (!ru) return null;
  const forms = [];
  if (item.paradigm) {
    for (const f of [item.paradigm.imperative, item.paradigm.present, item.paradigm.past, item.paradigm.future]) {
      if (f && !forms.includes(f)) forms.push(f);
    }
  }
  const lemma = (item.ing || "").toString().toLowerCase();
  if (lemma && !forms.includes(lemma)) forms.unshift(lemma);
  if (!forms.length) return null;

  return {
    id: item.id,
    ru,
    ruNorm: normalizeText(ru),
    ruTokens: ru.toLowerCase().split(/[\s,;/]+/).filter(Boolean),
    ingVariants: forms.slice(0, 4),
    pos: item.pos || "tariev",
    source: SOURCE.TARIEV_2009,
    confidence: 0.9,
    tariev: {
      paradigm: item.paradigm || null,
      nounClass: item.nounClass || null,
      stems: item.stems || null,
      verbTags: item.verbTags || null
    }
  };
}

function tarievItemsToPhrases(items) {
  const out = [];
  for (const item of items) {
    for (const ex of item.examples || []) {
      const ing = (ex.ingResolved || ex.ing || "").toString().trim();
      const ru = (ex.ru || "").toString().trim();
      if (!ing || !ru) continue;
      const rec = toColloquialPhraseRecord(
        {
          id: `${item.id}_${out.length}`,
          ru,
          ing,
          confidence: 0.91
        },
        SOURCE.TARIEV_2009,
        "tariev_example"
      );
      if (rec.ruNorm && rec.ing) out.push(rec);
    }
  }
  return out;
}

function serializeEntry(item) {
  if (!item) return null;
  return {
    id: item.id,
    ing: item.ing,
    homonym: item.homonym,
    pos: item.pos,
    posRu: item.posRu,
    ru: item.ru,
    ruAll: item.ruAll,
    nounClass: item.nounClass,
    citationForm: item.citationForm,
    stems: item.stems,
    paradigm: item.paradigm,
    verbTags: item.verbTags,
    classAgreement: item.classAgreement,
    examples: item.examples,
    source: SOURCE.TARIEV_2009
  };
}

function lookupTariev(indexes, { ing = "", ru = "", id = "", limit = 15 } = {}) {
  const { byId, ingIndex, ruIndex } = indexes;
  const results = [];

  if (id) {
    const item = byId.get(id);
    if (item) results.push(item);
    return results.map(serializeEntry).filter(Boolean);
  }

  const ingNorm = normalizeIng(ing);
  if (ingNorm) {
    const hit = byId.get(ingIndex.get(ingNorm));
    if (hit) results.push(hit);
    if (results.length < limit) {
      for (const [key, itemId] of ingIndex) {
        if (results.length >= limit) break;
        if (key.includes(ingNorm) || ingNorm.includes(key)) {
          const it = byId.get(itemId);
          if (it && !results.includes(it)) results.push(it);
        }
      }
    }
  }

  const ruNorm = normalizeText(ru);
  if (ruNorm && results.length < limit) {
    const hit = byId.get(ruIndex.get(ruNorm));
    if (hit && !results.includes(hit)) results.push(hit);
    for (const item of byId.values()) {
      if (results.length >= limit) break;
      if (normalizeText(item.ru).includes(ruNorm) || ruNorm.includes(normalizeText(item.ru))) {
        if (!results.includes(item)) results.push(item);
      }
    }
  }

  return results.slice(0, limit).map(serializeEntry).filter(Boolean);
}

module.exports = {
  TARIEV_FILE,
  loadTarievEntries,
  buildIndexes,
  tarievToWordRecord,
  tarievItemsToPhrases,
  pickIngForm,
  lookupTariev,
  normalizeIng,
  serializeEntry
};
