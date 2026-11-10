const https = require("node:https");
const { randomUUID } = require("node:crypto");
const { URL } = require("node:url");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlaceholderKey(value) {
  return !value || /вставьте_ключ|your[_-]?key|changeme/i.test(value);
}

function getOpenRouterKey() {
  return (process.env.OPENROUTER_API_KEY || "").trim();
}

function getGeminiKey() {
  return (process.env.GEMINI_API_KEY || "").trim();
}

function getGigaChatCredentials() {
  return (process.env.GIGACHAT_CREDENTIALS || process.env.GIGACHAT_AUTH_KEY || "").trim();
}

function getGigaChatScope() {
  return (process.env.GIGACHAT_SCOPE || "GIGACHAT_API_PERS").trim();
}

function getGigaChatModel() {
  return (process.env.GIGACHAT_MODEL || "GigaChat").trim();
}

function getGigaChatBaseUrl() {
  return (process.env.GIGACHAT_BASE_URL || "https://gigachat.devices.sberbank.ru/api/v1").trim().replace(/\/$/, "");
}

function getGigaChatOauthUrl() {
  return (process.env.GIGACHAT_OAUTH_URL || "https://ngw.devices.sberbank.ru:9443/api/v2/oauth").trim();
}

function gigaChatTlsInsecure() {
  return !/^(0|false|no)$/i.test(String(process.env.GIGACHAT_TLS_INSECURE ?? "true").trim());
}

function getOpenRouterModel() {
  return (process.env.OPENROUTER_MODEL || "openrouter/free").trim();
}

let gigaTokenCache = { accessToken: "", expiresAtMs: 0 };

function httpsJsonRequest(urlString, { method = "GET", headers = {}, body = null, insecure = false } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    const payload = body == null ? null : Buffer.from(body, "utf8");
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          ...headers,
          ...(payload ? { "Content-Length": String(payload.length) } : {})
        },
        rejectUnauthorized: !insecure
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode || 0, text, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function openRouterFallbackModels() {
  const freeOnly = !/^(0|false|no)$/i.test(String(process.env.OPENROUTER_FREE_ONLY ?? "true").trim());
  const free = [
    getOpenRouterModel(),
    "openrouter/free",
    "deepseek/deepseek-v4-flash:free",
    "qwen/qwen3-coder:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "openai/gpt-oss-20b:free"
  ];
  const paid = [
    getOpenRouterModel(),
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001"
  ];
  return (freeOnly ? free : [...paid, ...free])
    .filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function geminiFallbackEnabled() {
  return /^(1|true|yes)$/i.test(String(process.env.LLM_GEMINI_FALLBACK || "").trim());
}

function llmProviderOrder() {
  const raw = (process.env.LLM_ORDER || "gigachat,openrouter,gemini").trim();
  const wanted = raw
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(["gigachat", "openrouter", "gemini"]);
  const ordered = wanted.filter((x) => allowed.has(x));
  for (const name of ["gigachat", "openrouter", "gemini"]) {
    if (!ordered.includes(name)) ordered.push(name);
  }
  return ordered;
}

function getLlmConfig() {
  const openrouterKey = getOpenRouterKey();
  const geminiKey = getGeminiKey();
  const gigaCredentials = getGigaChatCredentials();
  const openrouterConfigured = openrouterKey.length > 10 && !isPlaceholderKey(openrouterKey);
  const geminiConfigured = geminiKey.length > 10 && !isPlaceholderKey(geminiKey);
  const gigachatConfigured = gigaCredentials.length > 10 && !isPlaceholderKey(gigaCredentials);
  const order = llmProviderOrder().filter((name) => {
    if (name === "gigachat") return gigachatConfigured;
    if (name === "openrouter") return openrouterConfigured;
    if (name === "gemini") return geminiConfigured;
    return false;
  });
  const primary = order[0] || "";

  return {
    primary,
    order,
    openrouterConfigured,
    geminiConfigured,
    gigachatConfigured,
    openrouterModel: getOpenRouterModel(),
    gigachatModel: getGigaChatModel(),
    openrouterKeyLength: openrouterKey.length,
    geminiKeyLength: geminiKey.length,
    gigachatKeyLength: gigaCredentials.length
  };
}

function parseRetryDelayMs(errText) {
  try {
    const json = JSON.parse(errText);
    for (const d of json?.error?.details || []) {
      if (String(d?.["@type"] || "").includes("RetryInfo") && d.retryDelay) {
        const sec = parseFloat(String(d.retryDelay).replace(/s$/i, ""));
        if (Number.isFinite(sec) && sec > 0) return Math.min(Math.ceil(sec * 1000), 15000);
      }
    }
    const m = /retry in ([0-9.]+)s/i.exec(json?.error?.message || "");
    if (m) return Math.min(Math.ceil(parseFloat(m[1]) * 1000), 15000);
  } catch {
    // ignore
  }
  return 2000;
}

function parseGeminiHttpError(errText, status) {
  let message = "";
  try {
    const json = JSON.parse(errText);
    message = json?.error?.message || message;
  } catch {
    // keep raw text
  }
  const hay = `${message} ${errText || ""}`;

  if (/api key expired|key has expired|expired.*api key/i.test(hay)) {
    return { error: "gemini_key_expired", detail: message || "API key expired" };
  }
  if (/api key not valid|invalid api key|API_KEY_INVALID|API key not valid/i.test(hay)) {
    return { error: "invalid_gemini_key", detail: message || "Invalid API key" };
  }
  if (/FAILED_PRECONDITION|location is not supported|not available in your country|User location/i.test(hay)) {
    return { error: "gemini_region_blocked", detail: message || "Region blocked" };
  }
  if (
    status === 429
    || /RESOURCE_EXHAUSTED|exceeded your current quota|Quota exceeded|rate.?limit/i.test(hay)
  ) {
    return { error: "gemini_quota_exceeded", detail: message || "Quota exceeded" };
  }
  if (/PERMISSION_DENIED|permission denied|API has not been used/i.test(hay)) {
    return { error: "gemini_permission_denied", detail: message || "Permission denied" };
  }
  return { error: `llm_http_${status}`, detail: message || `HTTP ${status}` };
}

function parseOpenRouterHttpError(errText, status) {
  let message = "";
  try {
    const json = JSON.parse(errText);
    message = json?.error?.message || json?.message || message;
  } catch {
    message = errText || "";
  }
  const hay = `${message} ${errText || ""}`;

  if (/invalid.*api.*key|unauthorized|authentication/i.test(hay)) {
    return { error: "invalid_openrouter_key", detail: message || "Invalid OpenRouter key" };
  }
  if (status === 429 || /rate.?limit|too many requests/i.test(hay)) {
    return { error: "openrouter_rate_limited", detail: message || "Rate limited" };
  }
  if (/insufficient credits|credit balance|billing/i.test(hay)) {
    return { error: "openrouter_no_credits", detail: message || "Insufficient credits" };
  }
  return { error: `llm_http_${status}`, detail: message || `HTTP ${status}` };
}

async function requestGeminiModel(key, model, body, allowRetry) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (res.ok) return { res, errText: "" };

  const errText = await res.text().catch(() => "");
  if (allowRetry && res.status === 429) {
    await sleep(parseRetryDelayMs(errText));
    const retryRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (retryRes.ok) return { res: retryRes, errText: "" };
    return { res: retryRes, errText: await retryRes.text().catch(() => "") };
  }
  return { res, errText };
}

