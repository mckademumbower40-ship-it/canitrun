'use strict';
const site = require('../data/site.json');
const affiliates = require('../data/affiliates.json');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const gib = (n) => `${n.toFixed(1)} GiB`;
const ctxLabel = (n) => (n >= 1024 ? `${n / 1024}K` : String(n));

/** Amazon link. Without a tracking tag configured this is a plain search link. */
function amazonLink(search) {
  const base = `https://${affiliates.amazon.domain}/s?k=${encodeURIComponent(search)}`;
  return affiliates.amazon.tag ? `${base}&tag=${affiliates.amazon.tag}` : base;
}
const hasAffiliates = () => Boolean(affiliates.amazon.tag);

const CSS = `
:root{--bg:#fbfaf8;--panel:#fff;--ink:#1a1a1c;--muted:#6b6b72;--line:#e6e4df;--accent:#2f5fe0;
--good:#0f7a4d;--good-bg:#e7f5ee;--warn:#8a5a00;--warn-bg:#fdf3e0;--bad:#a32828;--bad-bg:#fbeceb;--radius:10px}
@media (prefers-color-scheme:dark){:root{--bg:#131316;--panel:#1b1b20;--ink:#eceaf0;--muted:#9b99a4;--line:#2e2e36;--accent:#7fa2ff;
--good:#5fd39b;--good-bg:#122e22;--warn:#e8b45c;--warn-bg:#2e2513;--bad:#f28b85;--bad-bg:#2f1917}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:900px;margin:0 auto;padding:0 20px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header.top{border-bottom:1px solid var(--line);padding-block:14px;margin-bottom:28px;background:var(--panel)}
header.top .wrap{display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}
.brand{font-weight:700;font-size:17px;color:var(--ink);letter-spacing:-.01em}
.brand:hover{text-decoration:none}
nav.top-nav{display:flex;gap:16px;font-size:14px;margin-left:auto;flex-wrap:wrap}
nav.top-nav a{color:var(--muted)}
h1{font-size:30px;line-height:1.25;letter-spacing:-.02em;margin:0 0 8px}
h2{font-size:20px;letter-spacing:-.01em;margin:38px 0 12px;padding-top:4px}
h3{font-size:16px;margin:24px 0 8px}
p{margin:0 0 14px}
.sub{color:var(--muted);margin-bottom:26px}
.crumbs{font-size:13px;color:var(--muted);margin-bottom:14px}
.verdict{border-radius:var(--radius);padding:20px 22px;margin:22px 0;border:1px solid transparent}
.verdict .big{font-size:26px;font-weight:700;letter-spacing:-.02em;display:block;margin-bottom:4px}
.verdict.good{background:var(--good-bg);border-color:color-mix(in srgb,var(--good) 30%,transparent);color:var(--good)}
.verdict.warn{background:var(--warn-bg);border-color:color-mix(in srgb,var(--warn) 30%,transparent);color:var(--warn)}
.verdict.bad{background:var(--bad-bg);border-color:color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad)}
.verdict .why{color:var(--ink);opacity:.85;font-size:15px;margin:0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px}
.stat .k{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:3px}
.stat .v{font-size:19px;font-weight:650;font-variant-numeric:tabular-nums}
.stat .n{font-size:12px;color:var(--muted);margin-top:2px}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th,td{text-align:left;padding:9px 13px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
tr:last-child td{border-bottom:none}
td.num{font-variant-numeric:tabular-nums;text-align:right}
.pill{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;white-space:nowrap}
.pill.good{background:var(--good-bg);color:var(--good)}
.pill.warn{background:var(--warn-bg);color:var(--warn)}
.pill.bad{background:var(--bad-bg);color:var(--bad)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin:16px 0}
.card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;color:var(--ink)}
.card:hover{border-color:var(--accent);text-decoration:none}
.card .t{font-weight:650;margin-bottom:3px}
.card .d{font-size:13px;color:var(--muted)}
.note{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:var(--radius);padding:14px 16px;margin:18px 0;font-size:14.5px}
.note strong{display:block;margin-bottom:4px}
pre{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;overflow-x:auto;font-size:13.5px;line-height:1.5}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}
p code,li code,td code{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
.aff{border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;margin:22px 0;background:var(--panel)}
.aff h3{margin-top:0}
.aff ul{margin:10px 0 0;padding-left:20px}
.disclosure{font-size:12.5px;color:var(--muted);margin-top:12px;font-style:italic}
footer{border-top:1px solid var(--line);margin-top:56px;padding-block:24px 40px;font-size:13.5px;color:var(--muted)}
footer a{color:var(--muted);text-decoration:underline}
.faq dt{font-weight:650;margin-top:16px}
.faq dd{margin:6px 0 0;color:var(--muted)}
ul.plain{list-style:none;padding:0}
ul.plain li{padding:7px 0;border-bottom:1px solid var(--line)}
ul.plain li:last-child{border-bottom:none}
@media(max-width:560px){h1{font-size:24px}.wrap{padding:0 16px}}
`;

