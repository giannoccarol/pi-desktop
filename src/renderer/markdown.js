"use strict";
// Minimal, dependency-free Markdown renderer for chat content.
// Strategy: escape HTML entities first (prevents injection), then apply
// CommonMark-ish transforms. Supports: fenced code blocks, headings, hr,
// blockquotes, ordered/unordered lists (one nesting level), tables, inline
// code/bold/italic/strikethrough/links/images.

(function () {
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderInline(text) {
    let s = text;
    // images ![alt](src) -> alt only (no remote loads in CSP)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_m, alt) => `[${alt}]`);
    // links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, url) => {
      const safe = /^(https?:|mailto:)/i.test(url) ? url : "#";
      return `<a href="${safe}" class="md-link">${t}</a>`;
    });
    s = s.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
    s = s.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return s;
  }

  function renderCodeBlock(code, lang) {
    const langLabel = lang ? esc(lang) : "text";
    return (
      `<div class="codeblock"><div class="cb-head"><span>${langLabel}</span>` +
      `<button class="cb-copy">copia</button></div>` +
      `<pre><code>${esc(code)}</code></pre></div>`
    );
  }

  function renderTable(rows) {
    const cells = (line) =>
      line
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
    const header = cells(rows[0]);
    const bodyRows = rows.slice(2).map(cells);
    let html = "<table><thead><tr>";
    for (const h of header) html += `<th>${renderInline(h)}</th>`;
    html += "</tr></thead><tbody>";
    for (const r of bodyRows) {
      html += "<tr>";
      for (const c of r) html += `<td>${renderInline(c)}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table>";
    return html;
  }

  /** Render markdown source to an HTML string. */
  function renderMarkdown(src) {
    if (!src) return "";
    const text = String(src).replace(/\r\n/g, "\n");
    const lines = text.split("\n");
    let out = "";
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // fenced code
      const fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        const lang = fence[1];
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++; // closing fence
        out += renderCodeBlock(buf.join("\n"), lang);
        continue;
      }

      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      // heading
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        out += `<h${h[1].length}>${renderInline(esc(h[2]))}</h${h[1].length}>`;
        i++;
        continue;
      }

      // hr
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
        out += "<hr/>";
        i++;
        continue;
      }

      // table
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          rows.push(lines[i]);
          i++;
        }
        if (rows.length >= 2) {
          out += renderTable(rows);
          continue;
        }
      }

      // blockquote
      if (/^\s*>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        out += `<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`;
        continue;
      }

      // lists (supports one level of nesting via two-space indent)
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const ordered = /^\s*\d/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          const indent = lines[i].match(/^\s*/)[0].length;
          const content = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, "");
          items.push({ indent, content });
          i++;
          // continuation lines
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
            items[items.length - 1].content += " " + lines[i].trim();
            i++;
          }
        }
        const tag = ordered ? "ol" : "ul";
        let html = `<${tag}>`;
        for (const it of items) {
          const marker = it.indent >= 2 ? "&nbsp;&nbsp;• " : "";
          html += `<li>${marker ? marker : ""}${renderInline(esc(it.content))}</li>`;
        }
        html += `</${tag}>`;
        out += html;
        continue;
      }

      // paragraph: gather until blank/special start
      const para = [line];
      i++;
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !/^```/.test(lines[i]) &&
        !/^(#{1,4})\s+/.test(lines[i]) &&
        !/^\s*>/.test(lines[i]) &&
        !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
        !/^\s*\|.*\|\s*$/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      out += `<p>${renderInline(esc(para.join("\n"))).replace(/\n/g, "<br/>")}</p>`;
    }
    return out;
  }

  window.renderMarkdown = renderMarkdown;
})();
