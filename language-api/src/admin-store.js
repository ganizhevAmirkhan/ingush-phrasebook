const fs = require("node:fs/promises");
const path = require("node:path");
const { normalizeText } = require("./schema");

const ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.join(ROOT, "data", "grammar");
const CORPUS_STORIES_DIR = path.join(ROOT, "data", "corpus", "stories");
const CORPUS_NOVELLAS_DIR = path.join(ROOT, "data", "corpus", "novellas");
const BLACKLIST_FILE = path.join(ROOT, "data", "blacklist.json");

/** Ингушские служебные слова — нельзя блокировать (ломает «Со … ву» и т.д.) */
const BLACKLIST_PROTECTED = new Set([
  "ву", "vu", "ду", "du", "со", "so", "sa", "сa", "из", "iz", "ha", "ха"
]);

function sanitizeBlacklist(terms) {
  return [...new Set((terms || []).map((x) => normalizeText(x)).filter(Boolean))]
    .filter((t) => !BLACKLIST_PROTECTED.has(t));
}

const GRAMMAR_FILES = {
  patterns: path.join(GRAMMAR_DIR, "patterns.json"),
  rules: path.join(GRAMMAR_DIR, "rules.json"),
  lexemes: path.join(GRAMMAR_DIR, "lexemes.json")
};

const NOUN_CLASS_KNOWLEDGE_FILE = path.join(GRAMMAR_DIR, "noun-class-knowledge.json");
const GRAMMAR_OVERVIEW_FILE = path.join(GRAMMAR_DIR, "grammar-overview-knowledge.json");
const NICHOLS_GRAMMAR_FILE = path.join(GRAMMAR_DIR, "nichols-ingush-grammar-sections.json");
const NICHOLS_PRIORITY_FILE = path.join(GRAMMAR_DIR, "nichols-priority-knowledge.json");
const NICHOLS_UNIQUE_FILE = path.join(GRAMMAR_DIR, "nichols-unique-knowledge.json");
const NICHOLS_NUMERAL_FILE = path.join(GRAMMAR_DIR, "nichols-numeral-declension.json");
const DESHERIEV_99_FILE = path.join(GRAMMAR_DIR, "desheriev-99-knowledge.json");
const NAANA_MOTT_FILE = path.join(GRAMMAR_DIR, "naana-mott-knowledge.json");
const MED_KODZOEV_FILE = path.join(ROOT, "data", "dictionary", "med-kodzoev-2019.json");
const MED_KODZOEV_KNOWLEDGE_FILE = path.join(GRAMMAR_DIR, "med-kodzoev-knowledge.json");
const TARIEV_2009_FILE = path.join(ROOT, "data", "dictionary", "tariev-2009.json");
const TARIEV_2009_KNOWLEDGE_FILE = path.join(GRAMMAR_DIR, "tariev-2009-knowledge.json");
const TARIEV_2009_GRAMMAR_RULES_FILE = path.join(GRAMMAR_DIR, "tariev-2009-grammar-rules.json");
const UROKI_INGUSH_FILE = path.join(ROOT, "data", "dictionary", "uroki-ingush.json");
const UROKI_INGUSH_KNOWLEDGE_FILE = path.join(GRAMMAR_DIR, "uroki-ingush-knowledge.json");
const MORPHEMIKA_2020_FILE = path.join(GRAMMAR_DIR, "morphemika-2020-knowledge.json");
const MORPHEMIKA_2020_AFFIXES_FILE = path.join(GRAMMAR_DIR, "morphemika-2020-affixes.json");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function safeListJsonFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((x) => x.endsWith(".json")).map((x) => path.join(dir, x));
  } catch {
    return [];
  }
}

function getAdminSecret() {
  return (process.env.ADMIN_SECRET || "").trim();
}

function isAdminAuthorized(req) {
  const secret = getAdminSecret();
  if (!secret) return false;
  const auth = (req.headers.authorization || "").trim();
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const header = (req.headers["x-admin-token"] || "").toString().trim();
  return bearer === secret || header === secret;
}

function paginate(items, { q = "", offset = 0, limit = 50, fields = [] } = {}) {
  let list = items;
  const query = normalizeText(q);
  if (query) {
    list = list.filter((item) => fields.some((f) => normalizeText(item?.[f]).includes(query)));
  }
  const total = list.length;
  const slice = list.slice(Number(offset) || 0, (Number(offset) || 0) + Math.min(Number(limit) || 50, 5000));
  return { total, offset: Number(offset) || 0, limit: slice.length, items: slice };
}

