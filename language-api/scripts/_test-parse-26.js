const fs = require("node:fs/promises");
const path = require("node:path");

// Load helpers from import script by requiring phrase-split + duplicating minimal extract
const { splitRuIngPairs, isUsableRu } = require("../src/phrase-split");
const sample = require("node:fs").readFileSync(
  path.join(__dirname, "_sample-lesson-26.html"),
  "utf8"
);

function decodeEntities(s) {
  return (s || "")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
function stripHtml(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function norm(ru) {
  return (ru || "").toLowerCase().replace(/[!?.,…«»":]/g, "").trim();
}
function stripSpeakerPrefix(ru) {
  return (ru || "").replace(/^[А-ЯЁ][а-яё]+:\s*/, "").trim();
}
function isLikelyIngushBlock(s) {
  const t = (s || "").trim();
  if (!t || t.length < 3) return false;
  const upper = (t.match(/[A-ZА-ЯЁI1ӏӀ]/g) || []).length;
  if (upper / t.length < 0.28) return false;
  if (/[а-яё]{10,}/.test(t) && !/[I1ӏӀ]/.test(t)) return false;
  return /[A-ZА-ЯЁ]/.test(t);
}
function splitRuIngLine(text) {
  const candidates = [];
  for (const match of text.matchAll(/\s+(?:—|–)\s+/g)) {
    const ing = text.slice(match.index + match[0].length);
    if (isLikelyIngushBlock(ing)) {
      candidates.push({ ru: stripSpeakerPrefix(text.slice(0, match.index).trim()), ing: ing.trim() });
    }
  }
  for (const match of text.matchAll(/[.!?)]-\s*(?=[A-ZА-ЯЁ])/g)) {
    const ing = text.slice(match.index + match[0].length);
    if (isLikelyIngushBlock(ing)) {
      candidates.push({ ru: stripSpeakerPrefix(text.slice(0, match.index + 1).trim()), ing: ing.trim() });
    }
  }
  for (const match of text.matchAll(/\s+-\s*(?=[A-ZА-ЯЁ])/g)) {
    const ing = text.slice(match.index + match[0].length);
    if (isLikelyIngushBlock(ing)) {
      candidates.push({ ru: stripSpeakerPrefix(text.slice(0, match.index).trim()), ing: ing.trim() });
    }
  }
  return candidates.length ? candidates[candidates.length - 1] : null;
}
function paragraphToPlain(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function extractPairsFromLessonHtml(html) {
  const pairs = [];
  const seen = new Set();
  function pushPair(ru, ing) {
    ru = stripSpeakerPrefix((ru || "").replace(/\s+/g, " ").trim());
    ing = (ing || "").replace(/\s+/g, " ").trim();
    if (!ing || ing.length > 320) return;
    const subpairs = splitRuIngPairs(ru, ing, { maxRuLen: 180, maxRuWords: 24 });
    const chunks = subpairs.length ? subpairs : [{ ru, ing }];
    for (const chunk of chunks) {
      const r = (chunk.ru || "").trim();
      const i = (chunk.ing || "").trim();
      if (!isUsableRu(r, { maxRuLen: 180, maxRuWords: 24 }) || !i) continue;
      if (!/[A-ZА-ЯI1ӘӏӀ]/.test(i)) continue;
      const key = norm(r);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      pairs.push({ ru: r, ing: i });
    }
  }
  const bodyMatch = html.match(/<div class="storycontent"[^>]*>([\s\S]*?)<\/div>/i);
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(bodyMatch[1]))) {
    const text = paragraphToPlain(m[1]);
    if (!text) continue;
    const split = splitRuIngLine(text);
    if (split) pushPair(split.ru, split.ing);
  }
  return pairs;
}

const pairs = extractPairsFromLessonHtml(sample);
console.log("Lesson 26 pairs:", pairs.length);
pairs.forEach((p, i) => console.log(i + 1, p.ru.slice(0, 60), "=>", p.ing.slice(0, 50)));
