"use strict";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);

// Load markdown.js in a VM to get window.renderMarkdown without browser
function loadMarkdown() {
  const code = fs.readFileSync(new URL("../src/renderer/markdown.js", import.meta.url), "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window.renderMarkdown;
}

const md = loadMarkdown();

test("markdown: basic inline", () => {
  assert.match(md("**bold**"), /<strong>bold<\/strong>/);
  assert.match(md("*italic*"), /<em>italic<\/em>/);
  assert.match(md("`code`"), /<code class=\"inline\">code<\/code>/);
  assert.match(md("~~strike~~"), /<del>strike<\/del>/);
});

test("markdown: links are sanitized", () => {
  assert.match(md("[x](https://example.com)"), /href=\"https:\/\/example\.com\"/);
  assert.match(md("[x](javascript:alert(1))"), /href=\"#\"/);
  assert.equal(md("![alt](http://evil.com/img.png)").includes("<img"), false);
  assert.match(md("![alt](http://evil.com/img.png)"), /\[alt\]/);
});

test("markdown: XSS escaped", () => {
  const out = md('<script>alert(1)</script>');
  assert.equal(out.includes("<script>"), false);
  assert.match(out, /&lt;script&gt;/);
  const out2 = md('a & b');
  assert.match(out2, /&amp;/);
});

test("markdown: headings / hr / blockquote", () => {
  assert.match(md("# H1"), /<h1>H1<\/h1>/);
  assert.match(md("### H3"), /<h3>H3<\/h3>/);
  assert.match(md("---"), /<hr\/>/);
  assert.match(md("> quote"), /<blockquote>/);
});

test("markdown: fenced code block", () => {
  const out = md("```js\nconsole.log(1)\n```");
  assert.match(out, /<pre><code>console\.log\(1\)<\/code><\/pre>/);
  assert.match(out, /<span>js<\/span>/);
  // code injection inside block must be escaped
  const out2 = md("```\n<script>\n```");
  assert.match(out2, /&lt;script&gt;/);
});

test("markdown: lists and nested", () => {
  const out = md("- a\n- b\n");
  assert.match(out, /<ul>/);
  assert.match(out, /<li>a<\/li>/);
  const outO = md("1. a\n2. b\n");
  assert.match(outO, /<ol>/);
  // nested with 2-space indent should have class nested and no duplicate bullet
  const outN = md("- a\n  - b\n");
  assert.match(outN, /class=\"nested\"/);
  assert.equal(outN.includes("• •"), false);
});

test("markdown: tables", () => {
  const src = "| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |";
  const out = md(src);
  assert.match(out, /<table>/);
  assert.match(out, /<th>H1<\/th>/);
  assert.match(out, /<td>a<\/td>/);
});

test("markdown: list continuation + blockquote recursion", () => {
  const out = md("> line1\n> line2\n\npara");
  assert.match(out, /<blockquote>/);
  assert.match(out, /<p>para<\/p>/);
});
