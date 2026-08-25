"use strict";

const path = require("path");
const { pathToFileURL } = require("url");
const authService = require("./auth-service");
const piSettings = require("./pi-settings-store");

const RESOURCE_TYPES = ["extensions", "skills", "prompts", "themes"];

async function loadClasses(settings) {
  const root = await authService.findPackageRoot(settings);
  const [settingsModule, packageModule] = await Promise.all([
    import(pathToFileURL(path.join(root, "dist", "core", "settings-manager.js")).href),
    import(pathToFileURL(path.join(root, "dist", "core", "package-manager.js")).href),
  ]);
  return { SettingsManager: settingsModule.SettingsManager, DefaultPackageManager: packageModule.DefaultPackageManager };
}

async function listResources(settings) {
  const { SettingsManager, DefaultPackageManager } = await loadClasses(settings);
  const manager = SettingsManager.create(settings.cwd, piSettings.agentDir(), { projectTrusted: true });
  const resolved = await new DefaultPackageManager({
    cwd: settings.cwd,
    agentDir: piSettings.agentDir(),
    settingsManager: manager,
  }).resolve(async () => "skip");
  return RESOURCE_TYPES.flatMap((type) => resolved[type].map((resource) => ({
    type,
    path: resource.path,
    name: type === "skills" && path.basename(resource.path) === "SKILL.md"
      ? path.basename(path.dirname(resource.path))
      : path.basename(resource.path),
    enabled: Boolean(resource.enabled),
    metadata: resource.metadata,
  })));
}

function stripMarker(value) {
  return /^[!+-]/.test(value) ? value.slice(1) : value;
}

function setResourceEnabled(settings, resource, enabled) {
  if (!RESOURCE_TYPES.includes(resource?.type)) throw new Error("Tipo di risorsa non valido");
  const metadata = resource.metadata || {};
  if (!["user", "project"].includes(metadata.scope)) throw new Error("Scope risorsa non valido");
  const current = piSettings.get(settings.cwd);
  if (metadata.scope === "project" && !current.trust.projectTrusted) {
    throw new Error("Il progetto deve essere attendibile per modificare le risorse locali");
  }
  const file = metadata.scope === "project" ? current.files.project : current.files.global;
  const data = piSettings.readObject(file);
  const baseDir = metadata.baseDir || (metadata.scope === "project" ? path.join(settings.cwd, ".pi") : piSettings.agentDir());
  const pattern = path.relative(baseDir, resource.path);
  if (!pattern || pattern.startsWith(".." + path.sep)) throw new Error("Percorso risorsa non valido");

  if (metadata.origin === "package") {
    const packages = [...(data.packages || [])];
    const index = packages.findIndex((entry) => (typeof entry === "string" ? entry : entry?.source) === metadata.source);
    if (index < 0) throw new Error("Pacchetto non presente nelle impostazioni");
    const entry = typeof packages[index] === "string" ? { source: packages[index] } : { ...packages[index] };
    const values = [...(entry[resource.type] || [])].filter((value) => stripMarker(String(value)) !== pattern);
    values.push(`${enabled ? "+" : "-"}${pattern}`);
    entry[resource.type] = values;
    packages[index] = entry;
    data.packages = packages;
  } else {
    const values = [...(data[resource.type] || [])].filter((value) => stripMarker(String(value)) !== pattern);
    values.push(`${enabled ? "+" : "-"}${pattern}`);
    data[resource.type] = values;
  }
  piSettings.writeObject(file, data);
  return { ok: true };
}

module.exports = { listResources, setResourceEnabled };
