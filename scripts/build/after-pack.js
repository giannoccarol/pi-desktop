"use strict";

const fs = require("node:fs");
const path = require("node:path");

/** Maps electron-builder target names to update-service package-type tokens. */
const TARGET_TYPES = {
  appImage: "appimage",
  deb: "deb",
  pacman: "pacman",
  snap: "snap",
  rpm: "rpm",
  nsis: "win",
  portable: "win",
  dmg: "mac",
  zip: "mac",
  dir: "dir",
};

/**
 * Writes resources/package-type so UpdateService can enable auto-install on AppImage.
 * @param {import("electron-builder").AfterPackContext} context
 */
module.exports = async function afterPack(context) {
  const targetName = context.targets?.[0]?.name || process.env.PI_PACKAGE_TYPE || "dir";
  const type = TARGET_TYPES[targetName] || String(targetName).toLowerCase();
  const resourcesDir = path.join(context.appOutDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.writeFileSync(path.join(resourcesDir, "package-type"), `${type}\n`, "utf8");
};
