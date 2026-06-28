/**
 * Составление перевода по словарю и грамматическим правилам.
 * Каскад: точная фраза → разбор «подлежащее + сказуемое» → Tariev → отказ (LLM).
 */
const path = require("node:path");
const fs = require("node:fs/promises");

const COMPOSE_RULES_FILE = path.join(__dirname, "..", "data", "grammar", "compose-rules.json");

const MIN_CONFIDENCE = 0.75;

function capitalizeSubject(ing) {
  const s = (ing || "").toString().trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeTarievForm(form) {
  return (form || "").toString().replace(/-/g, "").replace(/\s+/g, " ").trim();
}

function personFromSubject(subjectEntry, override) {
  if (override) return override;
  return subjectEntry?.person || "1sg";
}

async function loadComposeRules(file = COMPOSE_RULES_FILE) {
  try {
    const json = JSON.parse(await fs.readFile(file, "utf8"));
    return json;
  } catch {
    return { version: 0, subjects: {}, phrases: {}, conjugationMap: {}, verbs: {}, clauses: [], grammarHints: [] };
  }
}

function createSentenceComposer(deps) {
  const { normalizeText, lookupTariev, pickIngForm } = deps;
  let rules = null;

  function loadRules(data) {
    rules = data;
  }

  function getGrammarHints() {
    return Array.isArray(rules?.grammarHints) ? rules.grammarHints : [];
  }

  function lookupExactPhrase(norm) {
    const hit = rules?.phrases?.[norm];
    if (!hit) return null;
    return { translation: hit, confidence: 0.95, ruleId: `phrase:${norm}` };
  }

  function parseClause(norm) {
    const subjects = Object.keys(rules?.subjects || {});
    if (!subjects.length) return null;

    const tokens = norm.split(" ").filter(Boolean);
    if (tokens.length < 2) return null;

    const subjectRu = tokens[0];
    if (!subjects.includes(subjectRu)) return null;

    if (tokens.length === 3 && tokens[1] === "не") {
      return {
        subjectRu,
        neg: true,
        verbRu: tokens[2],
        person: rules.subjects[subjectRu]?.person
      };
    }

    const verbPhrase = tokens.slice(1).join(" ");
    return {
      subjectRu,
      neg: false,
      verbRu: verbPhrase,
      person: rules.subjects[subjectRu]?.person
    };
  }

  function resolveVerbLemma(verbRu) {
    const conj = rules?.conjugationMap?.[verbRu];
    if (conj?.infinitive) {
      return {
        infinitive: conj.infinitive,
        tense: conj.tense || "future",
        person: conj.person,
        tail: conj.tail || ""
      };
    }
    return null;
  }

  function resolveFromVerbRules(infinitive, tense, person, neg) {
    const verbRule = rules?.verbs?.[infinitive];
    if (!verbRule) return null;

    const tenseKey = neg ? "negFuture" : tense;
    let forms = verbRule[tenseKey];
    if (!forms && !neg && tense === "future") forms = verbRule.future;
    if (!forms) return null;

    const form = forms[person];
    if (!form) return null;

    return {
      form,
      confidence: 0.92,
      ruleId: `verb:${infinitive}:${tenseKey}:${person}`,
      source: verbRule.source || "compose-rules"
    };
  }

  function resolveFromTariev(infinitive, tense, neg) {
    if (neg) return null;
    const entries = lookupTariev({ ru: infinitive, limit: 8 });
    const verb = entries.find((e) => (e.pos || "").toLowerCase() === "verb" && e.paradigm);
    if (!verb) return null;

    const tarievLemma = rules?.verbs?.[infinitive]?.tarievLemma;
    if (tarievLemma) {
      const byLemma = entries.find(
        (e) => normalizeText(e.ing) === normalizeText(tarievLemma)
      );
      if (byLemma?.paradigm) {
        const form = normalizeTarievForm(pickIngForm(byLemma, tense === "future" ? "future" : tense));
        if (form) {
          return {
            form,
            confidence: 0.8,
            ruleId: `tariev:${byLemma.id}`,
            source: "tariev"
          };
        }
      }
    }

    const form = normalizeTarievForm(pickIngForm(verb, tense === "future" ? "future" : tense));
    if (!form) return null;
    return {
      form,
      confidence: 0.78,
      ruleId: `tariev:${verb.id}`,
      source: "tariev"
    };
  }

  function parseWhenQuestion(norm) {
    const tokens = norm.split(" ").filter(Boolean);
    if (tokens[0] !== "когда" || tokens.length < 2) return null;

    const subjects = Object.keys(rules?.subjects || {});

    if (tokens.length === 2) {
      return {
        subjectRu: "ты",
        verbRu: tokens[1],
        isQuestion: true
      };
    }

    if (tokens.length === 3 && subjects.includes(tokens[1])) {
      return {
        subjectRu: tokens[1],
        verbRu: tokens[2],
        isQuestion: true
      };
    }

    return null;
  }

  function fillWhenTemplate(template, subjectIng, verbForm) {
    return (template || "")
      .replace(/\{SUBJECT\}/g, subjectIng)
      .replace(/\{VERB\}/g, verbForm)
      .replace(/\s+/g, " ")
      .trim();
  }

  function composeWhenQuestion(parsed) {
    const subjectEntry = rules.subjects[parsed.subjectRu];
    if (!subjectEntry) return { ok: false };

    const lemmaInfo = resolveVerbLemma(parsed.verbRu);
    if (!lemmaInfo) return { ok: false };

    const person = personFromSubject(subjectEntry, lemmaInfo.person || parsed.person);
    const tense = lemmaInfo.tense;

    const resolved =
      resolveFromVerbRules(lemmaInfo.infinitive, tense, person, false) ||
      resolveFromTariev(lemmaInfo.infinitive, tense, false);

    if (!resolved?.form) return { ok: false };

    const subjectIng = subjectEntry.ing;
    const wq = rules.whenQuestions || {};
    const template =
      tense === "present"
        ? wq.presentTemplate || "{SUBJECT} да мас {VERB}?"
        : wq.futureTemplate || "Маца {VERB} {SUBJECT}?";

    const translation = fillWhenTemplate(template, subjectIng, resolved.form);
    if (!translation) return { ok: false };

    return {
      ok: true,
      translation,
      confidence: Math.min(0.94, resolved.confidence + 0.02),
      method: "when_question",
      ruleId: `when:${lemmaInfo.infinitive}:${tense}`,
      source: resolved.source
    };
  }

  function composeSubjectVerb(parsed) {
    const subjectEntry = rules.subjects[parsed.subjectRu];
    if (!subjectEntry) return { ok: false };

    const lemmaInfo = resolveVerbLemma(parsed.verbRu);
    if (!lemmaInfo) return { ok: false };

    const person = personFromSubject(subjectEntry, lemmaInfo.person || parsed.person);
    const tense = lemmaInfo.tense;

    let resolved =
      resolveFromVerbRules(lemmaInfo.infinitive, tense, person, parsed.neg) ||
      resolveFromTariev(lemmaInfo.infinitive, tense, parsed.neg);

    if (!resolved?.form) return { ok: false };

    const subjectIng = capitalizeSubject(subjectEntry.ing);
    const parts = [subjectIng, resolved.form];
    if (lemmaInfo.tail) parts.push(lemmaInfo.tail);

    return {
      ok: true,
      translation: parts.join(" ").replace(/\s+/g, " ").trim(),
      confidence: resolved.confidence,
      method: "subject_verb",
      ruleId: resolved.ruleId,
      source: resolved.source
    };
  }

  function compose(ruText) {
    if (!rules) return { ok: false, translation: "", reason: "rules_not_loaded" };

    const norm = normalizeText(ruText).replace(/[!?.…]+$/g, "").trim();
    if (!norm) return { ok: false, translation: "", reason: "empty" };

    const exact = lookupExactPhrase(norm);
    if (exact) {
      return {
        ok: true,
        translation: exact.translation,
        confidence: exact.confidence,
        method: "phrase",
        ruleId: exact.ruleId
      };
    }

    const whenParsed = parseWhenQuestion(norm);
    if (whenParsed && rules.conjugationMap?.[whenParsed.verbRu]) {
      const whenResult = composeWhenQuestion(whenParsed);
      if (whenResult.ok && whenResult.confidence >= MIN_CONFIDENCE) {
        return whenResult;
      }
    }

    const parsed = parseClause(norm);
    if (!parsed) return { ok: false, translation: "", reason: "unparsed" };

    const onlyKnownVerb = rules.conjugationMap?.[parsed.verbRu];
    if (!onlyKnownVerb) {
      return { ok: false, translation: "", reason: "unknown_verb" };
    }

    const result = composeSubjectVerb(parsed);
    if (!result.ok) {
      return { ok: false, translation: "", reason: "verb_unresolved" };
    }

    if (result.confidence < MIN_CONFIDENCE) {
      return { ok: false, translation: "", reason: "low_confidence" };
    }

    return result;
  }

  return {
    loadRules,
    compose,
    getGrammarHints,
    COMPOSE_RULES_FILE
  };
}

module.exports = {
  COMPOSE_RULES_FILE,
  loadComposeRules,
  createSentenceComposer,
  capitalizeSubject,
  normalizeTarievForm
};
