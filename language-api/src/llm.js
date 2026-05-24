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

function getOpenRouterModel() {
  return (process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-3b-instruct:free").trim();
}

function openRouterFallbackModels() {
  const freeOnly = !/^(0|false|no)$/i.test(String(process.env.OPENROUTER_FREE_ONLY ?? "true").trim());
  const paid = [
    getOpenRouterModel(),
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001"
  ];
  const free = [
    getOpenRouterModel(),
    "meta-llama/llama-3.2-3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen-3-4b:free",
    "google/gemini-2.0-flash-exp:free"
  ];
  return (freeOnly ? free : [...paid, ...free])
    .filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function geminiFallbackEnabled() {
  return /^(1|true|yes)$/i.test(String(process.env.LLM_GEMINI_FALLBACK || "").trim());
}

function getLlmConfig() {
  const openrouterKey = getOpenRouterKey();
  const geminiKey = getGeminiKey();
  const openrouterConfigured = openrouterKey.length > 10 && !isPlaceholderKey(openrouterKey);
  const geminiConfigured = geminiKey.length > 10 && !isPlaceholderKey(geminiKey);
  const primary = openrouterConfigured ? "openrouter" : geminiConfigured ? "gemini" : "";

  return {
    primary,
    openrouterConfigured,
    geminiConfigured,
    openrouterModel: getOpenRouterModel(),
    openrouterKeyLength: openrouterKey.length,
    geminiKeyLength: geminiKey.length
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

async function callOpenRouter(prompt) {
  const key = getOpenRouterKey();
  if (isPlaceholderKey(key)) {
    return { ok: false, text: "", error: "missing_openrouter_key", detail: "", provider: "openrouter" };
  }

  const models = openRouterFallbackModels();

  const referer = (process.env.OPENROUTER_SITE_URL || "https://api.inghub.ru").trim();
  const title = (process.env.OPENROUTER_APP_NAME || "Ingush LanguageAPI").trim();

  let lastError = "llm_failed";
  let lastDetail = "";
  const attempts = [];
  for (const model of models) {
    try {
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

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
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
        lastError = parsed.error;
        lastDetail = `${model}: ${parsed.detail}`;
        continue;
      }

      const json = await res.json();
      const text = (json?.choices?.[0]?.message?.content || "").trim();
      if (text) {
        return { ok: true, text, error: "", detail: model, provider: "openrouter", attempts };
      }
      attempts.push({ model, error: "llm_empty", detail: "Empty response" });
      lastError = "llm_empty";
      lastDetail = `Empty response from ${model}`;
    } catch (err) {
      attempts.push({ model, error: "llm_fetch_failed", detail: err?.message || "Network error" });
      lastError = "llm_fetch_failed";
      lastDetail = err?.message || "Network error";
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

async function callLlm(prompt) {
  const config = getLlmConfig();
  const providers = [];

  if (config.openrouterConfigured) providers.push("openrouter");
  if (config.geminiConfigured && (!config.openrouterConfigured || geminiFallbackEnabled())) {
    providers.push("gemini");
  }

  if (!providers.length) {
    return { ok: false, text: "", error: "missing_llm_key", detail: "Set OPENROUTER_API_KEY or GEMINI_API_KEY", provider: "" };
  }

  let last = { ok: false, text: "", error: "llm_failed", detail: "", provider: "" };
  for (const provider of providers) {
    const result = provider === "openrouter" ? await callOpenRouter(prompt) : await callGemini(prompt);
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
      detail: "Set OPENROUTER_API_KEY (recommended on RU VPS) or GEMINI_API_KEY"
    };
  }

  if (config.openrouterConfigured) {
    const or = await callOpenRouter("Ответь одним словом: тест");
    if (or.ok) {
      return {
        ok: true,
        ...config,
        provider: "openrouter",
        model: or.detail || "",
        error: "",
        detail: or.detail || ""
      };
    }

    const out = {
      ok: false,
      ...config,
      provider: "openrouter",
      model: "",
      error: or.error || "openrouter_failed",
      detail: or.detail || "",
      openrouterAttempts: or.attempts || []
    };

    if (config.geminiConfigured && geminiFallbackEnabled()) {
      const gem = await callGemini("Ответь одним словом: тест");
      out.geminiFallback = {
        ok: gem.ok,
        error: gem.error || "",
        detail: gem.detail || ""
      };
      if (gem.ok) {
        return { ok: true, ...config, provider: "gemini", model: "", error: "", detail: "via gemini fallback" };
      }
    }

    return out;
  }

  const llm = await callGemini("Ответь одним словом: тест");
  return {
    ok: llm.ok,
    ...config,
    provider: "gemini",
    model: llm.detail || "",
    error: llm.error || "",
    detail: llm.detail || ""
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
  testLlmConnection,
  testGeminiConnection
};
