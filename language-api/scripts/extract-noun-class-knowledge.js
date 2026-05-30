/**
 * Extract noun-class knowledge (ва/я/ба/да) from textbooks → noun-class-knowledge.json
 * PDFs live outside repo: ../../textbooks-ingush/
 *
 * Usage: node scripts/extract-noun-class-knowledge.js
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const pdfParse = require("pdf-parse");

const REPO_ROOT = path.join(__dirname, "..");
const EXTERNAL_ROOT = path.resolve(REPO_ROOT, "..", "..", "textbooks-ingush");
const OUT_PATH = path.join(REPO_ROOT, "data", "grammar", "noun-class-knowledge.json");
const USER_ENTRIES_PATH = path.join(REPO_ROOT, "data", "grammar", "noun-classes.json");

const SOURCES = [
  {
    id: "gramatika-5",
    extractDir: "gialgiai-metta-gramatika-5-klass-2010",
    title: "ГIалgIай метта грамматика, 5 класс (2010)",
    grades: [5],
    pdf: path.join(EXTERNAL_ROOT, "gialgiai-metta-gramatika-5-klass-2010", "source.pdf"),
    fallbackTxt: path.join(
      REPO_ROOT,
      "data/external/textbooks/gialgiai-metta-gramatika-5-klass-2010/_digitized/gialgiai-metta-gramatika-5-klass-2010.txt"
    )
  },
  {
    id: "gramatika-6-7",
    extractDir: "gialgiai-metta-gramatika-6-7-klass-2011",
    title: "ГIалgIай метта грамматика, 6–7 класс (2011)",
    grades: [6, 7],
    pdf: path.join(EXTERNAL_ROOT, "gialgiai-metta-gramatika-6-7-klass-2011", "source.pdf")
  },
  {
    id: "gramatika-8-9",
    extractDir: "gialgiai-metta-gramatika-8-9-klass-2011",
    title: "ГIалgIай метта грамматика, 8–9 класс (2011)",
    grades: [8, 9],
    pdf: path.join(EXTERNAL_ROOT, "gialgiai-metta-gramatika-8-9-klass-2011", "source.pdf")
  },
  {
    id: "praktikum-1988",
    extractDir: "gialgaj-mott-iomabara-praktikum-1988",
    title: "ГIалgIай мотт Iомабара практикум (1988)",
    grades: null,
    pdf: path.join(EXTERNAL_ROOT, "gialgaj-mott-iomabara-praktikum-1988", "source.pdf")
  },
  {
    id: "mott-2-ocr",
    extractDir: "gialgaj-mott-2-klass-2017",
    title: "ГIалgIай мотт, 2 класс (2017, OCR)",
    grades: [2],
    fallbackTxt: path.join(
      REPO_ROOT,
      "data/external/textbooks/gialgaj-mott-2-klass-2017/_digitized/gialgaj-mott-2-klass-2017.txt"
    )
  }
];

/** Явные пометки из практикума и ключевых § */
const SEED_PAREN = [
  { ing: "къонах", marker: "va", sourceRef: "praktikum-1988:6classes" },
  { ing: "сесаг", marker: "ya", sourceRef: "praktikum-1988:6classes" },
  { ing: "хи", marker: "ba", sourceRef: "praktikum-1988:6classes" },
  { ing: "хий", marker: "da", sourceRef: "praktikum-1988:6classes" },
  { ing: "ювргIа", marker: "ba", sourceRef: "gramatika-6-7:upr88" },
  { ing: "форд", marker: "ba", sourceRef: "gramatika-6-7:§20", note: "легар, III группа" },
  { ing: "мангал", marker: "ba", sourceRef: "gramatika-6-7:§20" },
  { ing: "малх", marker: "ba", sourceRef: "gramatika-6-7:§20" },
  { ing: "мотт", marker: "ba", sourceRef: "gramatika-6-7:§20", note: "легар мотт—метта" }
];