async function readGrammarArray(key) {
  const filePath = GRAMMAR_FILES[key];
  if (!filePath) return [];
  try {
    const json = await readJson(filePath);
    return Array.isArray(json?.[key]) ? json[key] : [];
  } catch {
    return [];
  }
}

async function writeGrammarArray(key, arr) {
  const filePath = GRAMMAR_FILES[key];
  await writeJson(filePath, { [key]: arr });
}

async function getInventory() {
  const [patterns, rules, lexemes] = await Promise.all([
    readGrammarArray("patterns"),
    readGrammarArray("rules"),
    readGrammarArray("lexemes")
  ]);
  const storyFiles = await safeListJsonFiles(CORPUS_STORIES_DIR);
  const novellaFiles = await safeListJsonFiles(CORPUS_NOVELLAS_DIR);
  let blacklist = [];
  try {
    const bl = await readJson(BLACKLIST_FILE);
    blacklist = Array.isArray(bl?.blocked) ? bl.blocked : [];
  } catch {
    // empty
  }
  let nounClassEntries = 0;
  let grammarOverviewSections = 0;
  let nicholsGrammarSections = 0;
  let nicholsPriorityChapters = 0;
  let nicholsUniqueStats = null;
  try {
    const nc = await readJson(NOUN_CLASS_KNOWLEDGE_FILE);
    nounClassEntries = Array.isArray(nc?.entries) ? nc.entries.length : 0;
  } catch {
    // empty
  }
  try {
    const ov = await readJson(GRAMMAR_OVERVIEW_FILE);
    grammarOverviewSections = Array.isArray(ov?.sections) ? ov.sections.length : 0;
  } catch {
    // empty
  }
  try {
    const ng = await readJson(NICHOLS_GRAMMAR_FILE);
    nicholsGrammarSections = Array.isArray(ng?.sections) ? ng.sections.length : 0;
  } catch {
    // empty
  }
  try {
    const np = await readJson(NICHOLS_PRIORITY_FILE);
    nicholsPriorityChapters = Array.isArray(np?.chapters) ? np.chapters.length : 0;
  } catch {
    // empty
  }
  try {
    const nu = await readJson(NICHOLS_UNIQUE_FILE);
    nicholsUniqueStats = nu?.stats || null;
  } catch {
    // empty
  }
  let nicholsNumeralParadigms = 0;
  let desheriev99Sections = 0;
  let naanaMottSections = 0;
  let naanaMottStats = null;
  let medKodzoevItems = 0;
  let medKodzoevKnowledgeSections = 0;
  let tariev2009Items = 0;
  let tariev2009VerbsWithParadigm = 0;
  let tariev2009KnowledgeSections = 0;
  let uroki2009Lessons = 0;
  let uroki2009Phrases = 0;
  let uroki2009Vocabulary = 0;
  let uroki2009KnowledgeSections = 0;
  let morphemika2020Sections = 0;
  let morphemika2020Affixes = 0;
  let morphemika2020Stats = null;
  try {
    const num = await readJson(NICHOLS_NUMERAL_FILE);
    nicholsNumeralParadigms = Array.isArray(num?.paradigms) ? num.paradigms.length : 0;
  } catch {
    // empty
  }
  try {
    const d99 = await readJson(DESHERIEV_99_FILE);
    desheriev99Sections = Array.isArray(d99?.sections) ? d99.sections.length : 0;
  } catch {
    // empty
  }
  try {
    const nm = await readJson(NAANA_MOTT_FILE);
    naanaMottSections = Array.isArray(nm?.sections) ? nm.sections.length : 0;
    naanaMottStats = nm?.stats || null;
  } catch {
    // empty
  }
  try {
    const med = await readJson(MED_KODZOEV_FILE);
    medKodzoevItems = Number(med?.itemCount) || (Array.isArray(med?.items) ? med.items.length : 0);
  } catch {
    // empty
  }
  try {
    const mk = await readJson(MED_KODZOEV_KNOWLEDGE_FILE);
    medKodzoevKnowledgeSections = Array.isArray(mk?.sections) ? mk.sections.length : 0;
  } catch {
    // empty
  }
  try {
    const tar = await readJson(TARIEV_2009_FILE);
    tariev2009Items = Number(tar?.itemCount) || (Array.isArray(tar?.items) ? tar.items.length : 0);
    tariev2009VerbsWithParadigm =
      Number(tar?.verbsWithParadigm) ||
      (Array.isArray(tar?.items) ? tar.items.filter((it) => it.paradigm).length : 0);
  } catch {
    // empty
  }
  try {
    const tk = await readJson(TARIEV_2009_KNOWLEDGE_FILE);
    tariev2009KnowledgeSections = Array.isArray(tk?.sections) ? tk.sections.length : 0;
  } catch {
    // empty
  }
  try {
    const ur = await readJson(UROKI_INGUSH_FILE);
    uroki2009Lessons = Number(ur?.lessonCount) || (Array.isArray(ur?.items) ? ur.items.length : 0);
    uroki2009Phrases = Number(ur?.phraseCount) || 0;
    uroki2009Vocabulary = Number(ur?.vocabCount) || 0;
  } catch {
    // empty
  }
  try {
    const uk = await readJson(UROKI_INGUSH_KNOWLEDGE_FILE);
    uroki2009KnowledgeSections = Array.isArray(uk?.sections) ? uk.sections.length : 0;
  } catch {
    // empty
  }
  try {
    const morph = await readJson(MORPHEMIKA_2020_FILE);
    morphemika2020Sections = Array.isArray(morph?.sections) ? morph.sections.length : 0;
    morphemika2020Stats = morph?.stats || null;
  } catch {
    // empty
  }
  try {
    const aff = await readJson(MORPHEMIKA_2020_AFFIXES_FILE);
    morphemika2020Affixes = Array.isArray(aff?.items) ? aff.items.length : 0;
  } catch {
    // empty
  }
  return {
    adminEnabled: getAdminSecret().length > 0,
    patterns: patterns.length,
    rules: rules.length,
    lexemes: lexemes.length,
    nounClassEntries,
    grammarOverviewSections,
    nicholsGrammarSections,
    nicholsPriorityChapters,
    nicholsUniqueStats,
    nicholsNumeralParadigms,
    desheriev99Sections,
    naanaMottSections,
    naanaMottStats,
    medKodzoevItems,
    medKodzoevKnowledgeSections,
    tariev2009Items,
    tariev2009VerbsWithParadigm,
    tariev2009KnowledgeSections,
    uroki2009Lessons,
    uroki2009Phrases,
    uroki2009Vocabulary,
    uroki2009KnowledgeSections,
    morphemika2020Sections,
    morphemika2020Affixes,
    morphemika2020Stats,
    corpusStories: storyFiles.length,
    corpusNovellas: novellaFiles.length,
    blacklist: blacklist.length
  };
}

