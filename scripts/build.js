/**
 * Flattens the source into a single self-contained file at dist/index.html.
 *
 * Why this exists: index.html loads src/*.js as ES modules, which is pleasant to
 * work on but needs a server. The published artifact has to be one file that also
 * opens straight off disk, so we inline the stylesheet and concatenate the modules
 * in dependency order, dropping the import/export keywords on the way through.
 *
 * That is a real bundler's whole job for a graph this small (five files, no cycles,
 * no name collisions — the check below fails the build if that stops being true).
 * Pulling in a bundler to do it would add more configuration than code.
 *
 * The output deliberately omits <!doctype>, <html>, <head> and <body>: the artifact
 * host wraps the file in its own skeleton, and browsers imply all four anyway, so the
 * same file works when opened directly.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Line endings are normalised on read so the bundle is byte-identical whether it
// was built on a Windows checkout or on Linux CI. Without this the freshness check
// in .github/workflows/ci.yml fails for a reason that has nothing to do with code.
const read = (...parts) => readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');

// Dependency order, checked by hand. memory.js depends on nothing; app.js on everything.
const MODULES = ['memory.js', 'roster.js', 'charts.js', 'demonstrations.js', 'ui.js', 'app.js'];

const IMPORT = /import[\s\S]*?from\s*['"][^'"]*['"];?/g;
const EXPORT = /^export\s+(?=const|function|class|let|var)/gm;

function bundle() {
  const parts = MODULES.map((name) => {
    const source = read('src', name).replace(IMPORT, '').replace(EXPORT, '');
    return `/* ---- src/${name} ---- */\n${source.trim()}\n`;
  });
  return parts.join('\n');
}

function declaredNames(source) {
  const names = new Set();
  const pattern = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let match;
  while ((match = pattern.exec(source))) names.add(match[1]);
  return names;
}

function assertNoCollisions() {
  const seen = new Map();
  const clashes = [];
  for (const name of MODULES) {
    for (const symbol of declaredNames(read('src', name))) {
      if (seen.has(symbol)) clashes.push(`${symbol} (${seen.get(symbol)} and ${name})`);
      else seen.set(symbol, name);
    }
  }
  if (clashes.length) {
    console.error('Top-level name collisions would break the flat bundle:');
    for (const clash of clashes) console.error(`  - ${clash}`);
    process.exit(1);
  }
  return seen.size;
}

const symbolCount = assertNoCollisions();

const html = read('index.html');
const css = read('src', 'styles.css');
const js = bundle();

const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1];
if (!body) throw new Error('could not find <body> in index.html');

const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'Fast Weights, Fixed Memory';
const fontLinks = [...html.matchAll(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g)]
  .map((m) => m[0])
  .join('\n');

const page = body.replace(/<script type="module"[^>]*><\/script>\s*/, '').trim();

const out = `<title>${title}</title>
${fontLinks}
<style>
${css.trim()}
</style>

${page}

<script>
/* Flattened from src/ by scripts/build.js. Edit the modules, not this file. */
(function () {
"use strict";
${js}
})();
</script>
`;

if (/\bimport\s|\bexport\s/.test(js)) {
  console.error('Bundle still contains import/export statements; the regexes need a look.');
  process.exit(1);
}

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist', 'index.html'), out);

const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
console.log(`dist/index.html  ${kb} KB`);
console.log(`  ${MODULES.length} modules, ${symbolCount} top-level names, no collisions`);
console.log(`  css ${(css.length / 1024).toFixed(1)} KB, js ${(js.length / 1024).toFixed(1)} KB`);
