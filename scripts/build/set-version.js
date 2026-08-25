"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..", "..");
const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/build/set-version.js 0.x.y  (es. 0.5.0, 0.100.100)");
  process.exit(1);
}
if (!/^0\.(\d{1,3})\.(\d{1,3})$/.test(version)) {
  console.error("Versione deve essere 0.x.y (es. 0.5.0)");
  process.exit(1);
}
const [,, minor, patch] = version.match(/^0\.(\d{1,3})\.(\d{1,3})$/);
if (Number(minor) > 100 || Number(patch) > 100) {
  console.error("Minor e patch devono essere <=100 per 0.x (richiesta 0.100.100 max)");
  process.exit(1);
}

// Update package.json
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const old = pkg.version;
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`package.json: ${old} -> ${version}`);

// Update package-lock.json via npm
spawnSync("npm", ["install", "--package-lock-only"], { cwd: root, stdio: "inherit" });

// Verify
const check = spawnSync("node", [ "scripts/build/check-release-version.js", `v${version}`], { cwd: root, stdio: "inherit" });
if (check.status !== 0) process.exit(check.status);

console.log(`\nPronto per commit: git add package.json package-lock.json && git commit -m \"chore(release): ${version}\" && git tag v${version}`);
console.log(`Poi: git push origin main --follow-tags`);
console.log(`Oppure usa workflow_dispatch con version=${version}`);