async function listPatterns(opts) {
  const items = await readGrammarArray("patterns");
  return paginate(items, { ...opts, fields: ["id", "ruPattern", "description", "ingTemplate"] });
}

async function getPattern(id) {
  const items = await readGrammarArray("patterns");
  return items.find((x) => x.id === id) || null;
}

async function savePattern(pattern) {
  const id = (pattern?.id || "").toString().trim();
  const ruPattern = (pattern?.ruPattern || "").toString().trim();
  const ingTemplate = (pattern?.ingTemplate || "").toString().trim();
  if (!id || !ruPattern || !ingTemplate) {
    return { ok: false, error: "missing_fields", message: "Нужны id, ruPattern, ingTemplate" };
  }
  const items = await readGrammarArray("patterns");
  const next = {
    id,
    ruPattern,
    description: (pattern.description || "").toString().trim(),
    slots: Array.isArray(pattern.slots) ? pattern.slots : [],
    ingTemplate,
    priority: Number(pattern.priority) || 50,
    examples: Array.isArray(pattern.examples) ? pattern.examples : []
  };
  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) items[idx] = next;
  else items.push(next);
  items.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  await writeGrammarArray("patterns", items);
  return { ok: true, item: next };
}

async function deletePattern(id) {
  const items = await readGrammarArray("patterns");
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return { ok: false, error: "not_found" };
  await writeGrammarArray("patterns", next);
  return { ok: true };
}

async function listLexemes(opts) {
  const items = await readGrammarArray("lexemes");
  return paginate(items, { ...opts, fields: ["ru", "pos", "notes"] });
}

async function getLexeme(ru) {
  const key = normalizeText(ru);
  const items = await readGrammarArray("lexemes");
  return items.find((x) => normalizeText(x.ru) === key) || null;
}