async function callGemini(prompt) {
  const key = getGeminiKey();
  if (isPlaceholderKey(key)) {
    return { ok: false, text: "", error: "missing_gemini_key", detail: "", provider: "gemini" };
  }

  const models = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-flash-latest",
    "gemini-flash-latest"
  ];
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2 }
  };

  let lastError = "llm_failed";
  let lastDetail = "";
  let sawQuotaError = false;
  for (const model of models) {
    try {
      const { res, errText } = await requestGeminiModel(key, model, body, true);
      if (!res.ok) {
        const parsed = parseGeminiHttpError(errText, res.status);
        if (parsed.error === "invalid_gemini_key" || parsed.error === "gemini_key_expired") {
          return { ok: false, text: "", error: parsed.error, detail: parsed.detail, provider: "gemini" };
        }
        if (parsed.error === "gemini_region_blocked") {
          return { ok: false, text: "", error: parsed.error, detail: parsed.detail, provider: "gemini" };
        }
        if (parsed.error === "gemini_quota_exceeded") {
          sawQuotaError = true;
          lastError = parsed.error;
          lastDetail = parsed.detail;
          continue;
        }
        if (parsed.error === "gemini_permission_denied") {
          return { ok: false, text: "", error: parsed.error, detail: parsed.detail, provider: "gemini" };
        }
        lastError = parsed.error;
        lastDetail = parsed.detail;
        continue;
      }
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((x) => x?.text || "").join("").trim();
      if (text) return { ok: true, text, error: "", detail: "", provider: "gemini" };
      lastError = "llm_empty";
      lastDetail = "Empty model response";
    } catch {
      lastError = "llm_fetch_failed";
      lastDetail = "Network error";
    }
  }
  if (sawQuotaError) {
    return { ok: false, text: "", error: "gemini_quota_exceeded", detail: lastDetail, provider: "gemini" };
  }
  return { ok: false, text: "", error: lastError, detail: lastDetail, provider: "gemini" };
}

