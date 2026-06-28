/**
 * Shared parsers for Ingush pedagogy PDFs (Оздоев 1970, практикум, орфография, Хlанзара).
 */
const { extractDashPairs } = require("./uroki-ingush-parse");

function normalizeSpace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function normalizeBody(raw) {
  return (raw || "")
    .replace(/\f/g, "\n")
    .replace(/-\n/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function splitParagraphSections(text, opts = {}) {
  const { min = 1, max = 200, idPrefix = "ped", bodyStart = 0 } = opts;
  const body = text.slice(bodyStart);
  const re = /§\s*(\d+)\.\s*([^\n§]{3,220}?)(?=\s*(?:\n|§\s*\d+\.|$))/g;
  const hits = [];
  let m;
  while ((m = re.exec(body))) {
    const n = Number(m[1]);
    if (n < min || n > max) continue;
    hits.push({
      n,
      title: normalizeSpace(m[2].replace(/\s*\d+\s*$/, "")),
      index: m.index,
      endTitle: m.index + m[0].length
    });
  }
  const byN = new Map();
  for (const h of hits) {
    if (!byN.has(h.n) || h.index < byN.get(h.n).index) byN.set(h.n, h);
  }
  const ordered = [...byN.values()].sort((a, b) => a.n - b.n);
  const sections = [];
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const next = ordered[i + 1];
    const raw = body.slice(cur.endTitle, next ? next.index : body.length);
    const bodyRu = normalizeBody(raw);
    sections.push({
      id: `${idPrefix}_p${String(cur.n).padStart(3, "0")}`,
      paragraph: cur.n,
      titleRu: cur.title,
      bodyRu,
      charCount: bodyRu.length
    });
  }
  return sections;
}

function splitByMajorParts(text, parts) {
  const markers = [];
  for (const part of parts) {
    const idx = text.search(part.pattern);
    if (idx >= 0) markers.push({ ...part, index: idx });
  }
  markers.sort((a, b) => a.index - b.index);
  const out = [];
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    const raw = text.slice(cur.index, next ? next.index : text.length);
    out.push({
      part: cur.part,
      partTitleRu: cur.titleRu,
      text: raw,
      charCount: raw.length
    });
  }
  return out;
}

function chunkTextIntoSections(text, { idPrefix, part, partTitleRu, chunkSize = 3200 }) {
  const normalized = normalizeBody(text);
  if (!normalized) return [];
  const paras = normalized.split(/\n\n+/).filter((p) => p.trim().length > 40);
  const sections = [];
  let buf = "";
  let chunk = 0;
  const flush = () => {
    if (!buf.trim()) return;
    chunk += 1;
    const titleLine = buf.split("\n")[0].trim().slice(0, 120);
    sections.push({
      id: `${idPrefix}_${String(part).padStart(2, "0")}_${String(chunk).padStart(3, "0")}`,
      part,
      partTitleRu,
      titleRu: titleLine,
      bodyRu: buf.trim(),
      charCount: buf.trim().length
    });
    buf = "";
  };
  for (const para of paras) {
    if (buf.length + para.length > chunkSize && buf.length > 200) flush();
    buf += (buf ? "\n\n" : "") + para;
  }
  flush();
  return sections;
}

function extractLiteratureExcerpts(text, limit = 120) {
  const out = [];
  const seen = new Set();
  const re = /([^\n(]{40,900}?)\s*\(([А-ЯЁ]\.\s*[А-ЯЁ]\.)\)/g;
  let m;
  while ((m = re.exec(text))) {
    const ing = normalizeSpace(m[1].replace(/^[\d.\s]+/, ""));
    const author = normalizeSpace(m[2]);
    if (ing.length < 40 || ing.length > 1200) continue;
    if (!/[I1ӘӏӀ]/.test(ing) && !/[а-яё]{20,}/.test(ing)) continue;
    if (/^(А\.|Б\.|В\.|Г\.|Д\.|М\.|С\.|Х\.)\s/.test(ing)) continue;
    const key = ing.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ing, author, kind: "literature" });
    if (out.length >= limit) break;
  }
  return out;
}

