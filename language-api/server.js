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
  translate,
  assistTask,
  getMetrics,
  getModerationQueue,
  testGeminiConnection
} = require("./src/platform");

const adminStore = require("./src/admin-store");

const PORT = Number(process.env.PORT || 8787);
const ADMIN_DIR = path.join(__dirname, "admin");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
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

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function sendAdminStatic(req, res, urlPath) {
  let rel = urlPath.replace(/^\/admin\/?/, "") || "index.html";
  if (rel.includes("..")) return sendText(res, 403, "Forbidden");
  const filePath = path.join(ADMIN_DIR, rel);
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      return sendAdminStatic(req, res, "/admin/index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const data = await fsp.readFile(filePath);
    sendText(res, 200, data, MIME[ext] || "application/octet-stream");
  } catch {
    sendText(res, 404, "Not found");
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
    const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
    const geminiConfigured = geminiKey.length > 10 && !/вставьте_ключ/i.test(geminiKey);
    return sendJson(res, 200, {
      ok: true,
      service: "language-api",
      geminiConfigured,
      geminiKeyPrefix: geminiConfigured ? `${geminiKey.slice(0, 8)}…` : "",
      geminiKeyLength: geminiKey.length
    });
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

  if (req.method === "GET" && path === "/metrics") {
    return sendJson(res, 200, { ok: true, metrics: getMetrics() });
  }

  if (req.method === "GET" && path === "/moderation/pending") {
    return sendJson(res, 200, { ok: true, items: getModerationQueue() });
  }

  if (req.method === "POST" && path === "/refresh") {
    await refreshAllSources();
    return sendJson(res, 200, { ok: true, refreshed: true });
  }

  if (req.method === "POST" && path === "/translate") {
    const body = await readBody(req);
    const result = await translate(body?.ru || "", {
      skipHabar: !!body?.skipHabar,
      excludeSources: Array.isArray(body?.excludeSources) ? body.excludeSources : []
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
      fallbackUsed: result.fallbackUsed
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

  return sendJson(res, 404, { ok: false, error: "not_found" });
}

async function start() {
  await refreshAllSources();
  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      sendJson(res, 500, { ok: false, error: "internal_error", details: err?.message || "unknown" });
    });
  });

  server.listen(PORT, () => {
    process.stdout.write(`LanguageAPI listening on http://localhost:${PORT}\n`);
    process.stdout.write(`Admin panel: http://localhost:${PORT}/admin\n`);
  });
}

start().catch((err) => {
  process.stderr.write(`Failed to start LanguageAPI: ${err?.message || err}\n`);
  process.exit(1);
});

