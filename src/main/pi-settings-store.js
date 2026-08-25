"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TOOL_NAMES = ["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"];
const TRUST_RESOURCE_NAMES = ["settings.json", "extensions", "skills", "prompts", "themes", "SYSTEM.md", "APPEND_SYSTEM.md"];

function agentDir() {
  return process.env.PI_CODING_AGENT_DIR
    ? path.resolve(process.env.PI_CODING_AGENT_DIR)
    : path.join(os.homedir(), ".pi", "agent");
}

function readObject(file) {
  if (!fs.existsSync(file)) return {};
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`Impossibile leggere ${file}: ${err.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${file} non contiene un oggetto JSON`);
  return value;
}

function writeObject(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temp, file);
  if (process.platform !== "win32") {
    try { fs.chmodSync(file, 0o600); } catch {}
  }
}

function mergeSettings(globalSettings, projectSettings) {
  const merged = { ...globalSettings, ...projectSettings };
  for (const key of ["compaction", "retry", "images", "terminal"]) {
    merged[key] = { ...(globalSettings[key] || {}), ...(projectSettings[key] || {}) };
  }
  return merged;
}

function hasTrustResources(cwd) {
  const resolved = path.resolve(cwd);
  const configDir = path.join(resolved, ".pi");
  if (TRUST_RESOURCE_NAMES.some((name) => fs.existsSync(path.join(configDir, name)))) return true;
  let cursor = resolved;
  const userSkills = path.join(os.homedir(), ".agents", "skills");
  while (true) {
    const skills = path.join(cursor, ".agents", "skills");
    if (path.resolve(skills) !== path.resolve(userSkills) && fs.existsSync(skills)) return true;
    const parent = path.dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

function trustInfo(cwd) {
  const trustFile = path.join(agentDir(), "trust.json");
  const data = readObject(trustFile);
  const exactPath = path.resolve(cwd);
  const exact = typeof data[exactPath] === "boolean" ? data[exactPath] : null;
  let cursor = exactPath;
  let inheritedPath = null;
  let effective = null;
  while (true) {
    if (typeof data[cursor] === "boolean") {
      effective = data[cursor];
      inheritedPath = cursor;
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return { exact, effective, inheritedPath, hasResources: hasTrustResources(exactPath), file: trustFile };
}

function setTrust(cwd, decision) {
  const trustFile = path.join(agentDir(), "trust.json");
  const data = readObject(trustFile);
  const key = path.resolve(cwd);
  if (decision === null) delete data[key];
  else data[key] = Boolean(decision);
  const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
  writeObject(trustFile, sorted);
  return trustInfo(cwd);
}

function get(cwd) {
  const globalFile = path.join(agentDir(), "settings.json");
  const projectFile = path.join(path.resolve(cwd), ".pi", "settings.json");
  const globalSettings = readObject(globalFile);
  const projectSettings = readObject(projectFile);
  const trust = trustInfo(cwd);
  const projectTrusted = !trust.hasResources || trust.effective === true || (trust.effective == null && globalSettings.defaultProjectTrust === "always");
  return {
    global: globalSettings,
    project: projectSettings,
    effective: mergeSettings(globalSettings, projectTrusted ? projectSettings : {}),
    trust: { ...trust, projectTrusted },
    files: { global: globalFile, project: projectFile },
  };
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number) : fallback;
}

function cleanPatch(patch) {
  const output = {};
  if (["ask", "always", "never"].includes(patch.defaultProjectTrust)) output.defaultProjectTrust = patch.defaultProjectTrust;
  if (["auto", "sse", "websocket", "websocket-cached"].includes(patch.transport)) output.transport = patch.transport;
  if (["all", "one-at-a-time"].includes(patch.steeringMode)) output.steeringMode = patch.steeringMode;
  if (["all", "one-at-a-time"].includes(patch.followUpMode)) output.followUpMode = patch.followUpMode;
  if (Array.isArray(patch.defaultTools)) output.defaultTools = [...new Set(patch.defaultTools.filter((name) => TOOL_NAMES.includes(name)))];
  if (Array.isArray(patch.enabledModels)) output.enabledModels = patch.enabledModels.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 100);
  for (const key of ["shellPath", "shellCommandPrefix"]) {
    if (typeof patch[key] === "string") output[key] = patch[key].trim() || undefined;
  }
  output.compaction = {
    enabled: bool(patch.compaction?.enabled, true),
    reserveTokens: boundedNumber(patch.compaction?.reserveTokens, 1024, 1000000, 16384),
    keepRecentTokens: boundedNumber(patch.compaction?.keepRecentTokens, 0, 1000000, 20000),
  };
  output.retry = {
    enabled: bool(patch.retry?.enabled, true),
    maxRetries: boundedNumber(patch.retry?.maxRetries, 0, 20, 3),
    baseDelayMs: boundedNumber(patch.retry?.baseDelayMs, 100, 600000, 2000),
  };
  output.images = {
    autoResize: bool(patch.images?.autoResize, true),
    blockImages: bool(patch.images?.blockImages, false),
  };
  return output;
}

function setGlobal(cwd, patch) {
  const current = get(cwd);
  const next = { ...current.global, ...cleanPatch(patch) };
  for (const key of ["shellPath", "shellCommandPrefix"]) {
    if (next[key] === undefined) delete next[key];
  }
  writeObject(current.files.global, next);
  return get(cwd);
}

module.exports = { TOOL_NAMES, agentDir, readObject, writeObject, get, setGlobal, setTrust };