function extractParenGlossPairs(text, limit = 500) {
  const out = [];
  const seen = new Set();
  const patterns = [
    /([A-Za-zА-ЯI1ӘӏӀ][A-Za-zА-ЯI1ӘӏӀ\-]{1,35})\s*\(([а-яё][а-яё\s\-]{2,55})\)/g,
    /([а-яё]{2,40})\s*\(([A-ZА-ЯI1ӘӏӀ][A-Za-zА-ЯI1ӘӏӀ\s\-]{2,55})\)/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      let a = normalizeSpace(m[1]);
      let b = normalizeSpace(m[2]);
      if (/^(масала|и\. кх\.|д1\.|грамматически|лексически|фаьлг|лоаца)$/i.test(b)) continue;
      if (/^(масала|и\. кх\.|д1\.)$/i.test(a)) continue;
      const ru = /[а-яё]{3,}/.test(a) && !/[I1ӘӏӀ]{2,}/.test(a) ? a : /[а-яё]{3,}/.test(b) ? b : null;
      const ing = ru === a ? b : ru === b ? a : null;
      if (!ru || !ing) continue;
      if (ru.length < 2 || ing.length < 2) continue;
      const key = `${ru.toLowerCase()}|${ing.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ru, ing, kind: "gloss" });
      if (out.length >= limit) break;
    }
  }
  return out;
}

function extractExampleSentences(bodyRu, limit = 8) {
  const out = [];
  const seen = new Set();
  const re = /(?:^|\n)\s*(\d+[\).]\s*[А-ЯI1ӘӏӀ][^\n]{15,220})/g;
  let m;
  while ((m = re.exec(bodyRu))) {
    const s = normalizeSpace(m[1].replace(/^\d+[\).]\s*/, ""));
    if (s.length < 15 || s.length > 280) continue;
    if (!/[I1ӘӏӀi]/.test(s)) continue;
    const key = s.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function parsePedagogyPhrases(text, globalSeen = new Set()) {
  const dash = extractDashPairs(text, globalSeen, "phrase");
  const gloss = extractParenGlossPairs(text);
  const out = [];
  const seen = new Set();
  for (const p of [...dash, ...gloss]) {
    const key = `${p.ru}|${p.ing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

const OZDOEV_1970_PARTS = [
  { part: 1, titleRu: "Лексика", pattern: /ЛЕКСИКА[\s\S]{0,40}§\s*1\./i },
  { part: 2, titleRu: "Фонетика", pattern: /ФОНЕТИКА\.\s*§\s*13/i },
  { part: 3, titleRu: "Морфология", pattern: /МОРФОЛОГИЯ|МОРФОЛОГИ[\s\S]{0,30}§\s*2[0-9]/i },
  { part: 4, titleRu: "Синтаксис / предложение", pattern: /КЪАМАЬЛА\s+ДОАКЪОШ/i },
  { part: 5, titleRu: "Контрольные упражнения", pattern: /КЕРДАДАККХАРА\s+УПРАЖНЕНЕШ/i }
];

const HLANZARA_PARTS = [
  { part: 1, titleRu: "Лексикология", pattern: /ЛЕКСИКОЛОГИ/i },
  { part: 2, titleRu: "Морфология", pattern: /МОРФОЛОГИ/i },
  { part: 3, titleRu: "Междометия", pattern: /ХОТТАРГАШ/i },
  { part: 4, titleRu: "Частицы", pattern: /ДАКЪИЛГАШ/i },
  { part: 5, titleRu: "Фонетика", pattern: /ФОНЕТИКА/i },
  { part: 6, titleRu: "Наречия", pattern: /Х1АМАНЦ1И/i },
  { part: 7, titleRu: "Местоимения", pattern: /ХАНДОШ/i }
];

function parseOzdoev1970Text(text) {
  const bodyStart = text.search(/§\s*1\.\s*Дешах бола кхетам/i);
  const sections = splitParagraphSections(text, {
    min: 1,
    max: 130,
    idPrefix: "ozd70",
    bodyStart: bodyStart >= 0 ? bodyStart : 0
  }).map((s) => ({
    ...s,
    examples: extractExampleSentences(s.bodyRu),
    sourceRef: `ozdoev-1970:§${s.paragraph}`
  }));
  const parts = splitByMajorParts(text, OZDOEV_1970_PARTS);
  for (const s of sections) {
    const hit = [...parts].reverse().find((p) => text.indexOf(s.titleRu) >= p.index) || parts[0];
    s.part = hit?.part || 0;
    s.partTitleRu = hit?.partTitleRu || "";
  }
  const phrases = parsePedagogyPhrases(text);
  const literature = extractLiteratureExcerpts(text);
  return {
    sections,
    phrases,
    literature,
    stats: {
      sections: sections.length,
      phrases: phrases.length,
      literature: literature.length,
      chars: text.length
    }
  };
}

function parseIomabaraPraktikumText(text) {
  const bodyStart = text.search(/§\s*0|ФОНЕТИКЕИ|КЕРДАДАККХАР/i);
  const sections = splitParagraphSections(text, {
    min: 0,
    max: 80,
    idPrefix: "iomab",
    bodyStart: bodyStart >= 0 ? bodyStart : 0
  }).map((s) => ({
    ...s,
    examples: extractExampleSentences(s.bodyRu),
    sourceRef: `iomabara-praktikum:§${s.paragraph}`
  }));
  if (!sections.length) {
    const parts = splitByMajorParts(text, [
      { part: 1, titleRu: "Фонетика и графика", pattern: /ФОНЕТИКЕИ\s+ГРЛФИКЕИ/i },
      { part: 2, titleRu: "Морфология", pattern: /МОРФОЛОГИ/i },
      { part: 3, titleRu: "Синтаксис", pattern: /СИНТАКСИС|КЪАМАЬЛА/i }
    ]);
    for (const p of parts) {
      sections.push(
        ...chunkTextIntoSections(p.text, {
          idPrefix: "iomab",
          part: p.part,
          partTitleRu: p.partTitleRu
        }).map((s) => ({ ...s, paragraph: null, examples: extractExampleSentences(s.bodyRu), sourceRef: s.id }))
      );
    }
  }
  const phrases = parsePedagogyPhrases(text);
  const literature = extractLiteratureExcerpts(text);
  return {
    sections,
    phrases,
    literature,
    stats: {
      sections: sections.length,
      phrases: phrases.length,
      literature: literature.length,
      chars: text.length
    }
  };
}

function parseOzdoevOrtographyText(text) {
  const bodyStart = text.search(/§\s*1\./i);
  const sections = splitParagraphSections(text, {
    min: 1,
    max: 200,
    idPrefix: "ozdort",
    bodyStart: bodyStart >= 0 ? bodyStart : 0
  }).map((s) => ({
    ...s,
    examples: extractExampleSentences(s.bodyRu),
    sourceRef: `ozdoev-ortography-2003:§${s.paragraph}`
  }));
  return {
    sections,
    phrases: [],
    literature: [],
    stats: { sections: sections.length, phrases: 0, literature: 0, chars: text.length }
  };
}

function parseHlanzaraText(text) {
  const parts = splitByMajorParts(text, HLANZARA_PARTS);
  const sections = [];
  for (const p of parts) {
    sections.push(
      ...chunkTextIntoSections(p.text, {
        idPrefix: "hlanz",
        part: p.part,
        partTitleRu: p.partTitleRu,
        chunkSize: 3800
      }).map((s) => ({
        ...s,
        paragraph: null,
        examples: extractExampleSentences(s.bodyRu),
        sourceRef: `hlanzara:${s.id}`
      }))
    );
  }
  const phrases = parsePedagogyPhrases(text);
  const literature = extractLiteratureExcerpts(text, 80);
  return {
    sections,
    phrases,
    literature,
    stats: {
      sections: sections.length,
      phrases: phrases.length,
      literature: literature.length,
      chars: text.length,
      parts: parts.length
    }
  };
}

module.exports = {
  normalizeSpace,
  normalizeBody,
  splitParagraphSections,
  splitByMajorParts,
  chunkTextIntoSections,
  extractLiteratureExcerpts,
  extractParenGlossPairs,
  extractExampleSentences,
  parsePedagogyPhrases,
  parseOzdoev1970Text,
  parseIomabaraPraktikumText,
  parseOzdoevOrtographyText,
  parseHlanzaraText
};