/** §40 table — authoritative seed from grammar 5 */
const S40_TABLE = [
  { ing: "к1aьнк", markerSg: "va", markerPl: "ba", classHint: "1" },
  { ing: "йи1иг", markerSg: "ya", markerPl: "ya", classHint: "2" },
  { ing: "несарий", markerSg: "ya", markerPl: "ba", classHint: "2/3" },
  { ing: "говр", markerSg: "ya", markerPl: "ya", classHint: "2" },
  { ing: "бов", markerSg: "ya", markerPl: "ya", classHint: "2" },
  { ing: "бер", markerSg: "da", markerPl: "da", classHint: "3-4" },
  { ing: "кор", markerSg: "da", markerPl: "da", classHint: "3-4" },
  { ing: "1аж", markerSg: "ba", markerPl: "ba", classHint: "3" },
  { ing: "кхор", markerSg: "ba", markerPl: "ba", classHint: "3" },
  { ing: "гIайба", markerSg: "ba", markerPl: "da", classHint: "3", flipBaDa: true },
  { ing: "сармак", markerSg: "ba", markerPl: "da", classHint: "3", flipBaDa: true },
  { ing: "да-нана", markerSg: "da", markerPl: null, classHint: "4", compound: true },
  { ing: "вошa-ишa", markerSg: "da", markerPl: null, classHint: "4", compound: true },
  { ing: "ков-карт", markerSg: "da", markerPl: null, classHint: "4", compound: true }
];

const MARKER_FORMS = {
  va: { copula: ["вар", "ва"], label: "ва" },
  ya: { copula: ["яр", "бу", "я"], label: "я" },
  ba: { copula: ["бай", "ба"], label: "ба" },
  da: { copula: ["ду", "да", "денна", "деннад"], label: "да" }
};

const COMPOSER_RULES = [
  {
    id: "existential_ba",
    kind: "copula_agreement",
    marker: "ba",
    summaryRu: "Существование/наличие: … бай ба / … беш ба",
    predicatePattern: "{stem} бай ба",
    whenRu: "Подлежащее 3-го класса, ед.ч. (часто неодушевл.)",
    sourceRefs: ["gramatika-5:§40", "user:upr23"],
    confidence: "high"
  },
  {
    id: "existential_da",
    kind: "copula_agreement",
    marker: "da",
    summaryRu: "Существование/наличие: … ду да / … беш да",
    predicatePattern: "{stem} ду да",
    whenRu: "Подлежащее 4-го класса или мн.ч. после ba→da",
    sourceRefs: ["gramatika-5:§40", "user:upr23"],
    confidence: "high"
  },
  {
    id: "existential_ya",
    kind: "copula_agreement",
    marker: "ya",
    summaryRu: "Существование/наличие: … бу я / … беш я",
    predicatePattern: "{stem} бу я",
    whenRu: "Подлежащее 2-го класса (я)",
    sourceRefs: ["gramatika-5:§40"],
    confidence: "high"
  },
  {
    id: "existential_va",
    kind: "copula_agreement",
    marker: "va",
    summaryRu: "Существование/наличие: … вар ва (муж. класс)",
    predicatePattern: "{stem} вар ва",
    whenRu: "Подлежащее 1-го класса (ва), часто одушевл. м.р.",
    sourceRefs: ["gramatika-5:§40"],
    confidence: "high"
  },
  {
    id: "plural_ba_to_da",
    kind: "number_flip",
    marker: "da",
    summaryRu: "Мн.ч. многих слов с -ба в ед.: сказуемие на -да",
    whenRu: "лоам→лоамаш, никъa→някъаш, гIайба→гIайбаш и т.п.",
    sourceRefs: ["gramatika-5:§40", "user:upr23"],
    confidence: "partial",
    exceptions: ["боал/боалаш — оба -ба"]
  },
  {
    id: "compound_da",
    kind: "morphology",
    marker: "da",
    summaryRu: "Сложные с -да-, -нана- часто класс D",
    whenRu: "да-нана, вошa-ишa, ков-карт",
    sourceRefs: ["gramatika-5:§40"],
    confidence: "textbook"
  },
  {
    id: "lookup_not_phonology",
    kind: "constraint",
    summaryRu: "Класс не выводится по последней букве — только по словарю",
    sourceRefs: ["user:upr23"],
    confidence: "high"
  }
];

