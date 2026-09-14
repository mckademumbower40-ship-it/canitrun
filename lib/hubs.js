'use strict';
const calc = require('./calc');
const R = require('./render');
const { pairSlug, machineName } = require('./pages');
const { esc, gib, ctxLabel, pill } = R;
const site = require('../data/site.json');

/* ─────────────────────────────── model hub ─────────────────────────────── */

function modelPage(model, ctx) {
  const { machines } = ctx;
  const rows = machines
    .map((h) => ({ h, f: calc.fit(model, h) }))
    .sort((a, b) => a.h.ram_gb - b.h.ram_gb || a.h.bandwidth_gbps - b.h.bandwidth_gbps);
  const runners = rows.filter((x) => x.f.verdict.key !== 'no');
  const cheapest = runners[0];
  const isMoE = model.active_b < model.params_b * 0.9;

  const q4 = calc.fit(model, machines[0], { quant: 'q4_K_M' });
  const sizeRows = require('./pages').QUANT_ORDER.map((q) => {
    const w = calc.weightsGiB(model.params_b, q);
    return [
      `<td><strong>${calc.QUANTS[q].label}</strong></td>`,
      `<td class="num">${gib(w)}</td>`,
      `<td class="num">${(w + calc.kvGiB(model.kv_kb_per_token, 8192) + calc.overheadGiB(w)).toFixed(1)} GiB</td>`,
      `<td>${esc(calc.QUANTS[q].blurb)}</td>`,
    ];
  });

  const title = `${model.name} on Apple Silicon — memory needed and speed by Mac`;
  const description = `${model.name} needs ${gib(calc.weightsGiB(model.params_b))} at Q4_K_M. ${cheapest ? `The smallest Mac that runs it is an ${machineName(cheapest.h)}.` : 'No Mac configuration runs it comfortably.'} Full table of every Apple Silicon config.`;

  const body = `
<div class="crumbs"><a href="../../">Home</a> › <a href="../">Models</a> › ${esc(model.name)}</div>
<h1>${esc(model.name)} on a Mac</h1>
<p class="sub">${esc(model.vendor)} · ${model.params_b}B parameters${isMoE ? ` (${model.active_b}B active — mixture of experts)` : ''} · ${esc(model.license)} · released ${esc(model.released)}</p>

${R.statGrid([
  { k: 'Weights @ Q4_K_M', v: gib(calc.weightsGiB(model.params_b)), n: 'the usual download size' },
  { k: 'KV cache', v: `${model.kv_kb_per_token} KB`, n: 'per token, FP16' },
  { k: 'Max context', v: ctxLabel(model.max_ctx), n: 'tokens' },
  { k: 'Smallest Mac', v: cheapest ? `${cheapest.h.ram_gb} GB` : '—', n: cheapest ? esc(cheapest.h.chip) : 'none run it' },
])}

${cheapest
  ? `<div class="note"><strong>Short answer</strong>A <strong>${esc(machineName(cheapest.h))}</strong> is the smallest Apple Silicon machine that loads ${esc(model.name)} at Q4_K_M with an 8K context, at roughly ${cheapest.f.tokensPerSecond.toFixed(0)} tokens/sec. ${esc(cheapest.h.products[0])} is the cheapest way to get that configuration.</div>`
  : `<div class="note"><strong>Short answer</strong>No Mac in this list runs ${esc(model.name)} at Q4_K_M with an 8K context. It needs server hardware.</div>`}

<h2>Every Mac, ranked</h2>
${R.table(
  ['Mac', { label: 'Memory', num: true }, { label: 'Needs', num: true }, { label: 'Tok/s', num: true }, 'Verdict'],
  rows.map((x) => [
    `<td><a href="../../can/${pairSlug(model, x.h)}/">${esc(machineName(x.h))}</a></td>`,
    `<td class="num">${x.h.ram_gb} GB</td>`,
    `<td class="num">${gib(x.f.totalGiB)}</td>`,
    `<td class="num">${x.f.tokensPerSecond.toFixed(0)}</td>`,
    `<td>${pill(x.f)}</td>`,
  ])
)}

<h2>Download size by quantisation</h2>
<p>Weight memory scales linearly with bits per parameter. Everything below assumes an 8K context on top.</p>
${R.table(['Quantisation', { label: 'Weights', num: true }, { label: 'Total @ 8K', num: true }, 'Notes'], sizeRows)}

${isMoE ? `<div class="note"><strong>Mixture of experts</strong>${esc(model.name)} holds ${model.params_b}B parameters in memory but only reads about ${model.active_b}B per token. You pay the full memory cost of a ${model.params_b}B model and get roughly the speed of a ${model.active_b}B one — an excellent trade if you have the RAM.</div>` : ''}

${model.tags.includes('needs-review') ? `<div class="note"><strong>Partly estimated</strong>This model was added automatically from its published config. Its parameter count and KV cache size are exact, but the config did not expose the expert shapes needed to work out how many parameters are read per token — so the speed estimate assumes every parameter is read, and the real figure is likely <em>faster</em>. Memory numbers are unaffected.</div>` : ''}
${R.affiliateBlock(calc.weightsGiB(model.params_b) > 20 ? 'upgrade_ram' : 'storage')}
`;
  return {
    path: `models/${model.id}/index.html`,
    html: R.page({ title, description, canonical: `/models/${model.id}/`, body, depth: 2 }),
    priority: 0.7,
  };
}