async function requestOpenRouterOnce(key, model, prompt, referer, title) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": referer,
      "X-Title": title
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 512
    })
  });
  const errText = res.ok ? "" : await res.text().catch(() => "");
  return { res, errText };
}

async function callOpenRouter(prompt) {
  const key = getOpenRouterKey();
  if (isPlaceholderKey(key)) {
    return { ok: false, text: "", error: "missing_openrouter_key", detail: "", provider: "openrouter" };
  }

  const models = openRouterFallbackModels();
  const referer = (process.env.OPENROUTER_SITE_URL || "https://api.inghub.ru").trim();
  const title = (process.env.OPENROUTER_APP_NAME || "Ingush LanguageAPI").trim();
  const retry429Ms = Number(process.env.OPENROUTER_RETRY_MS || 3500);

  let lastError = "llm_failed";
  let lastDetail = "";
  const attempts = [];

  for (const model of models) {
    let triedRetry = false;
    while (true) {
      try {
        const { res, errText } = await requestOpenRouterOnce(key, model, prompt, referer, title);

        if (!res.ok) {
          const parsed = parseOpenRouterHttpError(errText, res.status);
          attempts.push({ model, error: parsed.error, detail: parsed.detail, status: res.status });
          if (parsed.error === "invalid_openrouter_key") {
            return {
              ok: false,
              text: "",
              error: parsed.error,
              detail: parsed.detail,
              provider: "openrouter",
              attempts
            };
          }
          if (parsed.error === "openrouter_rate_limited" && !triedRetry) {
            triedRetry = true;
            await sleep(retry429Ms);
            continue;
          }
          lastError = parsed.error;
          lastDetail = `${model}: ${parsed.detail}`;
          break;
        }

        const json = await res.json();
        const routedModel = (json?.model || model).toString();
        const text = (json?.choices?.[0]?.message?.content || "").trim();
        if (text) {
          return {
            ok: true,
            text,
            error: "",
            detail: routedModel,
            provider: "openrouter",
            attempts
          };
        }
        attempts.push({ model, error: "llm_empty", detail: "Empty response" });
        lastError = "llm_empty";
        lastDetail = `Empty response from ${model}`;
        break;
      } catch (err) {
        attempts.push({ model, error: "llm_fetch_failed", detail: err?.message || "Network error" });
        lastError = "llm_fetch_failed";
        lastDetail = err?.message || "Network error";
        break;
      }
    }

    if (attempts.length && attempts[attempts.length - 1]?.error === "openrouter_rate_limited") {
      await sleep(1200);
    }
  }

  return {
    ok: false,
    text: "",
    error: lastError,
    detail: lastDetail,
    provider: "openrouter",
    attempts
  };
}

async function getGigaChatAccessToken() {
  const credentials = getGigaChatCredentials();
  if (isPlaceholderKey(credentials)) {
    return { ok: false, error: "missing_gigachat_key", detail: "Set GIGACHAT_CREDENTIALS" };
  }

  const now = Date.now();
  if (gigaTokenCache.accessToken && gigaTokenCache.expiresAtMs > now + 60_000) {
    return { ok: true, accessToken: gigaTokenCache.accessToken };
  }

  const authValue = /^Basic\s+/i.test(credentials) ? credentials : `Basic ${credentials}`;
  const oauthUrl = getGigaChatOauthUrl();
  try {
    const res = await httpsJsonRequest(oauthUrl, {
      method: "POST",
      insecure: gigaChatTlsInsecure(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        RqUID: randomUUID(),
        Authorization: authValue
      },
      body: `scope=${encodeURIComponent(getGigaChatScope())}`
    });

    if (res.status < 200 || res.status >= 300) {
      let detail = res.text.slice(0, 300);
      try {
        const json = JSON.parse(res.text);
        detail = json?.message || json?.error_description || json?.error || detail;
      } catch {
        // keep
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "invalid_gigachat_key", detail };
      }
      return { ok: false, error: `gigachat_oauth_${res.status}`, detail };
    }

    const json = JSON.parse(res.text);
    const accessToken = (json?.access_token || "").toString();
    if (!accessToken) {
      return { ok: false, error: "gigachat_oauth_empty", detail: "No access_token" };
    }
    const expiresAt = Number(json?.expires_at) || 0;
    gigaTokenCache = {
      accessToken,
      expiresAtMs: expiresAt > 1e12 ? expiresAt : expiresAt * 1000 || now + 25 * 60_000
    };
    return { ok: true, accessToken };
  } catch (err) {
    return { ok: false, error: "gigachat_oauth_failed", detail: err?.message || "Network error" };
  }
}

