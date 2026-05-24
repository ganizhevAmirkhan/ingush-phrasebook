const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "data", "external", "ghalghay");
const OUT = path.join(ROOT, "extracted");

const SOURCE_TITLES = {
  КиплРикк: "Р. Киплинг — Рикки-Тикки-Тави (пер. Мальсагова)",
  ТургМуму: "И. С. Тургенев — Муму",
  СловоОПолкуИ: "Слово о полку Игореве",
  ПуБелкБршн: "А. С. Пушкин — Барышня-крестьянка",
  СвифтЛилл: "Дж. Свифт — Гулливер у лилипутов",
  ПуМоцИСаль: "А. С. Пушкин — Моцарт и Сальери",
  КапДочк: "А. С. Пушкин — Капитанская дочка",
  "Тургенев И. С. «Муму»": "И. С. Тургенев — Муму"
};

const SOURCE_SLUGS = {
  КиплРикк: "kipl_rikk",
  ТургМуму: "turg_mumu",
  "Тургенев И. С. «Муму»": "turg_mumu",
  СловоОПолкуИ: "slovo_polku",
  ПуБелкБршн: "pushkin_belka",
  СвифтЛилл: "swift_lilliput",
  ПуМоцИСаль: "pushkin_mozart",
  КапДочк: "pushkin_kapitanskaya"
};

const PREFERRED_LEX_SOURCES = new Set([
  "KUR05", "KOD21", "UZH27", "NIC04", "IRT16", "IRSNS", "KOD18", "ANT21", "MED19"
]);

function stripHtml(value) {
  return (value || "")
    .toString()
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJsArray(filePath) {
  const raw = require("node:fs").readFileSync(filePath, "utf8");
  const fn = new Function(`${raw}\nreturn allData;`);
  const data = fn();
  if (!Array.isArray(data)) throw new Error(`allData is not an array in ${filePath}`);
  return data;
}

function sourceCodeFromTag(tagHtml) {
  const m = (tagHtml || "").match(/<([a-z0-9]+)>/i);
  if (!m) return "";
  return m[1].toUpperCase();
}

function extractIngHead(ingHtml) {
  const text = stripHtml(ingHtml);
  if (!text) return "";
  const first = text.split(/\r?\n/)[0].trim();
  const bold = (ingHtml || "").match(/<b>([^<]+)<\/b>/i);
  if (bold) return bold[1].replace(/\s+/g, " ").trim();
  return first.replace(/\s*\(.+\)$/, "").trim();
}

function extractRuGloss(ruHtml) {
  const text = stripHtml(ruHtml);
  if (!text) return "";
  const firstLine = text.split(/\r?\n/)[0].trim();
  return firstLine
    .replace(/^\d+\)\s*/, "")
    .replace(/^~\s*/, "")
    .replace(/\s*\(.+\)$/i, "")
    .trim();
}

function posFromTag(posHtml) {
  const text = stripHtml(posHtml).toLowerCase();
  if (!text || text === "<j>") return "";
  if (text.includes("глаг") || text.includes("ханд")) return "verb";
  if (text.includes("прил") || text.includes("белг") || text.includes("белг")) return "adj";
  if (text.includes("нареч") || text.includes("куцд")) return "adv";
  if (text.includes("числ")) return "numeral";
  if (text.includes("мест") || text.includes("цӀерм")) return "pronoun";
  if (text.includes("сущ") || text.includes("цӀерд")) return "noun";
  if (text.includes("предл") || text.includes("союз") || text.includes("част") || text.includes("межд")) {
    return "particle";
  }
  return "term";
}

function isFunctionalPos(posHtml) {
  const text = stripHtml(posHtml).toLowerCase();
  return /предл|союз|част|межд|послелог/.test(text);
}

function corpusSlug(code) {
  if (SOURCE_SLUGS[code]) return SOURCE_SLUGS[code];
  return Buffer.from(code, "utf8").toString("hex").slice(0, 16);
}