/* ─────────────────────────────── mac hub ─────────────────────────────── */

function machinePage(machine, ctx) {
  const { models } = ctx;
  const rows = models
    .map((m) => ({ m, f: calc.fit(m, machine) }))
    .sort((a, b) => b.m.params_b - a.m.params_b);
  const fits = rows.filter((x) => x.f.verdict.key === 'comfortable');
  const biggest = fits[0];
  const hName = machineName(machine);

  const title = `Which LLMs run on an ${hName} Mac? — ${fits.length} of ${models.length} tested`;
  const description = `An ${hName} Mac has about ${gib(calc.usableGiB(machine.ram_gb))} available for a model. ${biggest ? `The largest that fits comfortably is ${biggest.m.name}.` : 'Only the smallest models fit.'} Full table with speed estimates.`;

  const body = `
<div class="crumbs"><a href="../../">Home</a> › <a href="../">Macs</a> › ${esc(hName)}</div>
<h1>Which AI models run on an ${esc(hName)} Mac?</h1>
<p class="sub">${esc(machine.chip)} · ${machine.gpu_cores}-core GPU · ${machine.bandwidth_gbps} GB/s memory bandwidth · ${esc(machine.products.join(', '))}</p>

${R.statGrid([
  { k: 'Unified memory', v: `${machine.ram_gb} GB`, n: 'soldered, not upgradeable' },
  { k: 'Usable for a model', v: gib(calc.usableGiB(machine.ram_gb)), n: 'after macOS takes its share' },
  { k: 'Bandwidth', v: `${machine.bandwidth_gbps} GB/s`, n: 'this sets your token speed' },
  { k: 'Models that fit', v: `${fits.length} of ${models.length}`, n: 'comfortably, at Q4_K_M' },
])}

${biggest
  ? `<div class="note"><strong>Short answer</strong>The largest model this machine runs comfortably is <strong>${esc(biggest.m.name)}</strong> — ${gib(biggest.f.totalGiB)} loaded, about ${biggest.f.tokensPerSecond.toFixed(0)} tokens/sec. ${machine.bandwidth_gbps < 150 ? 'Note that this chip is bandwidth-limited, so large models load but generate slowly.' : ''}</div>`
  : `<div class="note"><strong>Short answer</strong>This configuration is tight. Only the smallest models load with headroom — see the table.</div>`}

<h2>Every model on an ${esc(hName)}</h2>
<p>Assumes Q4_K_M weights and an 8K context with an FP16 KV cache. Click any row for the full breakdown and what to do if it does not fit.</p>
${R.table(
  ['Model', { label: 'Params', num: true }, { label: 'Needs', num: true }, { label: 'Tok/s', num: true }, 'Verdict'],
  rows.map((x) => [
    `<td><a href="../../can/${pairSlug(x.m, machine)}/">${esc(x.m.name)}</a></td>`,
    `<td class="num">${x.m.params_b}B</td>`,
    `<td class="num">${gib(x.f.totalGiB)}</td>`,
    `<td class="num">${x.f.tokensPerSecond.toFixed(0)}</td>`,
    `<td>${pill(x.f)}</td>`,
  ])
)}

${machine.ram_gb <= 16 ? `<div class="note"><strong>Working with ${machine.ram_gb} GB</strong>Quit your browser before loading a model — Chrome and Safari can hold several gigabytes each. Raising the Metal limit with <code>sudo sysctl iogpu.wired_limit_mb=${Math.floor(machine.ram_gb * 1024 * 0.85)}</code> gives a model more room, at the cost of leaving macOS less.</div>` : ''}

${R.affiliateBlock(machine.ram_gb <= 24 ? 'upgrade_ram' : 'storage')}
`;
  return {
    path: `macs/${machine.id}/index.html`,
    html: R.page({ title, description, canonical: `/macs/${machine.id}/`, body, depth: 2 }),
    priority: 0.7,
  };
}

