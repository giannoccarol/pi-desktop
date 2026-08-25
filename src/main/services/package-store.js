"use strict";

const { spawn } = require("child_process");
const { existsSync } = require("fs");
const { resolve } = require("path");
const { whichPi } = require("../updates/updater");

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i;
const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)(?:@[^\s]+)?$/i;
const PI_CATALOG_URL = "https://pi.dev/packages";

function validatePackageName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 214 || !NPM_NAME.test(name)) throw new Error("Nome pacchetto non valido");
  return name;
}

function validateScope(value) {
  const scope = String(value || "user");
  if (!['user', 'project'].includes(scope)) throw new Error("Scope pacchetto non valido");
  return scope;
}

function validateSource(value, settings = {}) {
  const input = String(value || "").trim();
  if (!input || input.length > 2048 || /[\0\r\n]/.test(input)) throw new Error("Sorgente pacchetto non valida");
  if (input.startsWith("npm:")) {
    const spec = input.slice(4);
    if (!NPM_SPEC.test(spec)) throw new Error("Specifica npm non valida");
    return `npm:${spec}`;
  }
  if (input.startsWith("git:")) {
    const spec = input.slice(4);
    if (!spec || /\s/.test(spec) || spec.startsWith("-")) throw new Error("Sorgente git non valida");
    return `git:${spec}`;
  }
  if (NPM_SPEC.test(input)) return `npm:${input}`;
  const local = resolve(settings.cwd || process.cwd(), input);
  if (!existsSync(local)) throw new Error("Il percorso locale indicato non esiste");
  return local;
}

