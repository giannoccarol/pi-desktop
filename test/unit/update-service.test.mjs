"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { supportsAutoInstall } = require("../../src/main/updates/update-service.js");

test("update-service: auto install only on win/mac and Linux AppImage", () => {
  assert.equal(supportsAutoInstall("win32", "nsis"), true);
  assert.equal(supportsAutoInstall("darwin", "dmg"), true);
  assert.equal(supportsAutoInstall("linux", "appimage"), true);
  assert.equal(supportsAutoInstall("linux", "pacman"), false);
  assert.equal(supportsAutoInstall("linux", "deb"), false);
  assert.equal(supportsAutoInstall("linux", ""), false);
});
