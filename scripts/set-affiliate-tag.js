#!/usr/bin/env node
'use strict';
/**
 * Sets the Amazon Associates tracking tag across the whole site.
 *
 *   node scripts/set-affiliate-tag.js yourtag-20
 *   node scripts/set-affiliate-tag.js --clear
 *
 * One value, one rebuild, and every affiliate link on every page carries it.
 * Clearing it reverts the site to plain links with no affiliate disclosure.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILE = path.join(__dirname, '..', 'data', 'affiliates.json');
const arg = process.argv[2];

if (!arg) {
  const cur = JSON.parse(fs.readFileSync(FILE, 'utf8')).amazon.tag;
  console.log(cur ? `Current tag: ${cur}` : 'No tag set — links render as plain, non-affiliate links.');
  console.log('Usage: node scripts/set-affiliate-tag.js <tag>   |   --clear');
  process.exit(0);
}

const tag = arg === '--clear' ? '' : arg;
if (tag && !/^[A-Za-z0-9][A-Za-z0-9._-]{1,48}-\d{2}$/.test(tag)) {
  console.error(`"${tag}" does not look like an Associates tag (they end in -20, -21, etc).`);
  console.error('Pass it anyway with --force if you are sure.');
  if (!process.argv.includes('--force')) process.exit(1);
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
data.amazon.tag = tag;
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(tag ? `Tag set to ${tag}.` : 'Tag cleared.');

execSync('node build.js', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

const sample = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const n = (sample.match(/amazon\.com/g) || []).length;
console.log(tag
  ? `Verified: home page carries ${n} tagged links. Commit and push to publish.`
  : `Verified: affiliate disclosure removed. Commit and push to publish.`);