function normalizeRuKey(ru) {
  return ru
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[.,!?;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGoodLexeme(ru, ing, sourceCode) {
  if (!ru || !ing) return false;
  if (ru.length > 80 || ing.length > 80) return false;
  if (/[<>]/.test(ru) || /[<>]/.test(ing)) return false;
  if (ru.split(" ").length > 6) return false;
  if (/^(имя|терм|лат\.|англ\.)/i.test(ru)) return false;
  if (!PREFERRED_LEX_SOURCES.has(sourceCode)) return false;
  return true;
}

function buildLexemes(dictRows, { curated = false } = {}) {
  const out = [];
  const seen = new Set();

  for (const row of dictRows) {
    const sourceCode = sourceCodeFromTag(row.a);
    const ing = extractIngHead(row.b);
    const ru = extractRuGloss(row.d);
    if (!isGoodLexeme(ru, ing, sourceCode)) continue;

    if (curated) {
      if (!(row.b || "").includes("<b>")) continue;
      if (isFunctionalPos(row.c)) continue;
      if (ing.length < 2 || ru.length < 3) continue;
      if (ru.split(" ").length > 3) continue;
      const liCount = ((row.d || "").match(/<li>/gi) || []).length;
      if (liCount > 2) continue;
      const pos = posFromTag(row.c);
      if (pos === "particle" || pos === "pronoun") continue;
    }

    const key = `${normalizeRuKey(ru)}|${ing.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ru,
      pos: posFromTag(row.c) || "noun",
      forms: { base: ing, dat: ing },
      source: `ghalghay:${sourceCode.toLowerCase()}`,
      confidence: sourceCode === "KUR05" || sourceCode === "KOD21" ? "high" : "medium"
    });
  }

  return out;
}

function buildParallelCorpus(parallelRows) {
  const groups = new Map();

  for (const row of parallelRows) {
    const code = (row.e || "unknown").toString().trim();
    const ing = stripHtml(row.b);
    const ru = stripHtml(row.d);
    if (!ing || !ru) continue;
    if (ing.startsWith("Р.") && ru.startsWith("Р.")) continue;
    if (ing.length < 3 || ru.length < 3) continue;

    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push({ ru, ing });
  }

  const docs = [];
  for (const [code, paragraphs] of groups.entries()) {
    if (paragraphs.length < 5) continue;
    const slug = corpusSlug(code);
    const id = `ghalghay_${slug}`;
    docs.push({
      id,
      title: SOURCE_TITLES[code] || `GHALGHAY parallel: ${code}`,
      level: "B1",
      genre: "story",
      source: "ghalghay.github.io",
      paragraphs,
      glossary: []
    });
  }

  docs.sort((a, b) => b.paragraphs.length - a.paragraphs.length);
  return docs;
}

async function mergeCuratedLexemes(curatedLexemes) {
  const lexPath = path.join(__dirname, "..", "data", "grammar", "lexemes.json");
  const current = JSON.parse(await fs.readFile(lexPath, "utf8"));
  const existing = Array.isArray(current?.lexemes) ? current.lexemes : [];
  const known = new Set(existing.map((x) => normalizeRuKey(x.ru)));

  const added = [];
  for (const item of curatedLexemes) {
    if (item.confidence !== "high") continue;
    if (!["noun", "verb", "adj", "adv"].includes(item.pos)) continue;
    if (item.ru.split(" ").length !== 1) continue;
    if (item.forms.base.length < 2 || item.forms.base.length > 24) continue;
    if (/[|<>]/.test(item.forms.base)) continue;

    const key = normalizeRuKey(item.ru);
    if (!key || known.has(key)) continue;
    known.add(key);
    added.push({
      ru: item.ru,
      pos: item.pos,
      forms: item.forms,
      notes: `imported from ${item.source}`
    });
  }

  if (!added.length) return { added: 0, total: existing.length };

  current.lexemes = [...existing, ...added];
  await fs.writeFile(lexPath, JSON.stringify(current, null, 2), "utf8");
  return { added: added.length, total: current.lexemes.length };
}

async function publishCorpusDocs(corpusDocs) {
  const storiesDir = path.join(__dirname, "..", "data", "corpus", "stories");
  await fs.mkdir(storiesDir, { recursive: true });
  for (const doc of corpusDocs) {
    const file = path.join(storiesDir, `${doc.id}.json`);
    await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf8");
  }
}

async function main() {
  const dictRows = parseJsArray(path.join(ROOT, "src_data.js"));
  const parallelRows = parseJsArray(path.join(ROOT, "src_parall_data.js"));

  const lexemesFull = buildLexemes(dictRows, { curated: false });
  const lexemesCurated = buildLexemes(dictRows, { curated: true });
  const corpusDocs = buildParallelCorpus(parallelRows);

  await fs.mkdir(path.join(OUT, "corpus"), { recursive: true });

  await fs.writeFile(
    path.join(OUT, "lexemes_ghalghay_full.json"),
    JSON.stringify({ lexemes: lexemesFull }, null, 2),
    "utf8"
  );

  await fs.writeFile(
    path.join(OUT, "lexemes_ghalghay_curated.json"),
    JSON.stringify({ lexemes: lexemesCurated }, null, 2),
    "utf8"
  );

  for (const doc of corpusDocs) {
    const file = path.join(OUT, "corpus", `${doc.id}.json`);
    await fs.writeFile(file, JSON.stringify(doc, null, 2), "utf8");
  }

  await publishCorpusDocs(corpusDocs);

  let mergeResult = { added: 0, skipped: true };
  if (process.env.MERGE_LEXEMES === "1") {
    mergeResult = await mergeCuratedLexemes(lexemesCurated);
  }

  const summary = {
    dictRows: dictRows.length,
    parallelRows: parallelRows.length,
    lexemesFull: lexemesFull.length,
    lexemesCurated: lexemesCurated.length,
    lexemesMerged: mergeResult,
    corpusDocs: corpusDocs.length,
    corpusParagraphs: corpusDocs.reduce((n, d) => n + d.paragraphs.length, 0),
    topCorpus: corpusDocs.map((d) => ({
      id: d.id,
      title: d.title,
      paragraphs: d.paragraphs.length
    }))
  };

  await fs.writeFile(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 1;
});
