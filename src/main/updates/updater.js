"use strict";

const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const NPM_PACKAGE = "@earendil-works/pi-coding-agent";
const REGISTRY_URL = `https://registry.npmjs.org/${NPM_PACKAGE}/latest`;

const IS_WIN32 = process.platform === "win32";

// npm global shims are .cmd/.bat on Windows and need a shell to be spawned.
function needsShell(bin) {
  return IS_WIN32 && /\.(cmd|bat)$/i.test(bin);
}

// npm global installs drop shims into `<prefix>`; on Windows this is %APPDATA%\npm.
function npmGlobalBinDir() {
  if (IS_WIN32 && process.env.APPDATA) return path.join(process.env.APPDATA, "npm");
  return null;
}

/** GUI apps inherit a minimal PATH; augment it so we can find pi / npm. */
function augmentedPath() {
  const extra = [
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/local/sbin",
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), "bin"),
    path.join(os.homedir(), ".cargo", "bin"),
  ];
  const npmPrefixBin = ["/usr/local", "/usr", os.homedir() + "/.npm-global"]
    .map((p) => path.join(p, "bin"))
    .filter((p) => fs.existsSync(p));
  return [...extra, ...npmPrefixBin, process.env.PATH || ""].join(path.delimiter);
}

function execEnv() {
  return { ...process.env, PATH: augmentedPath() };
}

function run(bin, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { env: execEnv(), timeout: opts.timeout || 20000, encoding: "utf8", shell: opts.shell || needsShell(bin), windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : null, stdout: stdout || "", stderr: stderr || "", err: err ? String(err.message) : null });
      }
    );
  });
}

// Cache of the resolved pi binary: resolving via `which` / login shell can be
// slow, and it never changes within one app run unless the user edits settings.
let cachedPiPath = null;

async function whichPi(customPath) {
  if (customPath && fs.existsSync(customPath)) {
    cachedPiPath = customPath;
    return customPath;
  }
  if (cachedPiPath && fs.existsSync(cachedPiPath)) return cachedPiPath;
  const candidates = [
    "/usr/local/bin/pi",
    path.join(os.homedir(), ".local", "bin", "pi"),
    path.join(os.homedir(), "bin", "pi"),
    path.join(os.homedir(), ".npm-global", "bin", "pi"),
  ];
  const npmBin = npmGlobalBinDir();
  if (npmBin) {
    candidates.push(path.join(npmBin, "pi.cmd"), path.join(npmBin, "pi.exe"), path.join(npmBin, "pi"));
  }
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      return c;
    } catch {}
  }
  if (IS_WIN32) {
    // Windows has no `which` / `/bin/sh`; resolve via `where`.
    const res = await run("where.exe", ["pi"]).catch(() => ({ ok: false }));
    const p = res.ok ? res.stdout.trim().split(/\r?\n/)[0] : "";
    const found = p && fs.existsSync(p) ? p : null;
    if (found) cachedPiPath = found;
    return found;
  }
  const res = await run("which", ["pi"]).catch(() => ({ ok: false }));
  // Some shells need login PATH; fall back to sh -lc.
  let p = res.ok ? res.stdout.trim().split("\n")[0] : "";
  if (!p) {
    const res2 = await new Promise((resolve) => {
      execFile("/bin/sh", ["-lc", "command -v pi"], { encoding: "utf8", timeout: 15000 }, (err, stdout) =>
        resolve(err ? "" : (stdout || "").trim().split("\n")[0] || "")
      );
    });
    p = res2;
  }
  const found = p && fs.existsSync(p) ? p : null;
  if (found) cachedPiPath = found;
  return found;
}

async function piVersion(bin) {
  const res = await run(bin, ["--version"], { timeout: 15000 });
  if (!res.ok) return null;
  const m = (res.stdout || "").trim().match(/(\d+\.\d+\.\d+[^\s]*)/);
  return m ? m[1] : (res.stdout || "").trim() || null;
}

async function latestNpmVersion() {
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.version || null;
  } catch {
    return null;
  }
}

function semverCompare(a, b) {
  const pa = String(a || "").split(/[.-]/).map((x) => parseInt(x, 10));
  const pb = String(b || "").split(/[.-]/).map((x) => parseInt(x, 10));
  for (let i = 0; i < 3; i++) {
    const na = isNaN(pa[i]) ? 0 : pa[i];
    const nb = isNaN(pb[i]) ? 0 : pb[i];
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/**
 * Status of the external pi installation. The desktop app NEVER bundles pi:
 * it always talks to whatever the user has installed system-wide.
 */
async function status(settings) {
  const bin = await whichPi(settings.piPath);
  const version = bin ? await piVersion(bin) : null;
  const latest = await latestNpmVersion();
  return {
    installed: Boolean(bin),
    bin,
    version,
    latest,
    updateAvailable: Boolean(version && latest && semverCompare(version, latest) < 0),
    package: NPM_PACKAGE,
  };
}

/**
 * Run a maintenance command (install or self-update) and stream progress.
 * Uses pi's own updater (`pi update --self`) so the agent stays independent
 * from the app lifecycle; falls back to npm for first installs.
 */
function runMaintenance(kind, settings, onOutput) {
  return new Promise((resolve) => {
    const emit = (line) => onOutput && onOutput(String(line).replace(/\n$/, ""));

    const finish = async (ok) => {
      const st = await status(settings);
      resolve({ ok, status: st });
    };

    let bin = null;
    whichPi(settings.piPath)
      .then((found) => {
        bin = found;
        let cmd, args;
        if (kind === "update") {
          if (!bin) {
            emit("pi non trovato: impossibile aggiornare.");
            finish(false);
            return;
          }
          cmd = bin;
          args = ["update", "--self"];
        } else {
          // install
          const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
          cmd = npmCmd;
          args = ["install", "-g", "--ignore-scripts", NPM_PACKAGE];
        }
        emit(`$ ${cmd} ${args.join(" ")}`);
        const child = spawn(cmd, args, { env: execEnv(), stdio: ["ignore", "pipe", "pipe"], shell: needsShell(cmd), windowsHide: true });
        child.stdout.on("data", (d) => d.toString().split("\n").forEach(emit));
        child.stderr.on("data", (d) => d.toString().split("\n").forEach(emit));
        child.on("error", async (err) => {
          emit(`errore: ${err.message}`);
          finish(false);
        });
        child.on("close", (code) => {
          emit(code === 0 ? "completato." : `terminato con codice ${code}`);
          finish(code === 0);
        });
      })
      .catch(async () => finish(false));
  });
}

module.exports = {
  status,
  runMaintenance,
  whichPi,
  piVersion,
  latestNpmVersion,
  semverCompare,
  augmentedPath,
  NPM_PACKAGE,
};
