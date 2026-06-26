/**
 * «Уроки ингушского языка» (Хайрова, Баркинхоева, Костоев) — load, index, lookup.
 */
const path = require("node:path");
const fs = require("node:fs/promises");
const { SOURCE, normalizeText, tokenizeRu, toColloquialPhraseRecord } = require("./schema");

const ROOT = path.resolve(__dirname, "..");
const UROKI_FILE = path.join(ROOT, "data", "dictionary", "uroki-ingush.json");

function normalizeIng(value) {
  return normalizeText(value).replace(/-/g, "");
}

async function loadUrokiLessons() {
  try {
    const json = JSON.parse(await fs.readFile(UROKI_FILE, "utf8"));
    return Array.isArray(json?.items) ? json.items : [];
  } catch {
    return [];
  }
}

function urokiVocabToWordRecords(lessons) {
  const out = [];
  const seen = new Set();
  for (const lesson of lessons) {
    for (const v of lesson.vocabulary || []) {
      const ru = (v.ru || "").toString().trim();
      const ing = (v.ing || "").toString().trim();
      if (!ru || !ing) continue;
      const key = normalizeText(ru);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `${lesson.id}_v_${seen.size}`,
        ru,
        ruNorm: key,
        ruTokens: tokenizeRu(ru),
        ingVariants: [ing],
        pos: "uroki_vocab",
        source: SOURCE.UROKI_2009,
        confidence: 0.88,
        uroki: { lesson: lesson.number, lessonId: lesson.id, titleRu: lesson.titleRu }
      });
    }
  }
  return out;
}

function urokiLessonsToPhrases(lessons) {
  const out = [];
  for (const lesson of lessons) {
    for (const pair of lesson.pairs || []) {
      const ru = (pair.ru || "").toString().trim();
      const ing = (pair.ing || "").toString().trim();
      if (!ru || !ing) continue;
      const rec = toColloquialPhraseRecord(
        {
          id: `${lesson.id}_p_${out.length}`,
          ru,
          ing,
          confidence: pair.kind === "vocab" ? 0.89 : 0.9
        },
        SOURCE.UROKI_2009,
        pair.kind || "uroki_phrase"
      );
      if (!rec.ruNorm || !rec.ing) continue;
      rec.lesson = lesson.number;
      rec.lessonId = lesson.id;
      rec.lessonTitleRu = lesson.titleRu;
      out.push(rec);
    }
  }
  return out;
}

function buildUrokiIndexes(lessons) {
  const byLesson = new Map();
  const ruIndex = new Map();
  const ingIndex = new Map();

  for (const lesson of lessons) {
    if (lesson?.number != null) byLesson.set(Number(lesson.number), lesson);
    for (const pair of lesson.pairs || []) {
      const ru = normalizeText(pair.ru);
      const ing = normalizeIng(pair.ing);
      if (ru && !ruIndex.has(ru)) ruIndex.set(ru, { lesson, pair });
      if (ing && !ingIndex.has(ing)) ingIndex.set(ing, { lesson, pair });
    }
  }

  return { byLesson, ruIndex, ingIndex };
}

function serializeLessonHit(lesson, pair) {
  return {
    lesson: lesson.number,
    lessonId: lesson.id,
    titleRu: lesson.titleRu,
    titleIng: lesson.titleIng,
    kind: lesson.kind,
    ru: pair?.ru || "",
    ing: pair?.ing || "",
    pairKind: pair?.kind || null,
    source: SOURCE.UROKI_2009
  };
}

function lookupUroki(indexes, { lesson = "", ru = "", ing = "", limit = 25 } = {}) {
  const { byLesson, ruIndex, ingIndex } = indexes;
  const results = [];
  const lessonNum = lesson ? Number(lesson) : NaN;

  if (!Number.isNaN(lessonNum) && byLesson.has(lessonNum)) {
    const l = byLesson.get(lessonNum);
    for (const pair of l.pairs || []) {
      results.push(serializeLessonHit(l, pair));
      if (results.length >= limit) return results;
    }
    return results;
  }

  const ruNorm = normalizeText(ru);
  if (ruNorm) {
    const hit = ruIndex.get(ruNorm);
    if (hit) results.push(serializeLessonHit(hit.lesson, hit.pair));
    for (const [key, entry] of ruIndex) {
      if (results.length >= limit) break;
      if (key.includes(ruNorm) || ruNorm.includes(key)) {
        const item = serializeLessonHit(entry.lesson, entry.pair);
        if (!results.some((r) => r.ru === item.ru && r.ing === item.ing)) results.push(item);
      }
    }
  }

  const ingNorm = normalizeIng(ing);
  if (ingNorm && results.length < limit) {
    const hit = ingIndex.get(ingNorm);
    if (hit) {
      const item = serializeLessonHit(hit.lesson, hit.pair);
      if (!results.some((r) => r.ru === item.ru && r.ing === item.ing)) results.push(item);
    }
    for (const [key, entry] of ingIndex) {
      if (results.length >= limit) break;
      if (key.includes(ingNorm) || ingNorm.includes(key)) {
        const item = serializeLessonHit(entry.lesson, entry.pair);
        if (!results.some((r) => r.ru === item.ru && r.ing === item.ing)) results.push(item);
      }
    }
  }

  return results.slice(0, limit);
}

module.exports = {
  UROKI_FILE,
  loadUrokiLessons,
  urokiVocabToWordRecords,
  urokiLessonsToPhrases,
  buildUrokiIndexes,
  lookupUroki
};