async function callGigaChat(prompt) {
  const credentials = getGigaChatCredentials();
  if (isPlaceholderKey(credentials)) {
    return { ok: false, text: "", error: "missing_gigachat_key", detail: "", provider: "gigachat" };
  }

  const token = await getGigaChatAccessToken();
  if (!token.ok) {
    return { ok: false, text: "", error: token.error, detail: token.detail || "", provider: "gigachat" };
  }

  const model = getGigaChatModel();
  const url = `${getGigaChatBaseUrl()}/chat/completions`;
  try {
    const res = await httpsJsonRequest(url, {
      method: "POST",
      insecure: gigaChatTlsInsecure(),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.accessToken}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 512
      })
    });

    if (res.status < 200 || res.status >= 300) {
      let detail = res.text.slice(0, 400);
      try {
        const json = JSON.parse(res.text);
        detail = json?.message || json?.error?.message || json?.error || detail;
      } catch {
        // keep
      }
      if (res.status === 401) {
        gigaTokenCache = { accessToken: "", expiresAtMs: 0 };
        return { ok: false, text: "", error: "gigachat_unauthorized", detail, provider: "gigachat" };
      }
      return { ok: false, text: "", error: `gigachat_http_${res.status}`, detail, provider: "gigachat" };
    }

    const json = JSON.parse(res.text);
    const text = (json?.choices?.[0]?.message?.content || "").toString().trim();
    if (!text) {
      return { ok: false, text: "", error: "llm_empty", detail: "Empty GigaChat response", provider: "gigachat" };
    }
    return { ok: true, text, error: "", detail: model, provider: "gigachat" };
  } catch (err) {
    return {
      ok: false,
      text: "",
      error: "gigachat_fetch_failed",
      detail: err?.message || "Network error",
      provider: "gigachat"
    };
  }
}

async function callProvider(provider, prompt) {
  if (provider === "gigachat") return callGigaChat(prompt);
  if (provider === "openrouter") return callOpenRouter(prompt);
  if (provider === "gemini") return callGemini(prompt);
  return { ok: false, text: "", error: "unknown_provider", detail: provider, provider: "" };
}

async function callLlm(prompt) {
  const config = getLlmConfig();
  let providers = [...(config.order || [])];

  // Старый флаг: Gemini только если явно разрешён fallback, когда OpenRouter уже в списке
  if (!geminiFallbackEnabled() && config.openrouterConfigured) {
    providers = providers.filter((p) => p !== "gemini");
  }

  if (!providers.length) {
    return {
      ok: false,
      text: "",
      error: "missing_llm_key",
      detail: "Set GIGACHAT_CREDENTIALS, OPENROUTER_API_KEY or GEMINI_API_KEY",
      provider: ""
    };
  }

  let last = { ok: false, text: "", error: "llm_failed", detail: "", provider: "" };
  for (const provider of providers) {
    const result = await callProvider(provider, prompt);
    if (result.ok) return result;
    last = result;
  }

  return last;
}

async function testLlmConnection() {
  const config = getLlmConfig();
  if (!config.primary) {
    return {
      ok: false,
      ...config,
      error: "missing_llm_key",
      detail: "Задайте GigaChat / OpenRouter / Gemini в админке (шестерёнка) или в .env"
    };
  }

  const attempts = [];
  for (const provider of config.order || []) {
    const result = await callProvider(provider, "Ответь одним словом: тест");
    attempts.push({
      provider,
      ok: !!result.ok,
      error: result.error || "",
      detail: result.detail || ""
    });
    if (result.ok) {
      return {
        ok: true,
        ...config,
        provider,
        model: result.detail || "",
        error: "",
        detail: result.detail || "",
        attempts
      };
    }
  }

  const last = attempts[attempts.length - 1] || {};
  return {
    ok: false,
    ...config,
    provider: last.provider || config.primary,
    model: "",
    error: last.error || "llm_failed",
    detail: last.detail || "",
    attempts
  };
}

async function testGeminiConnection() {
  const config = getLlmConfig();
  if (!config.geminiConfigured) {
    return {
      ok: false,
      geminiConfigured: false,
      keyLength: config.geminiKeyLength,
      error: "missing_gemini_key",
      detail: "GEMINI_API_KEY is empty or placeholder"
    };
  }

  const llm = await callGemini("Ответь одним словом: тест");
  return {
    ok: llm.ok,
    geminiConfigured: true,
    keyLength: config.geminiKeyLength,
    error: llm.error || "",
    detail: llm.detail || ""
  };
}

module.exports = {
  getLlmConfig,
  callLlm,
  callGemini,
  callOpenRouter,
  callGigaChat,
  testLlmConnection,
  testGeminiConnection
};
