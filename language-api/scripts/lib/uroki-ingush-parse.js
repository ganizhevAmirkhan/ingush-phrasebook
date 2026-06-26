/**
 * Parser for «Уроки ингушского языка» (Хайрова, Баркинхоева, Костоев).
 */
const { isUsableShortRu } = require("../../src/phrase-split");

const ING_HEAD = /^[A-ZА-ЯЁI1ӘӏӀҮүӨө]/;

function normalizeSpace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function looksRu(text) {
  const t = (text || "").trim();
  if (!t || t.length < 2) return false;
  if (!/[а-яё]/.test(t)) return false;
  if (/^[А-ЯЁI1ӘӏӀ\s\-–—]+$/.test(t)) return false;
  return true;
}

function looksIng(text) {
  const t = (text || "").trim();
  if (!t || t.length < 3) return false;
  if (/[а-яё]/.test(t)) return false;
  return ING_HEAD.test(t);
}

function normalizePair(ru, ing) {
  ru = normalizeSpace(ru.replace(/^(Приветствие|Ответ|Вопрос|Например|Слова|Словосочетания)\s*:\s*/i, ""));
  ing = normalizeSpace(ing.replace(/[!?.]+$/, (m) => m)); // keep terminal punct on ing
  if (ru.includes(".") || ru.includes("!")) {
    const parts = ru.split(/(?<=[.!])\s*/).map((s) => s.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (looksRu(parts[i])) {
        ru = parts[i];
        break;
      }
    }
  }
  if (!ru || !ing) return null;
  if (looksIng(ru) && looksRu(ing)) {
    [ru, ing] = [ing, ru];
  }
  if (!looksIng(ing) || !looksRu(ru)) return null;
  if (ru.length > 160 || ing.length > 240) return null;
  if (/^(СЛОВА|Словарь|Обратите|Запомните|Внимание|ЖЕЛАЕМ|МЫ ЖЕЛАЕМ|ВОККХА|ЙОККХА)/i.test(ru)) return null;
  if (/^(Яха|Саид|САИД|ЯХА|Лейла|Фатима|Башир|Ахмед|Доктор|Продавец|Официант)\s*:/i.test(ru)) return null;
  if (!isUsableShortRu(ru) && ru.split(" ").length > 14) return null;
  return { ru, ing };
}

function pairKey(ru, ing) {
  return `${ru.toLowerCase()}|${ing.toLowerCase()}`;
}

function extractDashPairs(text, seen, kind = "phrase") {
  const out = [];
  const re =
    /([А-ЯЁ(«"][А-Яа-яёЁ0-9\s!?.,()«»\-–—]{2,150}?)\s+-\s+([A-ZА-ЯI1ӘӏӀЬЪ][A-ZА-ЯI1ӘӏӀЬЪ0-9\s!?.,\-–—]{4,240}?)(?=[.!]?\s*[А-ЯЁ][а-яё]|\s+-\s+|СЛОВАРЬ|Урок|УРОК|ЖЕЛАЕМ|МЫ ЖЕЛАЕМ|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const pair = normalizePair(m[1], m[2]);
    if (!pair) continue;
    const key = pairKey(pair.ru, pair.ing);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...pair, kind });
  }
  return out;
}

function splitIntoLessons(text) {
  const normalized = (text || "")
    .replace(/\r/g, "")
    .replace(/(Урок|УРОК)\s+(\d+)\./g, "\n$1 $2.");
  const chunks = normalized.split(/\n(?=(?:Урок|УРОК)\s+\d+\.)/i).filter(Boolean);
  const lessons = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^(?:Урок|УРОК)\s+(\d+)\.\s*(.+)$/is);
    if (!m) continue;
    const number = Number(m[1]);
    let rest = m[2].trim();
    let titleRu = "";
    let titleIng = "";
    const titleEnd = rest.search(/\s+[A-ZА-ЯI1ӘӏӀ][A-ZА-ЯI1ӘӏӀ\s]{3,40}(?=\s+[ЭтУВНДСЯПОК]|$)/);
    if (titleEnd > 5 && titleEnd < 120) {
      const head = rest.slice(0, titleEnd).trim();
      const parts = head.split(/\s+(?=[A-ZА-ЯI1ӘӏӀ])/);
      if (parts.length >= 2) {
        titleRu = normalizeSpace(parts[0]);
        titleIng = normalizeSpace(parts.slice(1).join(" "));
        rest = rest.slice(titleEnd).trim();
      }
    }
    if (!titleRu) {
      const dot = rest.search(/\.\s*(?=Эт|В этом|Наш|У ингуш|Все |Как |Сегодня|Прошло|В один|В ингуш|Приведем|Нам часто)/);
      if (dot > 0 && dot < 100) {
        titleRu = normalizeSpace(rest.slice(0, dot));
        rest = rest.slice(dot + 1).trim();
      } else {
        titleRu = normalizeSpace(rest.slice(0, 60));
        rest = rest.slice(60).trim();
      }
    }
    lessons.push({ number, titleRu, titleIng, body: rest });
  }
  return lessons;
}

