import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// We test the pure function currentAtQuery by re-implementing its logic
// via the module export. The renderer module expects window globals; we
// provide minimal stubs and require it directly.

function makeEnv({ value, pos }) {
  const fakeEl = {
    input: {
      value,
      selectionStart: pos,
      selectionEnd: pos,
      focus() {},
      setSelectionRange() {},
      style: {},
    },
    atSuggestions: { classList: { add(){}, remove(){}, contains(){ return true; } }, innerHTML: "", querySelectorAll(){ return []; } },
    slashSuggestions: { classList: { add(){}, remove(){}, contains(){ return true; } } },
  };
  const fakeState = { mentionResults: [], atSelection: 0, mentionQuery: null };
  globalThis.window = {
    piStore: { el: fakeEl, state: fakeState },
    piDesktop: { searchFiles: async () => [] },
    piUtils: { escapeHtml: (s)=>String(s) },
    piUi: { icon: ()=>"", refreshIcons: ()=>{} },
    i18n: { t: (k)=>k },
  };
  // Force re-load fresh copy
  delete require.cache[require.resolve("../src/renderer/features/chat/mentions.js")];
  const m = require("../src/renderer/features/chat/mentions.js");
  return { m, fakeEl, fakeState };
}

test("mentions: currentAtQuery triggers on @query", () => {
  const { m, fakeEl } = makeEnv({ value: "ciao @src/rend", pos: 14 });
  // need to update window.piStore.el reference inside module: it captured at load time from window.piStore.el
  // Our makeEnv already set window before require, so module saw correct el
  const ctx = m.currentAtQuery();
  assert.ok(ctx);
  assert.equal(ctx.query, "src/rend");
  assert.equal(ctx.atIdx, 5);
});

test("mentions: currentAtQuery @ alone returns empty query", () => {
  const { m } = makeEnv({ value: "@", pos: 1 });
  const ctx = m.currentAtQuery();
  assert.ok(ctx);
  assert.equal(ctx.query, "");
  assert.equal(ctx.atIdx, 0);
});

test("mentions: email@test.com does not trigger", () => {
  const { m } = makeEnv({ value: "email@test.com", pos: 14 });
  const ctx = m.currentAtQuery();
  assert.equal(ctx, null);
});

test("mentions: space inside query not trigger", () => {
  const { m } = makeEnv({ value: "ciao @src folder", pos: 15 });
  // cursor after space inside query should be null because query contains space
  // before = "ciao @src folder" up to pos 15 -> "ciao @src fold" query "src fold" contains space -> null
  // Instead test with space before @ query
  const ctx = m.currentAtQuery();
  // query would be "src fold" which contains space -> null
  assert.equal(ctx, null);
});

test("mentions: after @ with space prefix not trigger", () => {
  const { m } = makeEnv({ value: "ciao @ src", pos: 10 });
  const ctx = m.currentAtQuery();
  // before = "ciao @ src" -> last @ at 5, query = " src" contains space -> null
  assert.equal(ctx, null);
});

test("mentions: hello @src triggers", () => {
  const { m } = makeEnv({ value: "hello @src", pos: 10 });
  const ctx = m.currentAtQuery();
  assert.ok(ctx);
  assert.equal(ctx.query, "src");
});

test("mentions: selection not collapsed returns null", () => {
  const { m, fakeEl } = makeEnv({ value: "ciao @src", pos: 9 });
  fakeEl.input.selectionEnd = 8;
  const ctx = m.currentAtQuery();
  assert.equal(ctx, null);
});

test("mentions: applying a suggestion delegates autosize without recursing through the legacy global", () => {
  const { m, fakeEl } = makeEnv({ value: "ciao @sr", pos: 8 });
  let autosizeCalls = 0;
  window.piComposer = { autosize: () => { autosizeCalls += 1; } };
  window.autosize = () => assert.fail("the colliding legacy autosize global must not be called");

  m.applyAtSuggestion({ path: "src/renderer", dir: true });

  assert.equal(fakeEl.input.value, "ciao @src/renderer ");
  assert.equal(autosizeCalls, 1);
});
