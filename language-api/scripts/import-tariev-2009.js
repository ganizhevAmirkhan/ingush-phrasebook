/**
 * Import «ГӀалгӀай-эрсий дошлорг» (Бекова, Дударов, Илиева, Мальсагова, Тариева; Нальчик, 2009).
 * Parses morphology (verb 4-form paradigms, noun class/stems), examples with ~.
 *
 * Usage: node scripts/import-tariev-2009.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const morph = require("./lib/tariev-2009-morph");
const GRAMMAR_RULES = require("../data/grammar/tariev-2009-grammar-rules.json");

const ROOT = path.join(__dirname, "..");
const EXTERNAL = path.join(ROOT, "data", "external", "tariev-2009");
const OUT_FILE = path.join(ROOT, "data", "dictionary", "tariev-2009.json");
const KNOWLEDGE_FILE = path.join(ROOT, "data", "grammar", "tariev-2009-knowledge.json");
const DEFAULT_DOCX = path.join(EXTERNAL, "source.docx");
const EXTRACT_SCRIPT = path.join(__dirname, "extract-docx-text.js");

const POS_RE =
  "(сущ\\.|глаг\\.|прил\\.|нареч\\.|числ\\.|межд\\.|ввод\\.|понуд\\.|потенц\\.|масд\\.|прич\\.|сокр\\.|уст\\.|рел\\.|обр\\.|предл\\.|союз\\.|част\\.)";

const ENTRY_RE = new RegExp(
  `([А-ЯЁ][А-ЯЁ0-9Ӏ1* ]{0,34}?)\\s*(\\d+)?\\s*((?:\\([^)]+\\)\\s*){0,3})(${POS_RE})`,
  "g"
);

const POS_MAP = {
  "сущ.": "noun",
  "глаг.": "verb",
  "прил.": "adj",
  "нареч.": "adv",
  "числ.": "num",
  "межд.": "interj",
  "ввод.": "particle",
  "понуд.": "causative",
  "потенц.": "potential",
  "масд.": "masdar",
  "прич.": "participle",
  "сокр.": "abbrev",
  "уст.": "archaic",
  "рел.": "religious",
  "обр.": "figurative",
  "предл.": "postposition",
  "союз.": "conjunction",
  "част.": "particle"
};

function ensureExtracted(docxPath) {
  const textPath = path.join(EXTERNAL, "extracted-raw.txt");
  if (!fs.existsSync(docxPath)) throw new Error(`DOCX not found: ${docxPath}`);
  const docxStat = fs.statSync(docxPath);
  if (!fs.existsSync(textPath) || fs.statSync(textPath).mtimeMs < docxStat.mtimeMs) {
    execSync(`node "${EXTRACT_SCRIPT}" "${docxPath}" "${textPath}"`, {
      stdio: "inherit",
      cwd: ROOT
    });
  }
  return textPath;
}

function findBodyStart(text) {
  for (const m of ["ДЕШДАКЪА сущ.", "А а ", "АБА"]) {
    const i = text.indexOf(m);
    if (i > 0) return i;
  }
  return text.indexOf("ДЕШДАКЪА");
}

function stripObliqueStems(gloss) {
  return gloss
    .replace(/^([а-яёa-z\-]+(?:\s*,\s*[а-яёa-z\-]+){1,4})\s+(?=[а-яёА-ЯЁ])/i, "")
    .trim();
}

function splitRuMeanings(glossPart) {
  const clean = stripObliqueStems(
    glossPart
      .replace(/^(-\S+(?:\s*,\s*-\S+)*\s*,?\s*)+/g, "")
      .replace(/^[^а-яёА-ЯЁ]*\d+\.\s*/, "")
      .trim()
  );
  return clean
    .split(/\s*\/\/\s*/)
    .map((x) => x.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function extractExamples(tail, lemma, imperativeForm) {
  const examples = [];
  if (!tail) return examples;
  const resolveLemma = imperativeForm || lemma;

  const tildeRe = /([а-яёА-ЯЁI1Ӏ0-9\s\-]{0,50}?)~+\s*([^.;]{1,100}?)\.\s+([^.;]{5,200}?)(?=\.|;|$|[А-ЯЁ][А-ЯЁ0-9])/g;
  let m;
  while ((m = tildeRe.exec(tail)) !== null) {
    const prefix = m[1].trim();
    const suffix = m[2].trim();
    const ingFragment = prefix ? `${prefix} ~ ${suffix}` : `~ ${suffix}`;
    const resolved = `${prefix ? `${prefix} ` : ""}${resolveLemma}${suffix ? ` ${suffix}` : ""}`.trim();
    examples.push({
      ing: ingFragment,
      ingResolved: resolved,
      ru: m[3].trim(),
      kind: "tilde"
    });
  }

  const sentRe =
    /([а-яёА-ЯЁI1Ӏ][а-яёА-ЯЁI1Ӏ0-9\s\-]{2,60}?)\s*[-–—]\s*[^.]{1,40}\.\s+([А-ЯЁ][^.]{8,180}?\.)/g;
  while ((m = sentRe.exec(tail)) !== null) {
    examples.push({ ing: m[1].trim(), ru: m[2].trim(), kind: "sentence" });
  }

  const phraseRe = /([а-яёА-ЯЁI1Ӏ][а-яёА-ЯЁI1Ӏ0-9\s\-]{2,55})\.\s+([А-ЯЁ][а-яёА-ЯЁI1Ӏ\s\-]{8,180}?\.)/g;
  while ((m = phraseRe.exec(tail)) !== null) {
    const ing = m[1].trim();
    if (/^(сущ|глаг|прил|нареч)/.test(ing)) continue;
    examples.push({ ing, ru: m[2].trim(), kind: "phrase" });
  }

  const compactRe =
    /^([а-яёӀI1][а-яёА-ЯЁI1Ӏ0-9\s\-]{1,50}?)\s+([А-ЯЁ][а-яёА-ЯЁI1Ӏ\s\-]{6,120}?)\.(?=[А-ЯЁ]|$)/;
  const compact = tail.match(compactRe);
  if (compact) {
    examples.push({ ing: compact[1].trim(), ru: compact[2].trim(), kind: "phrase" });
  }

  const seen = new Set();
  return examples
    .filter((ex) => {
      const k = `${ex.ing}|${ex.ru}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 12);
}

function parseParenGroupsFromRaw(raw) {
  const groups = [];
  let rest = raw.trim();
  while (rest.startsWith("(")) {
    const end = rest.indexOf(")");
    if (end < 0) break;
    groups.push(morph.splitParenForms(rest.slice(1, end)));
    rest = rest.slice(end + 1).trim();
  }
  return groups;
}

function parseEntryChunk(pos, parenRaw, chunk, lemma) {
  const posKey = pos.replace(/\.$/, "");
  const posEn = POS_MAP[pos] || posKey;

  if (posEn === "verb" || posEn === "causative" || posEn === "potential") {
    const groups = parseParenGroupsFromRaw(parenRaw);
    const { classAgreement, paradigm } = morph.parseVerbParenGroups(groups);
    const semi = chunk.indexOf(";");
    const tagPart = semi >= 0 ? chunk.slice(0, semi) : chunk;
    const tail = semi >= 0 ? chunk.slice(semi + 1).trim() : "";
    const meanings = splitRuMeanings(
      tagPart.replace(/^(однократн\.\s*действ,?\s*|многократн\.\s*действ,?\s*|субъект в ед\.\s*ч\.\s*|объект в ед\.\s*ч\.\s*)+/gi, "")
    );
    return {
      ru: meanings[0] || null,
      ruAll: meanings,
      verbTags: morph.parseVerbTags(tagPart),
      derivedFrom: morph.parseDerivedFrom(tagPart),
      classAgreement,
      paradigm,
      examples: extractExamples(tail, lemma, paradigm?.imperative)
    };
  }

  if (posEn === "noun") {
    const semi = chunk.indexOf(";");
    const morphPart = semi >= 0 ? chunk.slice(0, semi) : chunk;
    const tail = semi >= 0 ? chunk.slice(semi + 1).trim() : "";
    const noun = morph.parseNounMorphology(morphPart);
    const meanings = splitRuMeanings(noun.glossRemainder || morphPart);
    return {
      ru: meanings[0] || null,
      ruAll: meanings,
      nounClass: noun.nounClass,
      citationForm: noun.citationForm,
      numberNote: noun.numberNote,
      stems: noun.stems,
      morphology: noun.raw,
      examples: extractExamples(tail, lemma, null)
    };
  }

  const semi = chunk.indexOf(";");
  const glossPart = semi >= 0 ? chunk.slice(0, semi) : chunk;
  const tail = semi >= 0 ? chunk.slice(semi + 1).trim() : "";
  const meanings = splitRuMeanings(glossPart);
  return {
    ru: meanings[0] || null,
    ruAll: meanings,
    examples: extractExamples(tail, lemma, null)
  };
}

function parseEntries(text) {
  const body = text.slice(findBodyStart(text));
  const spans = [];
  let m;
  while ((m = ENTRY_RE.exec(body)) !== null) {
    spans.push({
      head: m[1].trim(),
      homonym: m[2] ? Number(m[2]) : null,
      parenRaw: m[3] || "",
      pos: m[4],
      start: m.index,
      matchEnd: ENTRY_RE.lastIndex
    });
  }

  const items = [];
  for (let i = 0; i < spans.length; i += 1) {
    const cur = spans[i];
    const nextStart = i + 1 < spans.length ? spans[i + 1].start : body.length;
    const chunk = body.slice(cur.matchEnd, nextStart).trim();
    const parsed = parseEntryChunk(cur.pos, cur.parenRaw, chunk, cur.head);
    if (!parsed.ru) continue;

    items.push({
      id: `tar09_${items.length + 1}`,
      ing: cur.head,
      homonym: cur.homonym,
      pos: POS_MAP[cur.pos] || cur.pos.replace(/\.$/, ""),
      posRu: cur.pos.replace(/\.$/, ""),
      ru: parsed.ru,
      ruAll: parsed.ruAll,
      nounClass: parsed.nounClass || null,
      citationForm: parsed.citationForm || null,
      stems: parsed.stems || null,
      morphology: parsed.morphology || null,
      verbTags: parsed.verbTags || null,
      derivedFrom: parsed.derivedFrom || null,
      classAgreement: parsed.classAgreement || null,
      paradigm: parsed.paradigm || null,
      examples: parsed.examples,
      source: "tariev_2009"
    });
  }
  return items;
}

function buildKnowledge(items) {
  const verbs = items.filter((it) => it.paradigm && it.paradigm.byTense);
  const nouns = items.filter((it) => it.nounClass);
  const withTilde = items.filter((it) => it.examples.some((e) => e.kind === "tilde"));

  const pick = (list, n = 4) => list.slice(0, n);

  return {
    schema: "tariev-2009-knowledge/v2",
    source: "tariev-2009",
    authors: "Бекова А.И., Дударов У.Б., Илиева Ф.М., Мальсагова Л.Д., Тариева Л.У.",
    titleRu: "ГӀалгӀай-эрсий дошлорг (Ингушско-русский словарь, Нальчик, 2009)",
    noteRu:
      "Академический словарь БДИМТ (~24 000 статей в издании). Парсер v2: парадигмы глагола (4 формы), класс и стемы существительного, ~ в примерах.",
    grammarRulesRef: "data/grammar/tariev-2009-grammar-rules.json",
    stats: {
      entriesParsed: items.length,
      verbsWithParadigm: verbs.length,
      nounsWithClass: nouns.length,
      entriesWithTildeExamples: withTilde.length
    },
    sections: [
      {
        id: "tar_verb_paradigm",
        titleRu: "Глагольная парадигма (4 формы в скобках)",
        summaryRu: GRAMMAR_RULES.verbParadigm.orderRu.join(" → "),
        examples: pick(
          verbs.filter((it) => it.ing === "МУКЪАДАХА" || it.paradigm?.imperative),
          6
        ).map((it) => ({
          ing: it.ing,
          ru: it.ru,
          paradigm: it.paradigm,
          example: it.examples.find((e) => e.kind === "tilde") || it.examples[0]
        }))
      },
      {
        id: "tar_noun_class",
        titleRu: "Существительные: класс и основы",
        summaryRu: GRAMMAR_RULES.nounParadigm.patternRu,
        examples: pick(
          nouns.filter((it) => it.ing === "МУНДА" || (it.stems && it.stems.length >= 2)),
          6
        ).map((it) => ({
          ing: it.ing,
          ru: it.ru,
          nounClass: it.nounClass,
          stems: it.stems,
          example: it.examples[0]
        }))
      },
      {
        id: "tar_tilde_examples",
        titleRu: "Примеры с тильдой (~)",
        summaryRu: GRAMMAR_RULES.notation.tilde.ru,
        examples: pick(withTilde, 8).map((it) => ({
          ing: it.ing,
          ru: it.ru,
          example: it.examples.find((e) => e.kind === "tilde")
        }))
      }
    ]
  };
}

async function main() {
  const docx = process.argv.find((a) => a.startsWith("--docx="))?.slice(7) || DEFAULT_DOCX;
  const textPath =
    process.argv.find((a) => a.startsWith("--text="))?.slice(7) || ensureExtracted(docx);
  const raw = fs.readFileSync(textPath, "utf8");
  const items = parseEntries(raw);

  const out = {
    title: "ГӀалгӀай-эрсий дошлорг (2009)",
    authors: "Бекова А.И., Дударов У.Б., Илиева Ф.М., Мальсагова Л.Д., Тариева Л.У.",
    publisher: "БДИМТ им. Ч. Ахриева, Нальчик",
    source: "tariev_2009",
    direction: "ing-ru",
    grammarRulesFile: "data/grammar/tariev-2009-grammar-rules.json",
    parsedFrom: textPath,
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    verbsWithParadigm: items.filter((it) => it.paradigm).length,
    nounsWithClass: items.filter((it) => it.nounClass).length,
    items
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  fs.writeFileSync(KNOWLEDGE_FILE, `${JSON.stringify(buildKnowledge(items), null, 2)}\n`, "utf8");

  const sample = items.find((it) => it.ing === "МУКЪАДАХА") || items.find((it) => it.ing === "МУНДА");
  console.log(
    JSON.stringify(
      {
        itemCount: items.length,
        verbsWithParadigm: out.verbsWithParadigm,
        nounsWithClass: out.nounsWithClass,
        sample
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