async function saveLexeme(lexeme) {
  const ru = (lexeme?.ru || "").toString().trim();
  if (!ru) return { ok: false, error: "missing_ru" };
  const forms = lexeme?.forms && typeof lexeme.forms === "object" ? lexeme.forms : {};
  if (!forms.base) return { ok: false, error: "missing_base_form" };
  const items = await readGrammarArray("lexemes");
  const next = {
    ru,
    pos: (lexeme.pos || "noun").toString().trim(),
    forms,
    notes: (lexeme.notes || "").toString().trim()
  };
  if (lexeme.gender) next.gender = lexeme.gender;
  const key = normalizeText(ru);
  const idx = items.findIndex((x) => normalizeText(x.ru) === key);
  if (idx >= 0) items[idx] = next;
  else items.push(next);
  items.sort((a, b) => normalizeText(a.ru).localeCompare(normalizeText(b.ru), "ru"));
  await writeGrammarArray("lexemes", items);
  return { ok: true, item: next };
}

async function deleteLexeme(ru) {
  const key = normalizeText(ru);
  const items = await readGrammarArray("lexemes");
  const next = items.filter((x) => normalizeText(x.ru) !== key);
  if (next.length === items.length) return { ok: false, error: "not_found" };
  await writeGrammarArray("lexemes", next);
  return { ok: true };
}

async function listRules(opts) {
  const items = await readGrammarArray("rules");
  return paginate(items, { ...opts, fields: ["id", "type", "apply"] });
}

async function saveRule(rule) {
  const id = (rule?.id || "").toString().trim();
  if (!id) return { ok: false, error: "missing_id" };
  const items = await readGrammarArray("rules");
  const next = { ...rule, id };
  const idx = items.findIndex((x) => x.id === id);
  if (idx >= 0) items[idx] = next;
  else items.push(next);
  await writeGrammarArray("rules", items);
  return { ok: true, item: next };
}

async function deleteRule(id) {
  const items = await readGrammarArray("rules");
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return { ok: false, error: "not_found" };
  await writeGrammarArray("rules", next);
  return { ok: true };
}

async function findCorpusFile(id) {
  for (const dir of [CORPUS_STORIES_DIR, CORPUS_NOVELLAS_DIR]) {
    for (const filePath of await safeListJsonFiles(dir)) {
      try {
        const json = await readJson(filePath);
        if (json?.id === id) return filePath;
      } catch {
        // skip
      }
    }
  }
  return null;
}

function corpusDirForDoc(doc) {
  return doc?.genre === "novella" ? CORPUS_NOVELLAS_DIR : CORPUS_STORIES_DIR;
}

function corpusFileName(doc) {
  const base = (doc?.id || `corpus_${Date.now()}`).toString().replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
  return `${base}.json`;
}

async function listCorpus(opts = {}) {
  const all = [];
  for (const dir of [CORPUS_STORIES_DIR, CORPUS_NOVELLAS_DIR]) {
    for (const filePath of await safeListJsonFiles(dir)) {
      try {
        const json = await readJson(filePath);
        all.push({
          id: json.id,
          title: json.title,
          level: json.level || "",
          genre: json.genre || "story",
          paragraphCount: Array.isArray(json.paragraphs) ? json.paragraphs.length : 0,
          file: path.basename(filePath)
        });
      } catch {
        // skip
      }
    }
  }
  const genre = (opts.genre || "").toString().trim();
  let list = genre ? all.filter((x) => x.genre === genre) : all;
  const q = normalizeText(opts.q);
  if (q) {
    list = list.filter((x) => normalizeText(x.title).includes(q) || normalizeText(x.id).includes(q));
  }
  list.sort((a, b) => (a.title || "").localeCompare(b.title || "", "ru"));
  const offset = Number(opts.offset) || 0;
  const limit = Math.min(Number(opts.limit) || 50, 200);
  return { total: list.length, offset, limit, items: list.slice(offset, offset + limit) };
}

async function getCorpus(id) {
  const filePath = await findCorpusFile(id);
  if (!filePath) return null;
  return readJson(filePath);
}

