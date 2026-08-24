"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { whichPi } = require("./updater");

let cachedModule = null;
let cachedRoot = null;

async function findPackageRoot(settings) {
  const bin = await whichPi(settings.piPath || undefined);
  if (!bin) throw new Error("pi non installato");
  let cursor = path.dirname(fs.realpathSync(bin));
  while (true) {
    const manifest = path.join(cursor, "package.json");
    if (fs.existsSync(manifest)) {
      try {
        if (JSON.parse(fs.readFileSync(manifest, "utf8")).name === "@earendil-works/pi-coding-agent") return cursor;
      } catch {}
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  throw new Error("Installazione di pi non compatibile con il login integrato");
}

async function loadModule(settings) {
  const root = await findPackageRoot(settings);
  if (cachedModule && cachedRoot === root) return cachedModule;
  cachedModule = await import(pathToFileURL(path.join(root, "dist", "index.js")).href);
  cachedRoot = root;
  return cachedModule;
}

async function createRuntime(settings) {
  const { ModelRuntime } = await loadModule(settings);
  return ModelRuntime.create({ allowModelNetwork: false, signal: AbortSignal.timeout(15000) });
}

async function listProviders(settings) {
  const runtime = await createRuntime(settings);
  const credentials = await runtime.listCredentials({ signal: AbortSignal.timeout(15000) }).catch(() => []);
  const credentialMap = new Map(credentials.map((credential) => [credential.providerId, credential]));
  return runtime.getProviders().map((provider) => ({
    id: provider.id,
    name: provider.name,
    authTypes: [provider.auth?.apiKey?.login ? "api_key" : null, provider.auth?.oauth ? "oauth" : null].filter(Boolean),
    apiKeyName: provider.auth?.apiKey?.name || null,
    oauthName: provider.auth?.oauth?.name || null,
    oauthLabel: provider.auth?.oauth?.loginLabel || null,
    nativeCredential: credentialMap.get(provider.id) || null,
  }));
}

async function login(settings, providerId, type, interaction) {
  if (!["api_key", "oauth"].includes(type)) throw new Error("Tipo di autenticazione non valido");
  const runtime = await createRuntime(settings);
  const provider = runtime.getProvider(providerId);
  if (!provider) throw new Error(`Provider sconosciuto: ${providerId}`);
  if (type === "api_key" && !provider.auth?.apiKey?.login) throw new Error("Questo provider non supporta una configurazione API key interattiva");
  if (type === "oauth" && !provider.auth?.oauth) throw new Error("Questo provider non supporta OAuth");
  return runtime.login(providerId, type, interaction);
}

async function logout(settings, providerId) {
  const runtime = await createRuntime(settings);
  if (!runtime.getProvider(providerId)) throw new Error(`Provider sconosciuto: ${providerId}`);
  await runtime.logout(providerId, { signal: AbortSignal.timeout(15000) });
}

module.exports = { findPackageRoot, listProviders, login, logout };
