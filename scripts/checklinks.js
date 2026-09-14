#!/usr/bin/env node
'use strict';
/** Verifies every internal link in docs/ resolves to a file on disk. */
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'docs');

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name)); })(OUT);
const html = files.filter((f) => f.endsWith('.html'));

let checked = 0, broken = [];
for (const f of html) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|data:|#)/.test(href)) continue;
    checked++;
    let target = path.resolve(path.dirname(f), href);
    if (!path.extname(target)) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) broken.push(`${path.relative(OUT, f)} -> ${href}`);
  }
}
console.log(`${html.length} pages, ${checked} internal links, ${broken.length} broken`);
if (broken.length) { console.log(broken.slice(0, 20).join('\n')); process.exit(1); }
