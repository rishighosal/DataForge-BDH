/**
 * Typesets docs/one-pager.md into docs/one-pager.print.html and, if it can find a
 * Chromium, into docs/one-pager.pdf.
 *
 *   npm run pdf
 *
 * The Markdown subset handled here is exactly what the one-pager uses: headings,
 * tables, bold, italic, inline code, links and paragraphs. It is not a general
 * Markdown parser and it is not trying to be. The point is that the PDF is
 * regenerable from the source of truth rather than hand-maintained next to it,
 * so the two cannot drift.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'docs', 'one-pager.md');
const HTML_OUT = join(ROOT, 'docs', 'one-pager.print.html');
const PDF_OUT = join(ROOT, 'docs', 'one-pager.pdf');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

const isTableRow = (line) => line.trim().startsWith('|');
const isDivider = (line) => /^\|[\s:|-]+\|$/.test(line.trim());
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let paragraph = [];

  const flush = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    if (isTableRow(line) && isTableRow(lines[i + 1] ?? '') && isDivider(lines[i + 1])) {
      flush();
      const header = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && isTableRow(lines[i])) body.push(cells(lines[i++]));
      i--;
      out.push(
        `<table><thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` +
          `<tbody>${body
            .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('')}</tbody></table>`,
      );
      continue;
    }

    paragraph.push(line.trim());
  }
  flush();
  return out.join('\n');
}

const PRINT_CSS = `
@page { size: A4; margin: 10mm 13mm; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 7.75pt; line-height: 1.26;
       color: #17181a; margin: 0; }
h1 { font-size: 12.4pt; line-height: 1.15; margin: 0 0 1.6mm; }
h2 { font-size: 8.8pt; margin: 1.9mm 0 0.7mm; padding-bottom: 0.6mm; border-bottom: 0.6pt solid #9aa0a8; }
p { margin: 0 0 1.15mm; text-align: justify; }
a { color: #14508c; text-decoration: none; }
code { font-family: Consolas, 'Courier New', monospace; font-size: 8pt; background: #f1f2f4;
       padding: 0 1px; border-radius: 2px; }
table { border-collapse: collapse; width: 100%; margin: 1.1mm 0 1.5mm; font-size: 7.3pt; }
th, td { border: 0.5pt solid #c3c7cd; padding: 0.8mm 1.4mm; text-align: left; }
th { background: #eef0f2; font-weight: 700; }
td { font-variant-numeric: tabular-nums; }
.eyebrow { font-size: 7pt; letter-spacing: 0.07em; text-transform: uppercase; color: #6a7078;
           margin-bottom: 1.2mm; }
.footer { margin-top: 2mm; padding-top: 1.2mm; border-top: 0.5pt solid #c3c7cd;
          font-size: 7.2pt; color: #6a7078; }
`;

const markdown = readFileSync(SOURCE, 'utf8');

/**
 * Word count against the 500-950 guidance.
 *
 * Splitting the raw Markdown on whitespace counts every table pipe as a word, which
 * overstated the count by about 150 once the comparison table went in and nearly had
 * us cut real content to satisfy a measurement error. Drop the divider rows, treat
 * pipes as separators rather than tokens, and ignore heading hashes, so the number
 * reported is the prose a judge actually reads.
 */
const countWords = (src) =>
  src
    .split(/\r?\n/)
    .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
    .join('\n')
    .replace(/\|/g, ' ')
    .replace(/^#{1,3}\s+/gm, '')
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length;

const words = countWords(markdown);

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>A Fixed State Has a Fixed Fidelity Budget</title>
<style>${PRINT_CSS}</style></head>
<body>
<div class="eyebrow">DataForge 2026 · Pathway track · Explain the Frontier · one-page concept summary</div>
${render(markdown)}
<div class="footer">Fast Weights, Fixed Memory. Interactive artifact, source, test suite and full
experiment tables in the project repository. Every figure quoted here is reproducible with
<code>npm run experiments</code>.</div>
</body></html>
`;

writeFileSync(HTML_OUT, html);
console.log(`docs/one-pager.print.html   (${words} words in source)`);
if (words < 500 || words > 950) {
  console.warn(`  warning: ${words} words is outside the recommended 500-950 range`);
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = CANDIDATES.find((path) => existsSync(path));
if (!browser) {
  console.log('  no Chromium found; set CHROME_PATH to regenerate the PDF');
  console.log('  (or open docs/one-pager.print.html and print to PDF)');
  process.exit(0);
}

execFileSync(browser, [
  '--headless',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${resolve(PDF_OUT)}`,
  `file:///${resolve(HTML_OUT).replace(/\\/g, '/')}`,
], { stdio: 'ignore' });

console.log(`docs/one-pager.pdf          (via ${browser.split(/[\\/]/).pop()})`);