async function saveCorpus(doc) {
  const id = (doc?.id || "").toString().trim();
  const title = (doc?.title || "").toString().trim();
  if (!id || !title) return { ok: false, error: "missing_id_or_title" };
  const paragraphs = Array.isArray(doc.paragraphs) ? doc.paragraphs : [];
  const next = {
    id,
    title,
    level: (doc.level || "A1").toString().trim(),
    genre: (doc.genre || "dialogue").toString().trim(),
    paragraphs: paragraphs.map((p) => ({
      ru: (p?.ru || "").toString().trim(),
      ing: (p?.ing || "").toString().trim()
    })).filter((p) => p.ru && p.ing),
    glossary: Array.isArray(doc.glossary) ? doc.glossary : []
  };
  const existing = await findCorpusFile(id);
  const dir = corpusDirForDoc(next);
  const filePath = existing || path.join(dir, corpusFileName(next));
  await writeJson(filePath, next);
  return { ok: true, item: next, file: path.basename(filePath) };
}

async function deleteCorpus(id) {
  const filePath = await findCorpusFile(id);
  if (!filePath) return { ok: false, error: "not_found" };
  await fs.unlink(filePath);
  return { ok: true };
}

async function getBlacklist() {
  try {
    const json = await readJson(BLACKLIST_FILE);
    return Array.isArray(json?.blocked) ? json.blocked : [];
  } catch {
    return [];
  }
}

async function saveBlacklist(terms) {
  const blocked = sanitizeBlacklist(terms);
  await writeJson(BLACKLIST_FILE, {
    blocked,
    help: "Только чеченские/ошибочные формы в ответах LLM. Не добавляйте ву, со, из — это нормальный ингушский."
  });
  return { ok: true, blocked };
}

async function addBlacklistTerm(term) {
  const blocked = await getBlacklist();
  const val = normalizeText(term);
  if (!val) return { ok: false, error: "empty_term" };
  if (BLACKLIST_PROTECTED.has(val)) {
    return { ok: false, error: "protected_term", detail: `"${val}" — нормальное ингушское слово, блокировать нельзя` };
  }
  if (!blocked.includes(val)) blocked.push(val);
  return saveBlacklist(blocked);
}

async function removeBlacklistTerm(term) {
  const val = normalizeText(term);
  const blocked = (await getBlacklist()).filter((x) => x !== val);
  return saveBlacklist(blocked);
}

async function listNounClasses(opts) {
  try {
    const json = await readJson(NOUN_CLASS_KNOWLEDGE_FILE);
    const items = Array.isArray(json?.entries) ? json.entries : [];
    return paginate(items, {
      ...opts,
      fields: ["ing", "ru", "markerSg", "markerPl", "reviewStatus"]
    });
  } catch {
    return { total: 0, offset: 0, limit: 0, items: [] };
  }
}

async function getNounClassKnowledgeMeta() {
  try {
    const json = await readJson(NOUN_CLASS_KNOWLEDGE_FILE);
    return {
      schema: json?.schema || null,
      status: json?.status || null,
      composerRules: json?.composerRules || [],
      stats: json?.stats || null,
      entries: Array.isArray(json?.entries) ? json.entries.length : 0
    };
  } catch {
    return { schema: null, status: null, composerRules: [], stats: null, entries: 0 };
  }
}

async function getGrammarOverviewMeta() {
  try {
    const json = await readJson(GRAMMAR_OVERVIEW_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      excludedBecauseElsewhere: json?.excludedBecauseElsewhere || [],
      sections: sections.map((s) => ({ id: s.id, title: s.title })),
      sectionCount: sections.length
    };
  } catch {
    return { schema: null, source: null, excludedBecauseElsewhere: [], sections: [], sectionCount: 0 };
  }
}

async function getGrammarOverviewSection(id) {
  try {
    const json = await readJson(GRAMMAR_OVERVIEW_FILE);
    const section = (json?.sections || []).find((s) => s.id === id);
    return section || null;
  } catch {
    return null;
  }
}

async function getNicholsGrammarMeta() {
  try {
    const json = await readJson(NICHOLS_GRAMMAR_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    const appendices = Array.isArray(json?.appendices) ? json.appendices : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      titleRu: json?.titleRu || null,
      titleEn: json?.titleEn || null,
      author: json?.author || null,
      pages: json?.pages || null,
      noteRu: json?.noteRu || null,
      relevanceRu: json?.relevanceRu || null,
      sections: sections.map((s) => ({
        id: s.id,
        number: s.number,
        titleRu: s.titleRu,
        titleEn: s.titleEn,
        apiPriority: !!s.apiPriority
      })),
      appendices: appendices.map((a) => ({
        id: a.id,
        titleRu: a.titleRu,
        titleEn: a.titleEn
      })),
      sectionCount: sections.length,
      appendixCount: appendices.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      titleRu: null,
      titleEn: null,
      author: null,
      pages: null,
      noteRu: null,
      relevanceRu: null,
      sections: [],
      appendices: [],
      sectionCount: 0,
      appendixCount: 0
    };
  }
}

