const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

function loadEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"'))
        || (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // optional .env
  }
}

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const {
  refreshAllSources,
  lookupWord,
  lookupPhrase,
  lookupCorpus,
  lookupTariev,
  lookupUroki,
  translate,
  assistTask,
  getMetrics,
  getModerationQueue,
  testGeminiConnection,
  testLlmConnection,
  getLlmConfig
} = require("./src/platform");

const adminStore = require("./src/admin-store");

const PORT = Number(process.env.PORT || 8787);
const ADMIN_DIR = path.join(__dirname, "admin");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Admin-Token"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": contentType, ...extraHeaders });
  res.end(body);
}

async function sendAdminStatic(req, res, urlPath) {
  let rel = urlPath.replace(/^\/admin\/?/, "") || "index.html";
  if (rel.includes("..")) return sendText(res, 403, "Forbidden");
  const filePath = path.join(ADMIN_DIR, rel);
  const noCache = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache"
  };
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      return sendAdminStatic(req, res, "/admin/index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const data = await fsp.readFile(filePath);
    sendText(res, 200, data, MIME[ext] || "application/octet-stream", noCache);
  } catch {
    sendText(res, 404, "Not found", "text/plain; charset=utf-8", noCache);
  }
}

async function sendPublicStatic(req, res, urlPath) {
  let rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  if (rel.includes("..")) return sendText(res, 403, "Forbidden");
  if (rel === "favicon.ico") {
    rel = "assets/brand/favicon-32.png";
  }
  const filePath = path.join(PUBLIC_DIR, rel);
  const cacheStatic = {
    "Cache-Control": "public, max-age=3600"
  };
  const cacheHtml = {
    "Cache-Control": "no-cache"
  };
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      return sendPublicStatic(req, res, "/index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const data = await fsp.readFile(filePath);
    const headers = ext === ".html" ? cacheHtml : cacheStatic;
    sendText(res, 200, data, MIME[ext] || "application/octet-stream", headers);
  } catch {
    sendText(res, 404, "Not found", "text/plain; charset=utf-8", cacheHtml);
  }
}