/** Full HTML document. `depth` sets how many ../ to prefix root-relative assets. */
function page({ title, description, canonical, body, jsonld = [], depth = 0 }) {
  const root = depth === 0 ? './' : '../'.repeat(depth);
  const ld = jsonld.length
    ? jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n')
    : '';
  return `<!doctype html>
<html lang="${site.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical && site.baseUrl ? `<link rel="canonical" href="${site.baseUrl}${canonical}">` : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
${site.googleVerification ? `<meta name="google-site-verification" content="${esc(site.googleVerification)}">` : ''}
${site.bingVerification ? `<meta name="msvalidate.01" content="${esc(site.bingVerification)}">` : ''}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🖥️</text></svg>">
<style>${CSS}</style>
${ld}
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${root}">${esc(site.name)}</a>
  <nav class="top-nav">
    <a href="${root}models/">Models</a>
    <a href="${root}macs/">Macs</a>
    <a href="${root}guides/">Guides</a>
    <a href="${root}method/">Method</a>
  </nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
  <p>${esc(site.name)} — ${esc(site.tagline)} Estimates are computed from published model architectures and Apple's memory bandwidth specs; they are not benchmarks. <a href="${root}method/">How the numbers are calculated</a>.</p>
  <p>Not affiliated with Apple, Meta, Google, Alibaba, Mistral AI, DeepSeek, Microsoft or OpenAI. Apple, Mac, MacBook and Apple Silicon are trademarks of Apple Inc.</p>
</div></footer>
</body>
</html>`;
}

/** Affiliate block. Renders plain links, and no disclosure, until a tag is set. */
function affiliateBlock(key) {
  const rec = affiliates.recommendations[key];
  if (!rec) return '';
  const items = rec.products
    .map((p) => `<li><a href="${amazonLink(p.search)}" rel="${hasAffiliates() ? 'sponsored nofollow noopener' : 'nofollow noopener'}" target="_blank">${esc(p.label)}</a></li>`)
    .join('');
  return `<aside class="aff">
  <h3>${esc(rec.heading)}</h3>
  <p>${esc(rec.body)}</p>
  <ul>${items}</ul>
  ${hasAffiliates() ? `<p class="disclosure">${esc(affiliates.disclosure)}</p>` : ''}
</aside>`;
}

function verdictBox(f, headline, why) {
  return `<div class="verdict ${f.verdict.tone}">
  <span class="big">${esc(headline)}</span>
  <p class="why">${why}</p>
</div>`;
}

function statGrid(stats) {
  return `<div class="stats">${stats
    .map((s) => `<div class="stat"><div class="k">${esc(s.k)}</div><div class="v">${esc(s.v)}</div>${s.n ? `<div class="n">${esc(s.n)}</div>` : ''}</div>`)
    .join('')}</div>`;
}

function table(headers, rows) {
  return `<div class="tablewrap"><table>
<thead><tr>${headers.map((h) => `<th${h.num ? ' class="num"' : ''}>${esc(h.label ?? h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r) => `<tr>${r.join('')}</tr>`).join('')}</tbody>
</table></div>`;
}

const pill = (f) => `<span class="pill ${f.verdict.tone}">${esc(f.verdict.label)}</span>`;

module.exports = { esc, gib, ctxLabel, page, affiliateBlock, verdictBox, statGrid, table, pill, amazonLink, hasAffiliates, CSS };