async function getNicholsGrammarSection(id) {
  try {
    const json = await readJson(NICHOLS_GRAMMAR_FILE);
    const section = (json?.sections || []).find((s) => s.id === id);
    if (section) return section;
    const appendix = (json?.appendices || []).find((a) => a.id === id);
    return appendix || null;
  } catch {
    return null;
  }
}

async function getNicholsPriorityMeta() {
  try {
    const json = await readJson(NICHOLS_PRIORITY_FILE);
    const chapters = Array.isArray(json?.chapters) ? json.chapters : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      chapters: chapters.map((c) => ({
        id: c.id,
        number: c.number,
        titleRu: c.titleRu,
        sourceRef: c.sourceRef || null
      })),
      chapterCount: chapters.length
    };
  } catch {
    return { schema: null, source: null, titleRu: null, noteRu: null, chapters: [], chapterCount: 0 };
  }
}

async function getNicholsPriorityChapter(id) {
  try {
    const json = await readJson(NICHOLS_PRIORITY_FILE);
    return (json?.chapters || []).find((c) => c.id === id) || null;
  } catch {
    return null;
  }
}

async function getNicholsUniqueMeta() {
  try {
    const json = await readJson(NICHOLS_UNIQUE_FILE);
    return {
      schema: json?.schema || null,
      noteRu: json?.noteRu || null,
      stats: json?.stats || null,
      rules: (json?.rules || []).map((r) => ({ id: r.id, titleRu: r.titleRu })),
      otherChapterSummaries: (json?.otherChapterSummaries || []).map((c) => ({
        number: c.n,
        titleRu: c.titleRu
      }))
    };
  } catch {
    return { schema: null, noteRu: null, stats: null, rules: [], otherChapterSummaries: [] };
  }
}

async function getNicholsUniqueSection(kind, id) {
  try {
    const json = await readJson(NICHOLS_UNIQUE_FILE);
    if (kind === "rule") return (json?.rules || []).find((r) => r.id === id) || null;
    if (kind === "chapter") return (json?.otherChapterSummaries || []).find((c) => String(c.n) === id) || null;
    if (kind === "noun") return (json?.nounClassEntries || []).find((e) => e.id === id) || null;
    if (kind === "paradigm") return (json?.paradigms || []).find((p) => p.id === id) || null;
    return null;
  } catch {
    return null;
  }
}

async function getNicholsNumeralMeta() {
  try {
    const json = await readJson(NICHOLS_NUMERAL_FILE);
    return {
      schema: json?.schema || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      crossRef: json?.crossRef || null,
      rulesRu: json?.rulesRu || [],
      paradigms: (json?.paradigms || []).map((p) => ({ id: p.id, n: p.n, lemmaRu: p.lemmaRu })),
      paradigmCount: (json?.paradigms || []).length
    };
  } catch {
    return { schema: null, titleRu: null, noteRu: null, crossRef: null, rulesRu: [], paradigms: [], paradigmCount: 0 };
  }
}

async function getNicholsNumeralParadigm(id) {
  try {
    const json = await readJson(NICHOLS_NUMERAL_FILE);
    return (json?.paradigms || []).find((p) => p.id === id) || null;
  } catch {
    return null;
  }
}

async function getDesheriev99Meta() {
  try {
    const json = await readJson(DESHERIEV_99_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      sourceUrl: json?.sourceUrl || null,
      authors: json?.authors || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      stats: json?.stats || null,
      sections: sections.map((s) => ({
        id: s.id,
        titleRu: s.titleRu,
        sourceRef: s.sourceRef || null,
        dedupeRef: s.dedupeRef || null
      })),
      sectionCount: sections.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      sourceUrl: null,
      authors: null,
      titleRu: null,
      noteRu: null,
      stats: null,
      sections: [],
      sectionCount: 0
    };
  }
}

async function getDesheriev99Section(id) {
  try {
    const json = await readJson(DESHERIEV_99_FILE);
    return (json?.sections || []).find((s) => s.id === id) || null;
  } catch {
    return null;
  }
}

