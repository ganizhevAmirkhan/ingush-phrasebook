const http = require("node:http");
const fs = require("node:fs");
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
  getModerationQueue
} = require("./src/platform");

const PORT = Number(process.env.PORT || 8787);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(JSON.stringify(payload, null, 2));
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

  if (req.method === "GET" && path === "/health") {
    const geminiKey = (process.env.GEMINI_API_KEY || "").trim();
    const geminiConfigured = geminiKey.length > 10 && !/вставьте_ключ/i.test(geminiKey);
    return sendJson(res, 200, {
      ok: true,
      service: "language-api",
      geminiConfigured
    });
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
      return sendJson(res, result.status || 400, { ok: false, error: result.error });
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
  });
}

start().catch((err) => {
  process.stderr.write(`Failed to start LanguageAPI: ${err?.message || err}\n`);
  process.exit(1);
});