/* ─────────────────────────────── indexes ─────────────────────────────── */

function modelsIndex(ctx) {
  const byFamily = {};
  for (const m of ctx.models) (byFamily[m.family] ||= []).push(m);
  const sections = Object.entries(byFamily)
    .map(([fam, list]) => `<h2>${esc(fam)}</h2><div class="grid">${list
      .sort((a, b) => a.params_b - b.params_b)
      .map((m) => {
        const c = ctx.machines.map((h) => ({ h, f: calc.fit(m, h) })).filter((x) => x.f.verdict.key === 'comfortable').sort((a, b) => a.h.ram_gb - b.h.ram_gb)[0];
        return `<a class="card" href="${m.id}/"><div class="t">${esc(m.name)}</div><div class="d">${gib(calc.weightsGiB(m.params_b))} at Q4 · ${c ? `${c.h.ram_gb} GB Mac minimum` : 'no Mac runs it'}</div></a>`;
      })
      .join('')}</div>`)
    .join('');
  const body = `<div class="crumbs"><a href="../">Home</a> › Models</div>
<h1>Models</h1>
<p class="sub">${ctx.models.length} open-weight models, sized against every Apple Silicon configuration.</p>${sections}`;
  return { path: 'models/index.html', html: R.page({ title: `Open-weight LLMs on Apple Silicon — memory requirements`, description: `Memory requirements and speed estimates for ${ctx.models.length} open-weight models on every Mac configuration.`, canonical: '/models/', body, depth: 1 }), priority: 0.9 };
}

function machinesIndex(ctx) {
  const byChip = {};
  for (const h of ctx.machines) (byChip[h.chip] ||= []).push(h);
  const sections = Object.entries(byChip)
    .map(([chip, list]) => `<h2>${esc(chip)}</h2><div class="grid">${list
      .sort((a, b) => a.ram_gb - b.ram_gb)
      .map((h) => {
        const n = ctx.models.filter((m) => calc.fit(m, h).verdict.key === 'comfortable').length;
        return `<a class="card" href="${h.id}/"><div class="t">${esc(machineName(h))}</div><div class="d">${n} of ${ctx.models.length} models fit · ${h.bandwidth_gbps} GB/s</div></a>`;
      })
      .join('')}</div>`)
    .join('');
  const body = `<div class="crumbs"><a href="../">Home</a> › Macs</div>
<h1>Macs</h1>
<p class="sub">Every Apple Silicon configuration, and what each one can actually load.</p>${sections}`;
  return { path: 'macs/index.html', html: R.page({ title: 'Which Mac for local AI? Every Apple Silicon config compared', description: 'Memory available, bandwidth and how many open-weight models fit, for every Apple Silicon Mac configuration.', canonical: '/macs/', body, depth: 1 }), priority: 0.9 };
}

module.exports = { modelPage, machinePage, modelsIndex, machinesIndex };