async function getNaanaMottMeta() {
  try {
    const json = await readJson(NAANA_MOTT_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      sourceUrl: json?.sourceUrl || null,
      groupRu: json?.groupRu || null,
      noteRu: json?.noteRu || null,
      stats: json?.stats || null,
      sections: sections.map((s) => ({
        id: s.id,
        titleRu: s.titleRu,
        entryCount: Array.isArray(s.entries) ? s.entries.length : 0,
        correctionCount: Array.isArray(s.corrections) ? s.corrections.length : 0,
        dedupeRef: s.dedupeRef || null
      })),
      sectionCount: sections.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      sourceUrl: null,
      groupRu: null,
      noteRu: null,
      stats: null,
      sections: [],
      sectionCount: 0
    };
  }
}

async function getNaanaMottSection(id) {
  try {
    const json = await readJson(NAANA_MOTT_FILE);
    return (json?.sections || []).find((s) => s.id === id) || null;
  } catch {
    return null;
  }
}

async function getMedKodzoevMeta() {
  try {
    const json = await readJson(MED_KODZOEV_KNOWLEDGE_FILE);
    const dict = await readJson(MED_KODZOEV_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      authors: json?.authors || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      stats: {
        ...(json?.stats || {}),
        dictionaryItems: Number(dict?.itemCount) || (Array.isArray(dict?.items) ? dict.items.length : 0)
      },
      sections: sections.map((s) => ({
        id: s.id,
        titleRu: s.titleRu,
        exampleCount: Array.isArray(s.examples) ? s.examples.length : 0,
        dedupeRef: s.dedupeRef || null
      })),
      sectionCount: sections.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      authors: null,
      titleRu: null,
      noteRu: null,
      stats: null,
      sections: [],
      sectionCount: 0
    };
  }
}

async function getMedKodzoevSection(id) {
  try {
    const json = await readJson(MED_KODZOEV_KNOWLEDGE_FILE);
    return (json?.sections || []).find((s) => s.id === id) || null;
  } catch {
    return null;
  }
}

async function getTariev2009Meta() {
  try {
    const json = await readJson(TARIEV_2009_KNOWLEDGE_FILE);
    const dict = await readJson(TARIEV_2009_FILE);
    const rules = await readJson(TARIEV_2009_GRAMMAR_RULES_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      authors: json?.authors || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      grammarRulesRef: json?.grammarRulesRef || null,
      verbParadigmOrder: rules?.verbParadigm?.orderRu || null,
      stats: {
        ...(json?.stats || {}),
        dictionaryItems: Number(dict?.itemCount) || (Array.isArray(dict?.items) ? dict.items.length : 0),
        verbsWithParadigm:
          Number(dict?.verbsWithParadigm) ||
          (Array.isArray(dict?.items) ? dict.items.filter((it) => it.paradigm).length : 0)
      },
      sections: sections.map((s) => ({
        id: s.id,
        titleRu: s.titleRu,
        exampleCount: Array.isArray(s.examples) ? s.examples.length : 0
      })),
      sectionCount: sections.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      authors: null,
      titleRu: null,
      noteRu: null,
      grammarRulesRef: null,
      verbParadigmOrder: null,
      stats: null,
      sections: [],
      sectionCount: 0
    };
  }
}

async function getTariev2009Section(id) {
  try {
    const json = await readJson(TARIEV_2009_KNOWLEDGE_FILE);
    return (json?.sections || []).find((s) => s.id === id) || null;
  } catch {
    return null;
  }
}

async function getUrokiIngushMeta() {
  try {
    const json = await readJson(UROKI_INGUSH_KNOWLEDGE_FILE);
    const dict = await readJson(UROKI_INGUSH_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      authors: json?.authors || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      stats: {
        ...(json?.stats || {}),
        dictionaryLessons: Number(dict?.lessonCount) || (Array.isArray(dict?.items) ? dict.items.length : 0),
        dictionaryPhrases: Number(dict?.phraseCount) || 0,
        dictionaryVocabulary: Number(dict?.vocabCount) || 0
      },
      sections: sections.map((s) => ({
        id: s.id,
        lesson: s.lesson,
        titleRu: s.titleRu,
        titleIng: s.titleIng,
        kind: s.kind,
        phraseCount: s.phraseCount,
        vocabularyCount: s.vocabularyCount
      })),
      sectionCount: sections.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      authors: null,
      titleRu: null,
      noteRu: null,
      stats: null,
      sections: [],
      sectionCount: 0
    };
  }
}