function extractVocabulary(text) {
  const out = [];
  const seen = new Set();
  const vocabMatch = text.match(/СЛОВАРЬ\s+УРОКА\s*:([\s\S]*?)(?=ЖЕЛАЕМ\s+УСПЕХА|МЫ ЖЕЛАЕМ|Урок\s+\d+|УРОК\s+\d+|$)/i);
  if (!vocabMatch) return out;
  const block = vocabMatch[1];
  for (const piece of extractDashPairs(block, seen, "vocab")) {
    out.push({ ru: piece.ru, ing: piece.ing });
  }
  const alt = /([А-ЯЁа-яё][А-Яа-яё\s,()«»\-–—]{1,60}?)\s*-\s*([A-ZА-ЯI1ӘӏӀ][A-ZА-ЯI1ӘӏӀ\s\-–—]{1,80})/g;
  let m;
  while ((m = alt.exec(block))) {
    const pair = normalizePair(m[1], m[2]);
    if (!pair) continue;
    const key = pairKey(pair.ru, pair.ing);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ru: pair.ru, ing: pair.ing });
  }
  return out;
}

function extractGrammarSnippets(text) {
  const snippets = [];
  const markers = [
    /Обратите[^.]{10,400}\./gi,
    /Запомните[^.]{10,400}\./gi,
    /В ингушском языке[^.]{20,500}\./gi,
    /Вспомним[^.]{10,300}\./gi
  ];
  for (const re of markers) {
    let m;
    while ((m = re.exec(text))) {
      const s = normalizeSpace(m[0]);
      if (s.length >= 30 && s.length <= 500) snippets.push(s);
    }
  }
  return [...new Set(snippets)].slice(0, 8);
}

function parseLesson(lesson, globalSeen) {
  const { number, titleRu, titleIng, body } = lesson;
  const bodyNoVocab = body.replace(/СЛОВАРЬ\s+УРОКА\s*:[\s\S]*?(?=ЖЕЛАЕМ|МЫ ЖЕЛАЕМ|$)/i, " ");
  const pairs = extractDashPairs(bodyNoVocab, globalSeen, "phrase");
  const vocabulary = extractVocabulary(body);
  for (const v of vocabulary) {
    const key = pairKey(v.ru, v.ing);
    if (!globalSeen.has(key)) {
      globalSeen.add(key);
      pairs.push({ ru: v.ru, ing: v.ing, kind: "vocab" });
    }
  }
  const grammarNotes = extractGrammarSnippets(body);
  const isGrammarHeavy = /ЦIЕРДОШ|ПРЕДЛОЖЕНИ|ПРИЧАСТИ|СОЮЗ|СКЛОНЕНИ|НАКЛОНЕНИ|ПОСЛЕЛОГ/i.test(
    `${titleRu} ${titleIng}`
  );
  return {
    id: `uroki_l${String(number).padStart(2, "0")}`,
    number,
    titleRu,
    titleIng,
    kind: isGrammarHeavy ? "grammar" : "conversation",
    phraseCount: pairs.length,
    vocabularyCount: vocabulary.length,
    pairs,
    vocabulary,
    grammarNotes
  };
}

function parseUrokiText(text) {
  const globalSeen = new Set();
  const lessons = splitIntoLessons(text).map((l) => parseLesson(l, globalSeen));
  const allPairs = lessons.flatMap((l) => l.pairs);
  return {
    lessonCount: lessons.length,
    phraseCount: allPairs.length,
    vocabCount: lessons.reduce((n, l) => n + l.vocabulary.length, 0),
    lessons
  };
}

module.exports = {
  parseUrokiText,
  splitIntoLessons,
  extractDashPairs,
  extractVocabulary
};