function normIng(s) {
  return String(s || "")
    .replace(/[1lI]/g, (c) => (c === "1" ? "1" : c))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugId(s) {
  return normIng(s).replace(/[^a-zа-яё0-9]/gi, "_").replace(/_+/g, "_").slice(0, 48);
}

function markerFromRu(raw) {
  const m = String(raw || "").toLowerCase().replace(/\s/g, "");
  if (m === "ва" || m === "в") return "va";
  if (m === "я" || m === "й") return "ya";
  if (m === "ба" || m === "б") return "ba";
  if (m === "да" || m === "д") return "da";
  return null;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[Ӏ]/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadText(source) {
  const extractDir = path.join(EXTERNAL_ROOT, source.extractDir || source.id, "_extracted");
  const cachedTxt = path.join(extractDir, "text.txt");

  if (source.pdf && fs.existsSync(source.pdf)) {
    if (!fs.existsSync(cachedTxt) || fs.statSync(cachedTxt).size < 1000) {
      const buf = fs.readFileSync(source.pdf);
      const parsed = await pdfParse(buf);
      if (parsed.text && parsed.text.replace(/\s/g, "").length > 500) {
        await fsp.mkdir(extractDir, { recursive: true });
        await fsp.writeFile(cachedTxt, parsed.text, "utf8");
      }
    }
  }
  if (fs.existsSync(cachedTxt) && fs.statSync(cachedTxt).size > 1000) {
    return { text: fs.readFileSync(cachedTxt, "utf8"), from: "cache" };
  }
  if (source.fallbackTxt && fs.existsSync(source.fallbackTxt)) {
    return { text: fs.readFileSync(source.fallbackTxt, "utf8"), from: "fallback" };
  }
  return { text: "", from: "missing" };
}

function extractParenMarkers(text, sourceId) {
  const out = [];
  const seen = new Set();
  const t = normalizeText(text);

  const re = /([а-яА-ЯёЁI1\-]{2,30})\s*\(\s*(ва|я|ба|да)\s*\)/giu;
  let m;
  while ((m = re.exec(t)) !== null) {
    const head = m[1].trim();
    const marker = markerFromRu(m[2]);
    if (!marker || head.length < 2) continue;
    if (/^(д|в|б|ц|к|х|ш|т|м|н|г|л|р|с|п|ф|у|о|а|е|и|ю|я)$/i.test(head)) continue;
    const key = `${normIng(head)}|${marker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      headIng: head,
      marker,
      snippetIng: m[0].trim(),
      sourceRef: `${sourceId}:paren`,
      confidence: "textbook_paren"
    });
  }

  // к1aьнк(ва), ии1иг(я) без пробела
  const tightRe = /([а-яА-ЯёЁI1\-]{2,30})\(\s*(ва|я|ба|да)\s*\)/giu;
  while ((m = tightRe.exec(t)) !== null) {
    const head = m[1].trim();
    const marker = markerFromRu(m[2]);
    if (!marker) continue;
    const key = `${normIng(head)}|${marker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      headIng: head,
      marker,
      snippetIng: m[0].trim(),
      sourceRef: `${sourceId}:paren-tight`,
      confidence: "textbook_paren"
    });
  }

  return out;
}

function extractExamplesFromText(text, sourceId) {
  const examples = [];
  const seen = new Set();
  const t = normalizeText(text);

  examples.push(...extractParenMarkers(t, sourceId));

  const tripletRe =
    /([А-ЯA-ZIЁ][а-яa-zёI1ЪъЬь\-]{1,30})\s+(бай|ду|бу|вар|яр|денна|деннад|беш|хил|хул)\s+(ба|да|я|ва)\b/giu;
  let m;
  while ((m = tripletRe.exec(t)) !== null) {
    const head = m[1].trim();
    const marker = markerFromRu(m[3]);
    if (!marker || head.length < 2) continue;
    const snippet = m[0].trim();
    const key = `${normIng(head)}|${marker}|${snippet.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push({
      id: `ex_${sourceId}_${slugId(head)}_${examples.length}`,
      headIng: head,
      marker,
      snippetIng: snippet,
      sourceRef: `${sourceId}:copula`,
      confidence: "extracted"
    });
  }

  const endPredRe =
    /\b([а-яА-ЯI1\-]{3,28})\s+(ба|да|я|ва)\b(?=[\s.,;:!?«»\-—)]|$)/giu;
  while ((m = endPredRe.exec(t)) !== null) {
    const head = m[1].trim();
    const marker = markerFromRu(m[2]);
    if (!marker) continue;
    if (/^(мотт|метт|класс|легар|дожар|таьрахь|белгал|деш|хул|хил|беш|денна)$/i.test(head)) continue;
    const key = `end|${normIng(head)}|${marker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push({
      id: `ex_${sourceId}_${slugId(head)}_${examples.length}`,
      headIng: head,
      marker,
      snippetIng: m[0].trim(),
      sourceRef: `${sourceId}:end-pred`,
      confidence: "extracted_weak"
    });
  }

  return examples;
}

function extractWordLists(text, sourceId) {
  const lists = [];
  const re = /белгал[а-я]*[^.\n]{0,80}?([А-ЯA-ZIЁ][а-яa-zёI1,\s\-]{10,200})/giu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const chunk = m[1];
    const words = chunk
      .split(/[,;]\s*|\s{2,}/)
      .map((w) => w.replace(/[^\u0400-\u04FFI1a-z\-]/gi, "").trim())
      .filter((w) => w.length >= 2 && w.length <= 25);
    if (words.length >= 3) {
      lists.push({ sourceRef: `${sourceId}:белгал`, words: [...new Set(words)].slice(0, 30) });
    }
  }
  return lists;
}

function mergeEntries(userData, allExamples, wordLists) {
  const byIng = new Map();

  function upsert(ing, patch) {
    const key = normIng(ing);
    if (!key) return;
    const cur = byIng.get(key) || {
      id: `nc_${slugId(ing)}`,
      ing,
      ru: null,
      markerSg: null,
      markerPl: null,
      numberDefault: "sg",
      flipBaDa: false,
      compound: false,
      sources: [],
      examples: [],
      composerRuleIds: [],
      reviewStatus: "draft"
    };
    Object.assign(cur, { ...patch, ing: cur.ing || ing });
    byIng.set(key, cur);
  }

  for (const row of S40_TABLE) {
    upsert(row.ing, {
      markerSg: row.markerSg,
      markerPl: row.markerPl || undefined,
      flipBaDa: !!row.flipBaDa,
      compound: !!row.compound,
      grammaticalClass: row.classHint,
      sources: [{ book: "gramatika-5", ref: "§40", verified: "textbook" }],
      reviewStatus: "textbook_verified"
    });
    if (row.markerPl && row.markerPl !== row.markerSg) {
      upsert(row.ing, { flipBaDa: true });
    }
  }

  for (const row of SEED_PAREN) {
    upsert(row.ing, {
      markerSg: row.marker,
      sources: [{ book: row.sourceRef.split(":")[0], ref: row.sourceRef, verified: "textbook" }],
      note: row.note,
      reviewStatus: "textbook_verified"
    });
  }

  if (userData?.entries) {
    for (const e of userData.entries) {
      upsert(e.ing, {
        ru: e.ru || undefined,
        markerSg: e.marker || e.markerSg,
        markerPl: e.pluralMarker || e.markerPl,
        flipBaDa: e.flipBaDa,
        sources: [{ book: e.source || "user", ref: `grade-${e.grade}`, verified: "user" }],
        reviewStatus: "user_verified"
      });
      if (e.example) {
        const ex = {
          id: `ex_user_${slugId(e.ing)}`,
          snippetIng: e.example,
          sourceRef: "user",
          confidence: "verified"
        };
        const cur = byIng.get(normIng(e.ing));
        if (cur && !cur.examples.some((x) => x.snippetIng === e.example)) {
          cur.examples.push(ex);
        }
      }
    }
  }

  for (const ex of allExamples) {
    const key = normIng(ex.headIng);
    const cur = byIng.get(key);
    if (!cur) {
      upsert(ex.headIng, {
        markerSg: ex.marker,
        sources: [{ book: ex.sourceRef.split(":")[0], ref: ex.sourceRef, verified: "draft" }],
        reviewStatus: ex.confidence === "textbook_paren" ? "needs_review" : "auto_extracted"
      });
    }
    const entry = byIng.get(normIng(ex.headIng));
    if (entry && entry.examples.length < 8 && !entry.examples.some((x) => x.snippetIng === ex.snippetIng)) {
      entry.examples.push({
        id: ex.id || `ex_${slugId(ex.headIng)}_${entry.examples.length}`,
        snippetIng: ex.snippetIng,
        marker: ex.marker,
        sourceRef: ex.sourceRef,
        confidence: ex.confidence
      });
    }
    if (entry && !entry.markerSg && ex.confidence !== "extracted_weak") {
      entry.markerSg = ex.marker;
    }
    if (entry && ex.confidence === "textbook_paren" && entry.reviewStatus === "auto_extracted") {
      entry.markerSg = ex.marker;
    }
  }

  for (const entry of byIng.values()) {
    const m = entry.markerSg;
    if (m && MARKER_FORMS[m]) {
      entry.composerRuleIds = COMPOSER_RULES.filter((r) => {
        if (r.marker !== m) return false;
        if (r.kind === "morphology" && !entry.compound) return false;
        if (r.kind === "number_flip" && !entry.flipBaDa) return false;
        return r.kind === "copula_agreement" || r.kind === "morphology" || r.kind === "number_flip";
      }).map((r) => r.id);
    }
    entry.composerRuleIds = [...new Set(entry.composerRuleIds || [])];
  }

  return [...byIng.values()].sort((a, b) => a.ing.localeCompare(b.ing, "ru"));
}

async function main() {
  const userData = JSON.parse(fs.readFileSync(USER_ENTRIES_PATH, "utf8"));
  const sourceReports = [];
  const allExamples = [];
  const allWordLists = [];

  for (const src of SOURCES) {
    const { text, from } = await loadText(src);
    sourceReports.push({
      id: src.id,
      title: src.title,
      textFrom: from,
      chars: text.length,
      loaded: text.length > 500
    });
    if (text.length > 500) {
      allExamples.push(...extractExamplesFromText(text, src.id));
      allWordLists.push(...extractWordLists(text, src.id));
    }
  }

  const entries = mergeEntries(userData, allExamples, allWordLists);

  const out = {
    schema: "noun-class-knowledge/v1",
    status: "draft_for_review",
    purpose: "Справочник для согласования сказуемого; composer ссылается на ruleId и example id",
    externalTextbooksRoot: EXTERNAL_ROOT,
    noteGit: "PDF лежат в textbooks-ingush/ рядом с репо — GitHub Desktop не видит",
    generatedAt: new Date().toISOString(),
    composerRules: COMPOSER_RULES,
    sources: sourceReports,
    wordListsFromExercises: allWordLists.slice(0, 40),
    stats: {
      entries: entries.length,
      withExamples: entries.filter((e) => e.examples?.length).length,
      withUserVerified: entries.filter((e) => e.sources?.some((s) => s.verified === "user")).length,
      extractedExamples: allExamples.length,
      rules: COMPOSER_RULES.length
    },
    entries
  };

  await fsp.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  process.stdout.write(`Wrote ${OUT_PATH}\n`);
  process.stdout.write(
    `Entries: ${out.stats.entries}, with examples: ${out.stats.withExamples}, extracted snippets: ${out.stats.extractedExamples}\n`
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