async function getUrokiIngushSection(id) {
  try {
    const json = await readJson(UROKI_INGUSH_KNOWLEDGE_FILE);
    const section = (json?.sections || []).find((s) => s.id === id);
    if (!section) return null;
    const dict = await readJson(UROKI_INGUSH_FILE);
    const lesson = (dict?.items || []).find((it) => it.id === id);
    return lesson
      ? {
          ...section,
          pairs: lesson.pairs || [],
          vocabulary: lesson.vocabulary || [],
          grammarNotes: lesson.grammarNotes || []
        }
      : section;
  } catch {
    return null;
  }
}

async function getMorphemika2020Meta() {
  try {
    const json = await readJson(MORPHEMIKA_2020_FILE);
    const aff = await readJson(MORPHEMIKA_2020_AFFIXES_FILE);
    const sections = Array.isArray(json?.sections) ? json.sections : [];
    return {
      schema: json?.schema || null,
      source: json?.source || null,
      authors: json?.authors || null,
      titleRu: json?.titleRu || null,
      noteRu: json?.noteRu || null,
      affixesRef: json?.affixesRef || null,
      stats: {
        ...(json?.stats || {}),
        affixInventory: Array.isArray(aff?.items) ? aff.items.length : 0
      },
      parts: json?.stats?.parts || [],
      sections: sections.map((s) => ({
        id: s.id,
        paragraph: s.paragraph,
        part: s.part,
        partTitleRu: s.partTitleRu,
        titleRu: s.titleRu,
        charCount: s.charCount,
        exampleCount: s.exampleCount,
        affixCount: s.affixCount,
        dedupeRef: s.dedupeRef || null,
        sourceRef: s.sourceRef || null
      })),
      sectionCount: sections.length
    };
  } catch {
    return {
      schema: null,
      source: null,
      authors: null,
      titleRu: null,
      noteRu: null,
      affixesRef: null,
      stats: null,
      parts: [],
      sections: [],
      sectionCount: 0
    };
  }
}

async function getMorphemika2020Section(id) {
  try {
    const json = await readJson(MORPHEMIKA_2020_FILE);
    return (json?.sections || []).find((s) => s.id === id) || null;
  } catch {
    return null;
  }
}

async function getMorphemika2020Affixes(opts = {}) {
  try {
    const json = await readJson(MORPHEMIKA_2020_AFFIXES_FILE);
    const items = Array.isArray(json?.items) ? json.items : [];
    const kind = (opts.kind || "").toLowerCase();
    const part = opts.part ? Number(opts.part) : 0;
    let list = items;
    if (kind === "prefix" || kind === "suffix" || kind === "affix") {
      list = list.filter((x) => x.kind === kind);
    }
    if (part > 0) list = list.filter((x) => x.part === part);
    return {
      schema: json?.schema || null,
      stats: json?.stats || null,
      items: list
    };
  } catch {
    return { schema: null, stats: null, items: [] };
  }
}

module.exports = {
  getAdminSecret,
  isAdminAuthorized,
  getInventory,
  listPatterns,
  getPattern,
  savePattern,
  deletePattern,
  listLexemes,
  getLexeme,
  saveLexeme,
  deleteLexeme,
  listRules,
  saveRule,
  deleteRule,
  listCorpus,
  getCorpus,
  saveCorpus,
  deleteCorpus,
  getBlacklist,
  addBlacklistTerm,
  removeBlacklistTerm,
  listNounClasses,
  getNounClassKnowledgeMeta,
  getGrammarOverviewMeta,
  getGrammarOverviewSection,
  getNicholsGrammarMeta,
  getNicholsGrammarSection,
  getNicholsPriorityMeta,
  getNicholsPriorityChapter,
  getNicholsUniqueMeta,
  getNicholsUniqueSection,
  getNicholsNumeralMeta,
  getNicholsNumeralParadigm,
  getDesheriev99Meta,
  getDesheriev99Section,
  getNaanaMottMeta,
  getNaanaMottSection,
  getMedKodzoevMeta,
  getMedKodzoevSection,
  getTariev2009Meta,
  getTariev2009Section,
  getUrokiIngushMeta,
  getUrokiIngushSection,
  getMorphemika2020Meta,
  getMorphemika2020Section,
  getMorphemika2020Affixes
};
