/**
 * Morphology parsers for Tarieva et al. 2009 dictionary microstructure.
 * Foreword order for finite verb (4 forms in parentheses):
 *   1 imperative/infinitive (повелительное ≈ инфинитив)
 *   2 present / converb stem (-ар, -ир, -елар…)
 *   3 past (-ад, -аьд, -ай, -еннад…)
 *   4 future factual ergative (-ргда, -ргва, -ргья, -ургда…)
 */

const CLASS_MARKERS = new Set([
  "вала",
  "бала",
  "яла",
  "ле",
  "ве",
  "бе",
  "е",
  "дала",
  "бала",
  "яла"
]);

const FUTURE_RE = /(?:ргда|ргва|ргья|ургда|лургда|ларгда)$/i;
const PAST_RE = /(?:аьд|адаьд|еннад|ийцад|еттад|еддад|ай|ад|ед|ид|ъад|над)$/i;
const PRESENT_RE = /(?:ар|ир|елар|алар|удар|йцар|йшар|оттар|эттар)$/i;

function splitParenForms(inner) {
  return inner
    .split(/,\s*/)
    .map((s) => s.replace(/\s+/g, "").trim())
    .filter(Boolean);
}

function isClassMarkerGroup(forms) {
  if (!forms.length || forms.length > 4) return false;
  return forms.every((f) => CLASS_MARKERS.has(f.toLowerCase()) || /^[вбяд]е?$/.test(f));
}

function classifyVerbForm(form) {
  const f = form.toLowerCase();
  if (FUTURE_RE.test(f)) return "future";
  if (PAST_RE.test(f)) return "past";
  if (PRESENT_RE.test(f)) return "present";
  return "imperative";
}

function parseVerbParadigmFour(forms) {
  if (forms.length !== 4) return null;
  const [f1, f2, f3, f4] = forms;
  return {
    imperative: f1,
    present: f2,
    past: f3,
    future: f4,
    byTense: {
      imperative: f1,
      present: f2,
      past: f3,
      future: f4
    },
    orderRu: "повелительное → настоящее (масдар/основа) → прошедшее → будущее (эргатив -ргда)"
  };
}

function parseParenGroupsBeforePos(text) {
  const groups = [];
  let rest = text.trim();
  while (rest.startsWith("(")) {
    const end = rest.indexOf(")");
    if (end < 0) break;
    groups.push(splitParenForms(rest.slice(1, end)));
    rest = rest.slice(end + 1).trim();
  }
  return { groups, rest };
}

function parseVerbParenGroups(groups) {
  let classAgreement = null;
  let paradigmForms = null;

  for (const g of groups) {
    if (isClassMarkerGroup(g)) {
      classAgreement = { markers: g, noteRu: "согласование по классу существительного (в/б/й/д)" };
    } else if (g.length === 4) {
      paradigmForms = parseVerbParadigmFour(g);
    } else if (g.length >= 2 && g.length <= 5 && !paradigmForms) {
      const mapped = {};
      for (const f of g) mapped[classifyVerbForm(f)] = mapped[classifyVerbForm(f)] || f;
      paradigmForms = { forms: g, byTense: mapped, partial: true };
    }
  }

  return { classAgreement, paradigm: paradigmForms };
}

function parseNounMorphology(blob) {
  let s = blob.trim();
  const out = {
    nounClass: null,
    citationForm: null,
    numberNote: null,
    stems: [],
    raw: null
  };

  const classM = s.match(/^([бдйвя])\s*\(([^)]+)\)/);
  if (classM) {
    out.nounClass = classM[1];
    out.citationForm = classM[2].trim();
    s = s.slice(classM[0].length).replace(/^,\s*/, "").trim();
  }

  if (/только в ед\.?\s*ч/.test(s)) out.numberNote = "sg-only";
  if (/только во мн\.?\s*ч/.test(s) || /мн\.?\s*ч/.test(s)) out.numberNote = out.numberNote || "pl-only";

  const stems = [];
  while (/^-\S+/.test(s)) {
    const m = s.match(/^(-\S+)/);
    stems.push(m[1].replace(/,$/, ""));
    s = s.slice(m[1].length).replace(/^,\s*/, "").trim();
  }
  out.stems = stems;

  const stemParen = s.match(/^\(([^)]+)\)/);
  if (stemParen && !out.citationForm) {
    out.citationForm = stemParen[1].trim();
    s = s.slice(stemParen[0].length).replace(/^,\s*/, "").trim();
  }

  out.raw = blob.trim();
  out.glossRemainder = s;
  return out;
}

function parseVerbTags(blob) {
  const tags = [];
  const t = blob.toLowerCase();
  if (/однократн/.test(t)) tags.push("semelfactive");
  if (/многократн/.test(t)) tags.push("iterative");
  if (/понуд/.test(t)) tags.push("causative");
  if (/потенц/.test(t)) tags.push("potential");
  if (/субъект в ед/.test(t)) tags.push("subject_sg");
  if (/перен\./.test(t)) tags.push("figurative");
  if (/объект в ед/.test(t)) tags.push("object_sg");
  return tags;
}

function parseDerivedFrom(blob) {
  const m = blob.match(/от\s+([а-яёА-ЯЁI1Ӏ0-9\-]+)/i);
  return m ? m[1].trim() : null;
}

module.exports = {
  splitParenForms,
  parseParenGroupsBeforePos,
  parseVerbParenGroups,
  parseVerbParadigmFour,
  parseNounMorphology,
  parseVerbTags,
  parseDerivedFrom,
  classifyVerbForm
};
