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
  return {
    adminEnabled: getAdminSecret().length > 0,
    patterns: patterns.length,
    rules: rules.length,
    lexemes: lexemes.length,
    nounClassEntries,
    grammarOverviewSections,
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
  getGrammarOverviewSection
};