async function adminApiRoute(req, res, apiPath, url) {
  const auth = adminStore.isAdminAuthorized(req);

  if (req.method === "GET" && apiPath === "/session") {
    return sendJson(res, 200, {
      ok: true,
      adminEnabled: adminStore.getAdminSecret().length > 0,
      authorized: auth
    });
  }

  if (!auth) {
    return sendJson(res, 401, { ok: false, error: "unauthorized" });
  }

  const q = (key, def = "") => url.searchParams.get(key) || def;
  const listOpts = () => ({
    q: q("q"),
    offset: q("offset", "0"),
    limit: q("limit", "50"),
    genre: q("genre")
  });

  async function mutateAndReload(fn) {
    const result = await fn();
    if (result?.ok) await refreshAllSources();
    return result;
  }

  if (req.method === "GET" && apiPath === "/inventory") {
    const inventory = await adminStore.getInventory();
    return sendJson(res, 200, { ok: true, inventory, metrics: getMetrics() });
  }

  if (req.method === "POST" && apiPath === "/reload") {
    await refreshAllSources();
    return sendJson(res, 200, { ok: true, refreshed: true });
  }

  if (apiPath === "/grammar/patterns") {
    if (req.method === "GET") {
      const data = await adminStore.listPatterns(listOpts());
      return sendJson(res, 200, { ok: true, ...data });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const result = await mutateAndReload(() => adminStore.savePattern(body));
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (req.method === "DELETE") {
      const id = decodeURIComponent(q("id"));
      const result = await mutateAndReload(() => adminStore.deletePattern(id));
      return sendJson(res, result.ok ? 200 : 404, result);
    }
  }

  if (apiPath.startsWith("/grammar/patterns/") && req.method === "GET") {
    const id = decodeURIComponent(apiPath.slice("/grammar/patterns/".length));
    const item = await adminStore.getPattern(id);
    return item
      ? sendJson(res, 200, { ok: true, item })
      : sendJson(res, 404, { ok: false, error: "not_found" });
  }

  if (apiPath === "/grammar/lexemes") {
    if (req.method === "GET") {
      const data = await adminStore.listLexemes(listOpts());
      return sendJson(res, 200, { ok: true, ...data });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const result = await mutateAndReload(() => adminStore.saveLexeme(body));
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (req.method === "DELETE") {
      const ru = decodeURIComponent(q("ru"));
      const result = await mutateAndReload(() => adminStore.deleteLexeme(ru));
      return sendJson(res, result.ok ? 200 : 404, result);
    }
  }

  if (apiPath.startsWith("/grammar/lexemes/") && req.method === "GET") {
    const ru = decodeURIComponent(apiPath.slice("/grammar/lexemes/".length));
    const item = await adminStore.getLexeme(ru);
    return item
      ? sendJson(res, 200, { ok: true, item })
      : sendJson(res, 404, { ok: false, error: "not_found" });
  }

  if (apiPath === "/grammar/rules") {
    if (req.method === "GET") {
      const data = await adminStore.listRules(listOpts());
      return sendJson(res, 200, { ok: true, ...data });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const result = await mutateAndReload(() => adminStore.saveRule(body));
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (req.method === "DELETE") {
      const id = decodeURIComponent(q("id"));
      const result = await mutateAndReload(() => adminStore.deleteRule(id));
      return sendJson(res, result.ok ? 200 : 404, result);
    }
  }

  if (apiPath === "/grammar/noun-classes") {
    if (req.method === "GET") {
      const meta = q("meta") === "1";
      if (meta) {
        const data = await adminStore.getNounClassKnowledgeMeta();
        return sendJson(res, 200, { ok: true, ...data });
      }
      const data = await adminStore.listNounClasses(listOpts());
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/overview") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getGrammarOverviewSection(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getGrammarOverviewMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/nichols") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getNicholsGrammarSection(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getNicholsGrammarMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/nichols-priority") {
    if (req.method === "GET") {
      const chapterId = q("chapter");
      if (chapterId) {
        const chapter = await adminStore.getNicholsPriorityChapter(decodeURIComponent(chapterId));
        return chapter
          ? sendJson(res, 200, { ok: true, chapter })
          : sendJson(res, 404, { ok: false, error: "chapter_not_found" });
      }
      const data = await adminStore.getNicholsPriorityMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/nichols-unique") {
    if (req.method === "GET") {
      const kind = q("kind");
      const id = q("id");
      if (kind && id) {
        const item = await adminStore.getNicholsUniqueSection(kind, decodeURIComponent(id));
        return item
          ? sendJson(res, 200, { ok: true, kind, item })
          : sendJson(res, 404, { ok: false, error: "not_found" });
      }
      const data = await adminStore.getNicholsUniqueMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/nichols-numerals") {
    if (req.method === "GET") {
      const paradigmId = q("paradigm");
      if (paradigmId) {
        const paradigm = await adminStore.getNicholsNumeralParadigm(decodeURIComponent(paradigmId));
        return paradigm
          ? sendJson(res, 200, { ok: true, paradigm })
          : sendJson(res, 404, { ok: false, error: "paradigm_not_found" });
      }
      const data = await adminStore.getNicholsNumeralMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/desheriev-99") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getDesheriev99Section(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getDesheriev99Meta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/naana-mott") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getNaanaMottSection(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getNaanaMottMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/med-kodzoev") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getMedKodzoevSection(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getMedKodzoevMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/morphemika-2020") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getMorphemika2020Section(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const affixes = q("affixes");
      if (affixes === "1" || affixes === "true") {
        const kind = q("kind") || "";
        const part = q("part") || "";
        const data = await adminStore.getMorphemika2020Affixes({ kind, part });
        return sendJson(res, 200, { ok: true, ...data });
      }
      const data = await adminStore.getMorphemika2020Meta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/uroki-ingush") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getUrokiIngushSection(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getUrokiIngushMeta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/grammar/tariev-2009") {
    if (req.method === "GET") {
      const sectionId = q("section");
      if (sectionId) {
        const section = await adminStore.getTariev2009Section(decodeURIComponent(sectionId));
        return section
          ? sendJson(res, 200, { ok: true, section })
          : sendJson(res, 404, { ok: false, error: "section_not_found" });
      }
      const data = await adminStore.getTariev2009Meta();
      return sendJson(res, 200, { ok: true, ...data });
    }
  }

  if (apiPath === "/corpus") {
    if (req.method === "GET") {
      const data = await adminStore.listCorpus(listOpts());
      return sendJson(res, 200, { ok: true, ...data });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const result = await mutateAndReload(() => adminStore.saveCorpus(body));
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (req.method === "DELETE") {
      const id = decodeURIComponent(q("id"));
      const result = await mutateAndReload(() => adminStore.deleteCorpus(id));
      return sendJson(res, result.ok ? 200 : 404, result);
    }
  }

  if (apiPath.startsWith("/corpus/") && req.method === "GET") {
    const id = decodeURIComponent(apiPath.slice("/corpus/".length));
    const item = await adminStore.getCorpus(id);
    return item
      ? sendJson(res, 200, { ok: true, item })
      : sendJson(res, 404, { ok: false, error: "not_found" });
  }

  if (apiPath === "/blacklist") {
    if (req.method === "GET") {
      const blocked = await adminStore.getBlacklist();
      return sendJson(res, 200, { ok: true, blocked });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const result = await mutateAndReload(() => adminStore.addBlacklistTerm(body?.term));
      return sendJson(res, result.ok ? 200 : 400, result);
    }
    if (req.method === "DELETE") {
      const term = decodeURIComponent(q("term"));
      const result = await mutateAndReload(() => adminStore.removeBlacklistTerm(term));
      return sendJson(res, result.ok ? 200 : 404, result);
    }
  }

  if (req.method === "POST" && apiPath === "/translate-test") {
    const body = await readBody(req);
    const result = await translate(body?.ru || "");
    if (!result.ok) {
      return sendJson(res, result.status || 503, {
        ok: false,
        error: result.error,
        detail: result.detail || ""
      });
    }
    return sendJson(res, 200, { ok: true, ...result });
  }

  return sendJson(res, 404, { ok: false, error: "not_found" });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (path === "/admin" || path.startsWith("/admin/")) {
    if (path.startsWith("/admin/api")) {
      const apiPath = path.slice("/admin/api".length) || "/";
      return adminApiRoute(req, res, apiPath, url);
    }
    if (path === "/admin" && req.method === "GET") {
      res.writeHead(302, { Location: "/admin/" });
      res.end();
      return;
    }
    return sendAdminStatic(req, res, path);
  }

  if (req.method === "GET" && path === "/health") {
    const llm = getLlmConfig();
    return sendJson(res, 200, {
      ok: true,
      service: "language-api",
      llmPrimary: llm.primary || null,
      openrouterConfigured: llm.openrouterConfigured,
      geminiConfigured: llm.geminiConfigured,
      openrouterModel: llm.openrouterConfigured ? llm.openrouterModel : null
    });
  }

  if (req.method === "GET" && path === "/health/llm") {
    const result = await testLlmConnection();
    return sendJson(res, result.ok ? 200 : 503, result);
  }

  if (req.method === "GET" && path === "/health/gemini") {
    const result = await testGeminiConnection();
    return sendJson(res, result.ok ? 200 : 503, result);
  }

  if (req.method === "GET" && path === "/lookup/word") {
    const ru = url.searchParams.get("ru") || "";
    return sendJson(res, 200, { ok: true, items: lookupWord(ru) });
  }

  if (req.method === "GET" && path === "/lookup/phrase") {
    const ru = url.searchParams.get("ru") || "";
    return sendJson(res, 200, { ok: true, items: lookupPhrase(ru) });
  }

  if (req.method === "GET" && path === "/lookup/corpus") {
    const q = url.searchParams.get("q") || "";
    return sendJson(res, 200, { ok: true, items: lookupCorpus(q) });
  }

  if (req.method === "GET" && path === "/lookup/uroki") {
    const lesson = url.searchParams.get("lesson") || "";
    const ru = url.searchParams.get("ru") || "";
    const ing = url.searchParams.get("ing") || "";
    const by = url.searchParams.get("by") || (lesson ? "lesson" : ru ? "ru" : "ing");
    const q = ing || ru || lesson;
    const limit = Number(url.searchParams.get("limit") || 25);
    return sendJson(res, 200, {
      ok: true,
      items: lookupUroki(q, { by, lesson, ru, ing, limit })
    });
  }

  if (req.method === "GET" && path === "/lookup/tariev") {
    const ing = url.searchParams.get("ing") || "";
    const ru = url.searchParams.get("ru") || "";
    const id = url.searchParams.get("id") || "";
    const by = url.searchParams.get("by") || (ru ? "ru" : id ? "id" : "ing");
    const q = ing || ru || id;
    const limit = Number(url.searchParams.get("limit") || 15);
    return sendJson(res, 200, {
      ok: true,
      items: lookupTariev(q, { by, id, limit })
    });
  }

  if (req.method === "GET" && path === "/metrics") {
    return sendJson(res, 200, { ok: true, metrics: getMetrics() });
  }

  if (req.method === "GET" && path === "/info") {
    const llm = getLlmConfig();
    const inventory = await adminStore.getInventory();
    return sendJson(res, 200, {
      ok: true,
      name: "Ghalghay API",
      shortName: "Ghalghay",
      tagline: "Языковой ИИ · разработка · внедрение",
      llmPrimary: llm.primary || null,
      endpoints: [
        { method: "POST", path: "/translate", desc: "RU → ING перевод" },
        { method: "GET", path: "/lookup/word", desc: "Словарь dosh" },
        { method: "GET", path: "/lookup/phrase", desc: "Индекс фраз" },
        { method: "GET", path: "/lookup/corpus", desc: "Поиск в корпусе" },
        { method: "GET", path: "/lookup/uroki", desc: "Учебник Хайрова — уроки, фразы, словарь" },
        { method: "GET", path: "/lookup/tariev", desc: "Словарь Тариевой 2009 (ING/RU, парадигма)" },
        { method: "GET", path: "/metrics", desc: "Метрики загрузки" },
        { method: "GET", path: "/health", desc: "Статус сервиса" },
        { method: "POST", path: "/ai/assist", desc: "LLM-задачи" }
      ],
      metrics: getMetrics().current,
      grammar: {
        patterns: inventory.patterns,
        rules: inventory.rules,
        lexemes: inventory.lexemes,
        nounClassEntries: inventory.nounClassEntries,
        grammarOverviewSections: inventory.grammarOverviewSections,
        nicholsGrammarSections: inventory.nicholsGrammarSections,
        nicholsPriorityChapters: inventory.nicholsPriorityChapters,
        nicholsNumeralParadigms: inventory.nicholsNumeralParadigms,
        nicholsUniqueStats: inventory.nicholsUniqueStats,
        desheriev99Sections: inventory.desheriev99Sections,
        naanaMottSections: inventory.naanaMottSections,
        naanaMottStats: inventory.naanaMottStats,
        medKodzoevItems: inventory.medKodzoevItems,
        medKodzoevKnowledgeSections: inventory.medKodzoevKnowledgeSections,
        tariev2009Items: inventory.tariev2009Items,
        tariev2009VerbsWithParadigm: inventory.tariev2009VerbsWithParadigm,
        tariev2009KnowledgeSections: inventory.tariev2009KnowledgeSections,
        uroki2009Lessons: inventory.uroki2009Lessons,
        uroki2009Phrases: inventory.uroki2009Phrases,
        uroki2009Vocabulary: inventory.uroki2009Vocabulary,
        uroki2009KnowledgeSections: inventory.uroki2009KnowledgeSections,
        morphemika2020Sections: inventory.morphemika2020Sections,
        morphemika2020Affixes: inventory.morphemika2020Affixes,
        morphemika2020Stats: inventory.morphemika2020Stats
      },
      links: { home: "/", admin: "/admin/", manifest: "/site.webmanifest" }
    });
  }

  if (req.method === "GET" && path === "/moderation/pending") {
    return sendJson(res, 200, { ok: true, items: getModerationQueue() });
  }

  if (req.method === "POST" && path === "/refresh") {
    const body = await readBody(req);
    const pullCategories =
      !!body?.pullCategories ||
      String(process.env.PULL_CATEGORIES_ON_REFRESH ?? "").toLowerCase() === "true";
    const result = await refreshAllSources({ pullCategories });
    if (!result?.ok) {
      return sendJson(res, 503, { ok: false, error: result.error, detail: result.detail || "" });
    }
    return sendJson(res, 200, { ok: true, refreshed: true, ...result });
  }

  if (req.method === "POST" && path === "/translate") {
    if (!dataReady) {
      return sendJson(res, 503, { ok: false, error: "data_loading", detail: "Подождите несколько секунд после перезапуска" });
    }
    const body = await readBody(req);
    const result = await translate(body?.ru || "", {
      skipHabar: !!body?.skipHabar,
      excludeSources: Array.isArray(body?.excludeSources) ? body.excludeSources : [],
      tense: body?.tense || null
    });
    if (!result.ok) {
      return sendJson(res, result.status || 400, {
        ok: false,
        error: result.error,
        detail: result.detail || ""
      });
    }
    return sendJson(res, 200, {
      ok: true,
      translation: result.translation,
      usedSource: result.usedSource,
      confidence: result.confidence,
      fallbackUsed: result.fallbackUsed,
      ...(result.paradigm ? { paradigm: result.paradigm, tense: result.tense } : {})
    });
  }

  if (req.method === "POST" && path === "/ai/assist") {
    const body = await readBody(req);
    const result = await assistTask(body?.task || "", body?.text || "");
    if (!result.ok) {
      return sendJson(res, result.status || 400, { ok: false, error: result.error });
    }
    return sendJson(res, 200, { ok: true, text: result.text });
  }

  if (req.method === "GET") {
    const isPublicAsset =
      path === "/"
      || path === "/index.html"
      ||       path === "/site.webmanifest"
      || path === "/favicon.ico"
      || path === "/favicon.svg"
      || path === "/apple-touch-icon.png"
      || path.startsWith("/assets/");
    if (isPublicAsset) {
      return sendPublicStatic(req, res, path);
    }
  }

  return sendJson(res, 404, { ok: false, error: "not_found" });
}

let dataReady = false;

async function start() {
  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      sendJson(res, 500, { ok: false, error: "internal_error", details: err?.message || "unknown" });
    });
  });

  server.listen(PORT, () => {
    process.stdout.write(`Ghalghay API listening on http://localhost:${PORT}\n`);
    process.stdout.write(`Public site: http://localhost:${PORT}/\n`);
    process.stdout.write(`Admin panel: http://localhost:${PORT}/admin\n`);
  });

  try {
    await refreshAllSources();
    dataReady = true;
    process.stdout.write("LanguageAPI data loaded\n");
  } catch (err) {
    process.stderr.write(`LanguageAPI data load failed: ${err?.message || err}\n`);
  }
}

start().catch((err) => {
  process.stderr.write(`Failed to start LanguageAPI: ${err?.message || err}\n`);
  process.exit(1);
});

