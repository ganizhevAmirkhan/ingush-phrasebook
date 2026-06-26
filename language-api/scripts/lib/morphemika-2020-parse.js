/**
 * Parser: Барахоева, Илиева, Хайрова (2020) — Морфемика. Словообразование.
 * Splits body text into § 1–103 sections with examples and affix hints.
 */

const PART_BY_PARAGRAPH = [
  { part: 1, titleRu: "Морфемика", from: 1, to: 7 },
  { part: 2, titleRu: "Словообразование (общее)", from: 8, to: 20 },
  { part: 3, titleRu: "Словообразование имён существительных", from: 21, to: 49 },
  { part: 4, titleRu: "Словообразование имён прилагательных", from: 50, to: 61 },
  { part: 5, titleRu: "Словообразование имён числительных", from: 62, to: 63 },
  { part: 6, titleRu: "Словообразование местоименных слов", from: 64, to: 65 },
  { part: 7, titleRu: "Словообразование наречий", from: 66, to: 69 },
  { part: 8, titleRu: "Словообразование глаголов", from: 70, to: 103 }
];

const MAIN_PART_MARKERS = [
  { part: 1, pattern: /1\.\s*МОРФЕМИКА КАК РАЗДЕЛ/i },
  { part: 2, pattern: /2\.\s*СЛОВООБРАЗОВАНИЕ КАК РАЗДЕЛ/i },
  { part: 3, pattern: /3\.\s*СЛОВООБРАЗОВАНИЕ ИМЕН СУЩЕСТВИТЕЛЬНЫХ/i },
  { part: 4, pattern: /4\.\s*СЛОВООБРАЗОВАНИЕ ИМЕН ПРИЛАГАТЕЛЬНЫХ/i },
  { part: 5, pattern: /5\.\s*СЛОВООБРАЗОВАНИЕ ИМЕН ЧИСЛИТЕЛЬНЫХ/i },
  { part: 6, pattern: /6\.\s*СЛОВООБРАЗОВАНИЕ МЕСТОИМЕННЫХ/i },
  { part: 7, pattern: /7\.\s*СЛОВООБРАЗОВАНИЕ НАРЕЧИЙ/i },
  { part: 8, pattern: /8\.\s*СЛОВООБРАЗОВАНИЕ ГЛАГОЛОВ/i }
];

function normalizeSpace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function partForParagraph(n) {
  const hit = PART_BY_PARAGRAPH.find((p) => n >= p.from && n <= p.to);
  return hit ? { part: hit.part, partTitleRu: hit.titleRu } : { part: 0, partTitleRu: "" };
}

function findBodyStart(text) {
  const idx = text.search(/§\s*1\.\s*Предмет морфемики/i);
  return idx >= 0 ? idx : text.search(/1\.\s*МОРФЕМИКА КАК РАЗДЕЛ/i);
}

function splitParagraphSections(text) {
  const body = text.slice(findBodyStart(text));
  const re = /§\s*(\d+)\.\s*([^\n§]{3,200}?)(?=\s*(?:\n|§\s*\d+\.|$))/g;
  const hits = [];
  let m;
  while ((m = re.exec(body))) {
    const n = Number(m[1]);
    if (n < 1 || n > 103) continue;
    hits.push({ n, title: normalizeSpace(m[2].replace(/\s*\d+\s*$/, "")), index: m.index, endTitle: m.index + m[0].length });
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
    const bodyRu = normalizeParagraphBody(raw);
    const { part, partTitleRu } = partForParagraph(cur.n);
    sections.push({
      id: `morph_p${String(cur.n).padStart(3, "0")}`,
      paragraph: cur.n,
      part,
      partTitleRu,
      titleRu: cur.title,
      bodyRu,
      charCount: bodyRu.length
    });
  }
  return sections;
}

