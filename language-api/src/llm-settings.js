const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SETTINGS_DIR = path.join(ROOT, "data", "runtime");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "llm-settings.json");

const MANAGED_KEYS = [
  "GIGACHAT_CREDENTIALS",
  "GIGACHAT_SCOPE",
  "GIGACHAT_MODEL",
  "GIGACHAT_BASE_URL",
  "GIGACHAT_OAUTH_URL",
  "GIGACHAT_TLS_INSECURE",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_FREE_ONLY",
  "GEMINI_API_KEY",
  "LLM_ORDER",
  "LLM_GEMINI_FALLBACK"
];

const SECRET_KEYS = new Set([
  "GIGACHAT_CREDENTIALS",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY"
]);

function maskSecret(value) {
  const v = (value || "").toString();
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} символов)`;
}

function readSettingsSync() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function applySettingsToEnv(settings) {
  for (const key of MANAGED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(settings, key)) continue;
    const value = settings[key];
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (!str) {
      delete process.env[key];
      continue;
    }
    process.env[key] = str;
  }
}

function loadRuntimeLlmSettings() {
  const settings = readSettingsSync();
  applySettingsToEnv(settings);
  return settings;
}

async function getPublicLlmSettings() {
  const stored = readSettingsSync();
  const out = {};
  for (const key of MANAGED_KEYS) {
    const fromStore = Object.prototype.hasOwnProperty.call(stored, key)
      ? stored[key]
      : undefined;
    const fromEnv = process.env[key] || "";
    const value = (fromStore !== undefined && fromStore !== null && String(fromStore).trim() !== "")
      ? String(fromStore)
      : String(fromEnv || "");

    if (SECRET_KEYS.has(key)) {
      out[key] = {
        configured: value.length > 8,
        masked: maskSecret(value),
        length: value.length
      };
    } else {
      out[key] = value;
    }
  }
  return {
    ok: true,
    file: SETTINGS_FILE,
    settings: out,
    defaults: {
      GIGACHAT_SCOPE: "GIGACHAT_API_PERS",
      GIGACHAT_MODEL: "GigaChat",
      GIGACHAT_BASE_URL: "https://gigachat.devices.sberbank.ru/api/v1",
      GIGACHAT_OAUTH_URL: "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
      GIGACHAT_TLS_INSECURE: "true",
      OPENROUTER_MODEL: "openrouter/free",
      OPENROUTER_FREE_ONLY: "true",
      LLM_ORDER: "gigachat,openrouter,gemini"
    }
  };
}

async function saveLlmSettings(body = {}) {
  const current = readSettingsSync();
  const next = { ...current };

  for (const key of MANAGED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const raw = body[key];
    if (raw === null || raw === undefined) continue;
    const str = String(raw).trim();

    if (SECRET_KEYS.has(key)) {
      // Пустая строка = не трогать; специальное значение = очистить
      if (!str) continue;
      if (str === "__CLEAR__") {
        delete next[key];
        delete process.env[key];
        continue;
      }
      next[key] = str;
      continue;
    }

    if (!str) {
      delete next[key];
      delete process.env[key];
    } else {
      next[key] = str;
    }
  }

  await fsp.mkdir(SETTINGS_DIR, { recursive: true });
  await fsp.writeFile(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  applySettingsToEnv(next);

  return { ok: true, ...(await getPublicLlmSettings()) };
}

module.exports = {
  MANAGED_KEYS,
  SETTINGS_FILE,
  loadRuntimeLlmSettings,
  getPublicLlmSettings,
  saveLlmSettings,
  applySettingsToEnv
};
