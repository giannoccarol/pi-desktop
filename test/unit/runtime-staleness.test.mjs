"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { piBinaryIdentityChanged, binIdentity } = require("../../src/main/core/runtime.js");
const { moduleNeedsReload } = require("../../src/main/services/auth-service.js");

test("runtime: piBinaryIdentityChanged confronta path e mtime del binario reale", () => {
  const base = { bin: "/opt/pi/bin/pi", mtimeMs: 100 };
  assert.equal(piBinaryIdentityChanged(base, { bin: "/opt/pi/bin/pi", mtimeMs: 100 }), false);
  assert.equal(piBinaryIdentityChanged(base, { bin: "/opt/pi/bin/pi", mtimeMs: 200 }), true, "update stesso path");
  assert.equal(piBinaryIdentityChanged(base, { bin: "/altro/bin/pi", mtimeMs: 100 }), true, "path diverso (piPath custom)");
});

test("runtime: piBinaryIdentityChanged resta conservativo senza mtime", () => {
  assert.equal(piBinaryIdentityChanged({ bin: "/pi", mtimeMs: null }, { bin: "/pi", mtimeMs: 100 }), false, "mtime mancante al primo avvio");
  assert.equal(piBinaryIdentityChanged({ bin: "/pi", mtimeMs: 100 }, { bin: "/pi", mtimeMs: null }), false, "stat fallita ora");
  assert.equal(piBinaryIdentityChanged(null, { bin: "/pi", mtimeMs: 1 }), false, "nessun spawn tracciato");
});

test("runtime: binIdentity risolve i symlink e gestisce file mancanti senza crash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-bin-id-"));
  const real = path.join(dir, "real-pi");
  const link = path.join(dir, "pi");
  fs.writeFileSync(real, "#!/bin/sh\n");
  fs.symlinkSync(real, link);
  const id = binIdentity(link);
  assert.equal(id.mtimeMs != null, true, "mtime catturato dal file reale");
  const missing = binIdentity(path.join(dir, "inesistente"));
  assert.equal(missing.mtimeMs, null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("auth-service: moduleNeedsReload invalida quando cambia root o mtime di dist/index.js", () => {
  const cached = { module: {}, root: "/pi-root", mtimeMs: 100 };
  assert.equal(moduleNeedsReload(cached, { root: "/pi-root", mtimeMs: 100 }), false, "invariato: riusa il modulo");
  assert.equal(moduleNeedsReload(cached, { root: "/pi-root", mtimeMs: 200 }), true, "pi aggiornato");
  assert.equal(moduleNeedsReload(cached, { root: "/altro-root", mtimeMs: 100 }), true, "installazione diversa");
  assert.equal(moduleNeedsReload({ module: null, root: null, mtimeMs: null }, { root: "/pi-root", mtimeMs: 1 }), true, "primo caricamento");
  assert.equal(moduleNeedsReload({ module: {}, root: "/pi", mtimeMs: null }, { root: "/pi", mtimeMs: 5 }), false, "mtime non noto: conservativo");
});