function normalizeParagraphBody(raw) {
  return (raw || "")
    .replace(/\f/g, "\n")
    .replace(/-\n/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function extractExamples(bodyRu, limit = 12) {
  const out = [];
  const seen = new Set();
  const patterns = [
    /([а-яёА-ЯЁIӀӘӏ]{2,40})\s*(?:→|->)\s*([а-яёА-ЯЁIӀӘӏ][а-яёА-ЯЁIӀӘӏ\s\-–—]{1,60})/g,
    /([а-яё]{2,50})\s*[-–—]\s*([A-ZА-ЯI1ӘӏӀ][A-ZА-ЯI1ӘӏӀ\s\-–—]{2,80})/g,
    /([A-ZА-ЯI1ӘӏӀ][A-ZА-ЯI1ӘӏӀ\s\-–—]{2,80})\s*[-–—]\s*([а-яё]{2,50})/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(bodyRu))) {
      let ru = normalizeSpace(m[1]);
      let ing = normalizeSpace(m[2]);
      if (/[а-яё]/.test(ru) && /^[A-ZА-ЯI1ӘӏӀ]/.test(ing)) {
        // ok
      } else if (/[а-яё]/.test(ing) && /^[A-ZА-ЯI1ӘӏӀ]/.test(ru)) {
        [ru, ing] = [ing, ru];
      } else continue;
      if (!/[а-яё]{2,}/.test(ru)) continue;
      const key = `${ru}|${ing}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ru, ing });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function extractAffixesFromSection(section) {
  const affixes = [];
  const title = section.titleRu || "";
  const body = section.bodyRu || "";

  const titleDedicated =
    title.match(/^Префикс(?:ы)?\s+([-–—]?[а-яёӀI'ьъ\/]+)/i) ||
    title.match(/^Суффикс(?:ы)?\s+([-–—]?[а-яёӀI'ьъ\/]+)/i);
  if (titleDedicated) {
    const a = titleDedicated[1].replace(/^[-–—]/, "").trim();
    if (a.length >= 2 && a.length <= 16) return [a];
  }

  const titleM = title.match(/(?:Префикс|Суффикс|префикс|суффикс)[а-яё\s]*([-–—]?[а-яёӀI'ьъ\/]+)/i);
  if (titleM) {
    const a = titleM[1].replace(/^[-–—]/, "").trim();
    if (a.length >= 2 && a.length <= 16) affixes.push(a);
  }
  const re = /(?:префикс|суффикс)[а-яё\s]*([-–—][а-яёӀI'ьъ\/]{1,14})/gi;
  let m;
  while ((m = re.exec(body))) {
    const a = m[1].replace(/^[-–—]/, "").trim();
    if (a.length >= 2 && a.length <= 16 && !affixes.includes(a)) affixes.push(a);
  }
  return affixes.slice(0, 15);
}

function buildAffixInventory(sections) {
  const out = [];
  const seen = new Set();
  for (const s of sections) {
    const affixes = extractAffixesFromSection(s);
    if (!affixes.length) continue;
    const kind = /префикс/i.test(s.titleRu) ? "prefix" : /суффикс/i.test(s.titleRu) ? "suffix" : "affix";
    for (const form of affixes) {
      const key = `${kind}|${form}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `morph_affix_${out.length + 1}`,
        form,
        kind,
        paragraph: s.paragraph,
        sectionId: s.id,
        titleRu: s.titleRu,
        part: s.part
      });
    }
  }
  return out;
}

function dedupeRefForSection(section) {
  const n = section.paragraph;
  if (n >= 1 && n <= 7) return "grammar-overview:phonetics (morpheme basics elsewhere)";
  if (n >= 62 && n <= 63) return "grammar-overview:vigesimal_numerals, desheriev_numerals_derived";
  if (n >= 64 && n <= 65) return "declensions.json:pronouns";
  return null;
}

function parseMorphemikaText(text) {
  const sections = splitParagraphSections(text).map((s) => ({
    ...s,
    examples: extractExamples(s.bodyRu),
    affixes: extractAffixesFromSection(s),
    dedupeRef: dedupeRefForSection(s),
    sourceRef: `barakhoeva2020:§${s.paragraph}`
  }));
  const affixes = buildAffixInventory(sections);
  const stats = {
    sections: sections.length,
    totalChars: sections.reduce((n, s) => n + s.charCount, 0),
    examplesTotal: sections.reduce((n, s) => n + s.examples.length, 0),
    affixEntries: affixes.length,
    verbPrefixSections: sections.filter((s) => s.part === 8 && /префикс/i.test(s.titleRu)).length,
    parts: PART_BY_PARAGRAPH.map((p) => ({
      part: p.part,
      titleRu: p.titleRu,
      sectionCount: sections.filter((s) => s.part === p.part).length
    }))
  };
  return { sections, affixes, stats };
}

module.exports = {
  parseMorphemikaText,
  splitParagraphSections,
  PART_BY_PARAGRAPH
};