function stripAnsi(value) {
  return String(value || "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function parseListOutput(output) {
  const packages = [];
  let scope = null;
  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.trim() === "User packages:") {
      scope = "user";
      continue;
    }
    if (line.trim() === "Project packages:") {
      scope = "project";
      continue;
    }
    const source = line.match(/^ {2}(\S.*?)(?: \(filtered\))?$/)?.[1];
    if (scope && source) packages.push({ source, scope });
  }
  return packages;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function htmlText(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function htmlAttribute(tag, name) {
  const match = String(tag || "").match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function safeUrl(value) {
  return /^https:\/\//i.test(value || "") ? value : "";
}

function parseMonthlyDownloads(value) {
  const normalized = String(value || "").replace(/\/mo\s*$/i, "").trim().toUpperCase();
  const match = normalized.match(/^([\d.,]+)\s*([KM]?)$/);
  if (!match) return 0;
  const number = Number(match[1].replace(/,/g, ""));
  const multiplier = match[2] === "M" ? 1e6 : match[2] === "K" ? 1e3 : 1;
  return Number.isFinite(number) ? Math.round(number * multiplier) : 0;
}

function parseCatalogHtml(html, page = 1) {
  const source = String(html || "");
  const items = [];
  const cardRe = /<article\b[^>]*data-package-card=["']true["'][^>]*>[\s\S]*?<\/article>/gi;
  for (const card of source.match(cardRe) || []) {
    const name = htmlAttribute(card.match(/^<article\b[^>]*>/i)?.[0], "data-package-name");
    if (!name) continue;
    const cardTag = card.match(/^<article\b[^>]*>/i)?.[0] || "";
    const declaredTypes = (htmlAttribute(cardTag, "data-package-types") || "").split(/\s+/).filter(Boolean);
    const badgeTypes = [...card.matchAll(/data-type=["']([^"']+)["']/gi)].map((m) => decodeEntities(m[1])).filter(Boolean);
    const types = [...new Set([...declaredTypes, ...badgeTypes])];
    const description = htmlText(card.match(/<p\b[^>]*class=["'][^"']*packages-desc[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]) || "Pacchetto per pi";
    const meta = [...card.matchAll(/<div\b[^>]*class=["'][^"']*packages-meta[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)][0]?.[1] || "";
    const metaValues = [...meta.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((m) => htmlText(m[1]));
    const links = [...card.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map((m) => decodeEntities(m[1]));
    const reportLink = links.find((link) => /package-version=/i.test(link)) || "";
    let version = "";
    try { version = decodeURIComponent(reportLink.match(/package-version=([^&]+)/i)?.[1] || ""); } catch { /* malformed optional link */ }
    const npmUrl = safeUrl(links.find((link) => /npmjs\.com\/package\//i.test(link)) || `https://www.npmjs.com/package/${name}`);
    const homepage = safeUrl(links.find((link) => /github\.com\//i.test(link) && !/issues\/new/i.test(link)) || "");
    const downloads = Number(htmlAttribute(cardTag, "data-package-downloads")) || parseMonthlyDownloads(metaValues[1]);
    items.push({
      name,
      version,
      description,
      keywords: [],
      types,
      publisher: metaValues[0] || "",
      monthlyDownloads: downloads,
      downloads,
      publishedAt: Number(htmlAttribute(cardTag, "data-package-date")) || 0,
      npmUrl,
      homepage,
      score: downloads,
      installSpec: `npm:${name}`,
    });
  }
  const countText = htmlText(source.match(/class=["'][^"']*packages-count[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1] || "");
  const countMatch = (countText || source).match(/([\d,]+)\s*\/\s*([\d,]+)/);
  const total = countMatch ? Number(countMatch[2].replace(/,/g, "")) || items.length : items.length;
  return { items, total, page: Number(page) || 1, pageSize: 50 };
}

async function searchPackages(queryOrOptions = "", limit = 50) {
  const options = typeof queryOrOptions === "object" && queryOrOptions !== null
    ? queryOrOptions
    : { query: queryOrOptions, limit };
  const query = String(options.query || options.name || "").trim();
  const type = ["extension", "skill", "theme", "prompt"].includes(String(options.type || "")) ? String(options.type) : "";
  const sort = ["downloads", "recent", "name"].includes(String(options.sort || "")) ? String(options.sort) : "downloads";
  const page = Math.max(1, Number(options.page) || 1);
  const url = new URL(PI_CATALOG_URL);
  if (query) url.searchParams.set("name", query);
  if (type) url.searchParams.set("type", type);
  if (sort !== "downloads") url.searchParams.set("sort", sort);
  if (page > 1) url.searchParams.set("page", String(page));
  const response = await fetch(url, {
    headers: { accept: "text/html", "user-agent": "pi-desktop/0.1" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Catalogo pi.dev non disponibile (${response.status})`);
  const parsed = parseCatalogHtml(await response.text(), page);
  return { ...parsed, sort, type, query, catalogUrl: url.toString() };
}

async function runPi(args, settings, onOutput) {
  const bin = await whichPi(settings.piPath || undefined);
  if (!bin) {
    const err = new Error("pi non installato");
    err.code = "PI_NOT_INSTALLED";
    throw err;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: settings.cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const collect = (target, chunk) => {
      const text = chunk.toString("utf8");
      if (target === "stdout") stdout = (stdout + text).slice(-200000);
      else stderr = (stderr + text).slice(-200000);
      for (const line of text.split(/\r?\n/).filter(Boolean)) onOutput?.(stripAnsi(line));
    };
    child.stdout.on("data", (chunk) => collect("stdout", chunk));
    child.stderr.on("data", (chunk) => collect("stderr", chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout: stripAnsi(stdout), stderr: stripAnsi(stderr) });
      else reject(new Error(stripAnsi(stderr || stdout).trim() || `pi è terminato con codice ${code}`));
    });
  });
}

async function listInstalled(settings) {
  const trust = require("./pi-settings-store").get(settings.cwd).trust;
  const result = await runPi(["list", trust.projectTrusted ? "--approve" : "--no-approve"], settings);
  return parseListOutput(result.stdout);
}

async function verifyPiPackage(packageName) {
  const name = validatePackageName(packageName);
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
    headers: { accept: "application/json", "user-agent": "pi-desktop/0.1" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Pacchetto npm non disponibile (${response.status})`);
  const metadata = await response.json();
  const keywords = Array.isArray(metadata.keywords) ? metadata.keywords : [];
  if (!keywords.includes("pi-package") && !metadata.pi) {
    throw new Error("Il pacchetto non dichiara di essere compatibile con pi");
  }
  return name;
}

async function install(packageName, settings, onOutput, scope = "user") {
  const source = `npm:${await verifyPiPackage(packageName)}`;
  const local = validateScope(scope) === "project";
  await runPi(["install", source, ...(local ? ["-l", "--approve"] : [])], settings, onOutput);
  return listInstalled(settings);
}

async function remove(packageName, settings, onOutput, scope = "user") {
  const source = `npm:${validatePackageName(packageName)}`;
  const local = validateScope(scope) === "project";
  await runPi(["remove", source, ...(local ? ["-l", "--approve"] : [])], settings, onOutput);
  return listInstalled(settings);
}

async function installSource(value, scope, settings, onOutput) {
  const source = validateSource(value, settings);
  const local = validateScope(scope) === "project";
  await runPi(["install", source, ...(local ? ["-l", "--approve"] : [])], settings, onOutput);
  return listInstalled(settings);
}

async function removeSource(value, scope, settings, onOutput) {
  const source = validateSource(value, settings);
  const local = validateScope(scope) === "project";
  await runPi(["remove", source, ...(local ? ["-l", "--approve"] : [])], settings, onOutput);
  return listInstalled(settings);
}

async function update(target, settings, onOutput) {
  const kind = String(target || "extensions");
  const args = kind === "all" ? ["update", "--all"]
    : kind === "extensions" ? ["update", "--extensions"]
      : kind === "models" ? ["update", "--models"]
        : ["update", "--extension", validateSource(kind, settings)];
  await runPi(args, settings, onOutput);
  return listInstalled(settings);
}

module.exports = {
  validatePackageName,
  validateSource,
  validateScope,
  parseListOutput,
  parseCatalogHtml,
  searchPackages,
  listInstalled,
  install,
  remove,
  installSource,
  removeSource,
  update,
};
