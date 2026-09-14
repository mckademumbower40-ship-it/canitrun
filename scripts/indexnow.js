#!/usr/bin/env node
'use strict';
/**
 * Submits the site to IndexNow, which Bing, Yandex, Seznam and Naver all consume.
 *
 * Unlike Google Search Console this needs no account and no dashboard: you host a
 * key file on your own domain, which proves ownership, and then POST your URLs.
 * That makes it the one indexing route that can be fully automated.
 *
 *   node scripts/indexnow.js --init    # generate a key and write the key file
 *   node scripts/indexnow.js           # submit every URL in the sitemap
 *   node scripts/indexnow.js --changed # submit only URLs whose page changed in the last commit
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'data', 'site.json');
const STATIC = path.join(ROOT, 'static');

const site = JSON.parse(fs.readFileSync(SITE, 'utf8'));
const host = site.baseUrl.replace(/^https?:\/\//, '').split('/')[0];

function init() {
  if (site.indexNowKey) {
    console.log(`Key already set: ${site.indexNowKey}`);
  } else {
    site.indexNowKey = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(SITE, JSON.stringify(site, null, 2) + '\n');
    console.log(`Generated key: ${site.indexNowKey}`);
  }
  fs.mkdirSync(STATIC, { recursive: true });
  const keyFile = path.join(STATIC, `${site.indexNowKey}.txt`);
  fs.writeFileSync(keyFile, site.indexNowKey + '\n');
  console.log(`Wrote static/${site.indexNowKey}.txt`);
  console.log(`\nRun 'node build.js' then commit and push. The key must be live at`);
  console.log(`  ${site.baseUrl}/${site.indexNowKey}.txt`);
  console.log(`before submissions will be accepted.`);
}

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(ROOT, 'docs', 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** URLs whose generated page changed in the most recent commit. */
function changedUrls() {
  let files;
  try {
    files = execSync('git diff --name-only HEAD~1 HEAD -- docs', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter((f) => f.endsWith('.html'));
  } catch {
    console.log('No previous commit to diff against; falling back to full submission.');
    return sitemapUrls();
  }
  return files.map((f) => site.baseUrl + '/' + f.replace(/^docs\//, '').replace(/index\.html$/, ''));
}

async function submit(urls) {
  if (!site.indexNowKey) {
    console.error('No key configured. Run: node scripts/indexnow.js --init');
    process.exit(1);
  }
  if (!urls.length) { console.log('Nothing changed; nothing to submit.'); return; }

  // The key lives under /canitrun/, not at the host root, so we must declare
  // where it is. IndexNow then only accepts URLs beneath that directory.
  const keyLocation = `${site.baseUrl}/${site.indexNowKey}.txt`;

  // The endpoint caps a single submission at 10,000 URLs.
  const batches = [];
  for (let i = 0; i < urls.length; i += 10000) batches.push(urls.slice(i, i + 10000));

  for (const [i, batch] of batches.entries()) {
    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: site.indexNowKey, keyLocation, urlList: batch }),
    });
    const label = batches.length > 1 ? ` (batch ${i + 1}/${batches.length})` : '';
    // 200 accepted, 202 accepted pending key validation.
    if (res.status === 200 || res.status === 202) {
      console.log(`Submitted ${batch.length} URLs${label} — ${res.status} ${res.status === 202 ? 'accepted, key validation pending' : 'accepted'}`);
    } else {
      console.error(`Submission failed${label}: ${res.status} ${await res.text().catch(() => '')}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv.includes('--init')) init();
else submit(process.argv.includes('--changed') ? changedUrls() : sitemapUrls());
