"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROVIDERS = [
  { id: "openai-codex", name: "ChatGPT Plus / Pro", envVar: null, hint: "Abbonamento ChatGPT tramite OAuth", oauthOnly: true },
  { id: "github-copilot", name: "GitHub Copilot", envVar: null, hint: "Abbonamento Copilot tramite OAuth", oauthOnly: true },
  { id: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY", hint: "Claude" },
  { id: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY", hint: "GPT e modelli OpenAI" },
  { id: "google", name: "Google Gemini", envVar: "GEMINI_API_KEY", hint: "Gemini" },
  { id: "openrouter", name: "OpenRouter", envVar: "OPENROUTER_API_KEY", hint: "Catalogo multi-provider" },
  { id: "xai", name: "xAI", envVar: "XAI_API_KEY", hint: "Grok" },
  { id: "deepseek", name: "DeepSeek", envVar: "DEEPSEEK_API_KEY", hint: "DeepSeek Chat e Reasoner" },
  { id: "mistral", name: "Mistral", envVar: "MISTRAL_API_KEY", hint: "Modelli Mistral" },
  { id: "groq", name: "Groq", envVar: "GROQ_API_KEY", hint: "Inferenza Groq" },
  { id: "cerebras", name: "Cerebras", envVar: "CEREBRAS_API_KEY", hint: "Inferenza Cerebras" },
  { id: "nvidia", name: "NVIDIA NIM", envVar: "NVIDIA_API_KEY", hint: "Catalogo NVIDIA" },
  { id: "opencode", name: "OpenCode Zen", envVar: "OPENCODE_API_KEY", hint: "Provider OpenCode Zen" },
  { id: "opencode-go", name: "OpenCode Go", envVar: "OPENCODE_API_KEY", hint: "Provider OpenCode Go" },
  { id: "together", name: "Together AI", envVar: "TOGETHER_API_KEY", hint: "Catalogo Together" },
  { id: "fireworks", name: "Fireworks", envVar: "FIREWORKS_API_KEY", hint: "Catalogo Fireworks" },
  { id: "huggingface", name: "Hugging Face", envVar: "HF_TOKEN", hint: "Inference Providers" },
  { id: "kimi-coding", name: "Kimi For Coding", envVar: "KIMI_API_KEY", hint: "Kimi coding plan" },
  { id: "minimax", name: "MiniMax", envVar: "MINIMAX_API_KEY", hint: "Modelli MiniMax" },
  { id: "radius", name: "Radius", envVar: "RADIUS_API_KEY", hint: "Modelli Radius" },
];

function defaultAuthFile() {
  return path.join(os.homedir(), ".pi", "agent", "auth.json");
}

function readAuth(authFile = defaultAuthFile()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(authFile, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readAuthForWrite(authFile) {
  if (!fs.existsSync(authFile)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(authFile, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("formato non valido");
    return parsed;
  } catch (err) {
    throw new Error(`Impossibile modificare auth.json: ${err.message}`);
  }
}

function maskKey(value) {
  if (typeof value !== "string" || !value) return "";
  if (value.startsWith("$") || value.startsWith("!")) return "configurata";
  const tail = value.slice(-4);
  return `••••••••${tail ? " " + tail : ""}`;
}

function listProviders(authFile = defaultAuthFile(), nativeProviders = null) {
  const auth = readAuthForWrite(authFile);
  const known = new Map(PROVIDERS.map((provider) => [provider.id, provider]));
  let definitions = Array.isArray(nativeProviders) && nativeProviders.length
    ? nativeProviders.map((provider) => ({
        ...known.get(provider.id),
        ...provider,
        hint: provider.oauthName || provider.apiKeyName || known.get(provider.id)?.hint || provider.name,
        oauthOnly: provider.authTypes?.includes("oauth") && !provider.authTypes?.includes("api_key"),
      }))
    : [...PROVIDERS];
  for (const providerId of Object.keys(auth)) {
    if (!definitions.some((provider) => provider.id === providerId)) {
      definitions.push({ id: providerId, name: providerId, envVar: null, hint: "Provider aggiunto da Pi o da un’estensione", authTypes: [] });
    }
  }
  return definitions.map((provider) => {
    const credential = auth[provider.id];
    const fromEnvironment = !credential && provider.envVar && Boolean(process.env[provider.envVar]);
    const type = credential?.type || (fromEnvironment ? "environment" : null);
    return {
      ...provider,
      configured: Boolean(credential || fromEnvironment || provider.nativeCredential),
      removable: Boolean(credential),
      credentialType: type,
      masked:
        type === "api_key"
          ? maskKey(credential.key)
          : type === "environment"
            ? "Variabile d’ambiente"
            : type
              ? "OAuth collegato"
              : provider.nativeCredential
                ? "Credenziale configurata"
                : "",
    };
  });
}

function writeAuth(authFile, auth) {
  fs.mkdirSync(path.dirname(authFile), { recursive: true, mode: 0o700 });
  const tempFile = `${authFile}.tmp-${process.pid}`;
  fs.writeFileSync(tempFile, JSON.stringify(auth, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tempFile, authFile);
  if (process.platform !== "win32") {
    try { fs.chmodSync(authFile, 0o600); } catch {}
  }
}

function setApiKey(providerId, key, authFile = defaultAuthFile()) {
  const provider = PROVIDERS.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error("Provider non supportato");
  if (provider.oauthOnly) throw new Error("Questo provider richiede l’accesso OAuth da pi");
  const cleanKey = String(key || "").trim();
  if (!cleanKey) throw new Error("Inserisci una API key");
  const auth = readAuthForWrite(authFile);
  auth[providerId] = { type: "api_key", key: cleanKey };
  writeAuth(authFile, auth);
  return listProviders(authFile);
}

function removeCredential(providerId, authFile = defaultAuthFile()) {
  if (!PROVIDERS.some((provider) => provider.id === providerId)) throw new Error("Provider non supportato");
  const auth = readAuthForWrite(authFile);
  delete auth[providerId];
  writeAuth(authFile, auth);
  return listProviders(authFile);
}

module.exports = {
  PROVIDERS,
  defaultAuthFile,
  readAuth,
  listProviders,
  setApiKey,
  removeCredential,
};
