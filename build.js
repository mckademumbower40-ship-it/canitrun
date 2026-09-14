#!/usr/bin/env node
'use strict';
/**
 * Builds the entire static site into docs/, which GitHub Pages serves directly.
 * Deterministic: same data in, same bytes out. Safe to run on every commit.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'docs');

const site = require('./data/site.json');
const models = require('./data/models.json').models;
const machines = require('./data/machines.json').machines;
const { pairPage } = require('./lib/pages');
const hubs = require('./lib/hubs');
const guides = require('./lib/guides');

const ctx = { models, machines };
const ramTiers = [...new Set(machines.map((m) => m.ram_gb))].sort((a, b) => a - b);

function write(rel, content) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function build() {
  const t0 = Date.now();
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const pages = [];

  pages.push(guides.homePage(ctx, ramTiers));
  pages.push(hubs.modelsIndex(ctx));
  pages.push(hubs.machinesIndex(ctx));
  pages.push(guides.guidesIndex(ctx, ramTiers));
  pages.push(guides.methodPage(ctx));

  for (const m of models) pages.push(hubs.modelPage(m, ctx));
  for (const h of machines) pages.push(hubs.machinePage(h, ctx));
  for (const r of ramTiers) pages.push(guides.ramGuide(r, ctx));
  for (const m of models) for (const h of machines) pages.push(pairPage(m, h, ctx));

  for (const p of pages) write(p.path, p.html);

  /* sitemap */
  const urls = pages
    .map((p) => '/' + p.path.replace(/index\.html$/, ''))
    .map((u, i) => `  <url><loc>${site.baseUrl}${u}</loc><changefreq>monthly</changefreq><priority>${pages[i].priority.toFixed(1)}</priority></url>`)
    .join('\n');
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  write('robots.txt', `User-agent: *\nAllow: /\n${site.baseUrl ? `Sitemap: ${site.baseUrl}/sitemap.xml\n` : ''}`);
  write('.nojekyll', '');
  if (site.baseUrl && site.baseUrl.includes('://') && !site.baseUrl.includes('github.io')) {
    write('CNAME', site.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') + '\n');
  }

  const bytes = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
  console.log(`built ${pages.length} pages (${(bytes / 1048576).toFixed(1)} MB) in ${Date.now() - t0}ms -> docs/`);
  return pages.length;
}

if (require.main === module) build();
module.exports = { build };
