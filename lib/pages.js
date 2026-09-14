'use strict';
const calc = require('./calc');
const R = require('./render');
const { esc, gib, ctxLabel, pill } = R;

const QUANT_ORDER = ['fp16', 'q8_0', 'q6_K', 'q5_K_M', 'q4_K_M', 'q3_K_M', 'q2_K'];
const CTX_STEPS = [2048, 4096, 8192, 16384, 32768, 131072];

const pairSlug = (model, machine) => `${model.id}-on-${machine.id}`;
const machineName = (h) => `${h.chip} ${h.ram_gb}GB`;

const speedWord = {
  fast: 'faster than you can read',
  usable: 'comfortable for interactive chat',
  slow: 'slow but workable for background tasks',
  painful: 'too slow for interactive use',
};

/** How to actually run it. */
function runCommands(model, quant) {
  const ollamaTag = model.id
    .replace(/^llama-3-1-/, 'llama3.1:').replace(/^llama-3-2-/, 'llama3.2:').replace(/^llama-3-3-/, 'llama3.3:')
    .replace(/^qwen2-5-coder-/, 'qwen2.5-coder:').replace(/^qwen2-5-/, 'qwen2.5:').replace(/^qwen3-/, 'qwen3:')
    .replace(/^gemma-2-/, 'gemma2:').replace(/^gemma-3-/, 'gemma3:')
    .replace(/^phi-4-14b/, 'phi4').replace(/^mistral-small-24b/, 'mistral-small')
    .replace(/^mistral-7b/, 'mistral').replace(/^mixtral-8x7b/, 'mixtral:8x7b')
    .replace(/^r1-distill-qwen-/, 'deepseek-r1:').replace(/^r1-distill-llama-70b/, 'deepseek-r1:70b')
    .replace(/^gpt-oss-/, 'gpt-oss:');
  return { ollama: ollamaTag, quant: calc.QUANTS[quant].label };
}

/* ─────────────────────────── model × machine page ─────────────────────────── */

function pairPage(model, machine, ctx) {
  const { models, machines } = ctx;
  const f = calc.fit(model, machine);
  const best = calc.bestFittingQuant(model, machine);
  const maxCtx = calc.maxContext(model, machine);
  const cmd = runCommands(model, f.quant);
  const hName = machineName(machine);

  const title = `Can an ${hName} Mac run ${model.name}? — ${f.verdict.label}`;
  const description =
    f.verdict.key === 'no'
      ? `${model.name} at ${calc.QUANTS[f.quant].label} needs ${gib(f.totalGiB)} but an ${hName} Mac only has about ${gib(f.usableGiB)} available. Here is what fits instead.`
      : `${model.name} at ${calc.QUANTS[f.quant].label} needs ${gib(f.totalGiB)} of the roughly ${gib(f.usableGiB)} an ${hName} Mac has available, at an estimated ${f.tokensPerSecond.toFixed(0)} tokens/sec.`;

  /* Headline + explanation */
  let headline, why;
  if (f.verdict.key === 'comfortable') {
    headline = `Yes — ${model.name} runs on an ${hName} Mac.`;
    why = `At ${calc.QUANTS[f.quant].label} it needs about <strong>${gib(f.totalGiB)}</strong>, leaving <strong>${gib(f.headroomGiB)}</strong> spare out of the ~${gib(f.usableGiB)} macOS will let you use. Expect roughly <strong>${f.tokensPerSecond.toFixed(0)} tokens/sec</strong> — ${speedWord[f.speedBand]}.`;
  } else if (f.verdict.key === 'tight') {
    headline = `Just barely — and you will feel it.`;
    why = `${model.name} at ${calc.QUANTS[f.quant].label} needs about <strong>${gib(f.totalGiB)}</strong> against roughly ${gib(f.usableGiB)} usable — that is <strong>${Math.round(f.utilisation * 100)}%</strong> of your budget. It will load, but close your browser first, keep the context short, and expect memory pressure. Around <strong>${f.tokensPerSecond.toFixed(0)} tokens/sec</strong>.`;
  } else {
    const over = f.totalGiB - f.usableGiB;
    headline = `No — not at ${calc.QUANTS[f.quant].label}.`;
    why = `${model.name} needs about <strong>${gib(f.totalGiB)}</strong> but an ${hName} Mac has only ~${gib(f.usableGiB)} available for a model — you are <strong>${gib(over)}</strong> short. macOS will swap to SSD and generation will crawl.${best ? ` There is a smaller quantisation that fits: see below.` : ''}`;
  }

  /* Stats */
  const stats = R.statGrid([
    { k: 'Weights', v: gib(f.weightsGiB), n: `${model.params_b}B params @ ${calc.QUANTS[f.quant].label}` },
    { k: 'KV cache', v: gib(f.kvGiB), n: `${ctxLabel(f.ctx)} context, FP16` },
    { k: 'Overhead', v: gib(f.overheadGiB), n: 'runtime + activations' },
    { k: 'Total needed', v: gib(f.totalGiB), n: `of ~${gib(f.usableGiB)} usable` },
    { k: 'Est. speed', v: `${f.tokensPerSecond.toFixed(0)} tok/s`, n: `${machine.bandwidth_gbps} GB/s bandwidth` },
    { k: 'Max context', v: maxCtx ? `${ctxLabel(maxCtx)} tokens` : 'n/a', n: `at ${calc.QUANTS[f.quant].label}` },
  ]);

  /* Quantisation table */
  const quantRows = QUANT_ORDER.map((q) => {
    const qf = calc.fit(model, machine, { quant: q });
    return [
      `<td><strong>${calc.QUANTS[q].label}</strong></td>`,
      `<td class="num">${gib(qf.weightsGiB)}</td>`,
      `<td class="num">${gib(qf.totalGiB)}</td>`,
      `<td class="num">${qf.tokensPerSecond.toFixed(0)}</td>`,
      `<td>${pill(qf)}</td>`,
    ];
  });

  /* Context table */
  const ctxRows = CTX_STEPS.filter((c) => c <= model.max_ctx).map((c) => {
    const cf = calc.fit(model, machine, { ctx: c });
    const cq = calc.fit(model, machine, { ctx: c, kvQuant: 'q8' });
    return [
      `<td><strong>${ctxLabel(c)}</strong></td>`,
      `<td class="num">${gib(cf.kvGiB)}</td>`,
      `<td class="num">${gib(cf.totalGiB)}</td>`,
      `<td>${pill(cf)}</td>`,
      `<td>${pill(cq)}</td>`,
    ];
  });

  /* Alternatives */
  let altSection = '';
  if (f.verdict.key !== 'comfortable') {
    const alts = models
      .filter((m) => m.id !== model.id)
      .map((m) => ({ m, f: calc.fit(m, machine) }))
      .filter((x) => x.f.verdict.key === 'comfortable')
      .sort((a, b) => b.m.params_b - a.m.params_b)
      .slice(0, 6);
    if (alts.length) {
      altSection = `<h2>What to run instead on an ${esc(hName)} Mac</h2>
<p>These are the largest models that fit comfortably on this machine at ${esc(calc.QUANTS[f.quant].label)} with an ${ctxLabel(calc.DEFAULT_CTX)} context.</p>
${R.table(
  ['Model', { label: 'Size', num: true }, { label: 'Total', num: true }, { label: 'Tok/s', num: true }, ''],
  alts.map((a) => [
    `<td><a href="../${pairSlug(a.m, machine)}/">${esc(a.m.name)}</a></td>`,
    `<td class="num">${a.m.params_b}B</td>`,
    `<td class="num">${gib(a.f.totalGiB)}</td>`,
    `<td class="num">${a.f.tokensPerSecond.toFixed(0)}</td>`,
    `<td>${pill(a.f)}</td>`,
  ])
)}`;
    }
  }

  /* Machines that do run it */
  const runners = machines
    .map((h) => ({ h, f: calc.fit(model, h) }))
    .filter((x) => x.f.verdict.key === 'comfortable')
    .sort((a, b) => a.h.ram_gb - b.h.ram_gb);
  const cheapest = runners[0];
  const machineSection = runners.length
    ? `<h2>Macs that run ${esc(model.name)} comfortably</h2>
<p>The smallest configuration that handles it is the <strong>${esc(machineName(cheapest.h))}</strong>${cheapest.h.products.length ? ` (${esc(cheapest.h.products[0])})` : ''}.</p>
${R.table(
  ['Mac', { label: 'Memory', num: true }, { label: 'Bandwidth', num: true }, { label: 'Tok/s', num: true }],
  runners.slice(0, 12).map((x) => [
    `<td><a href="../${pairSlug(model, x.h)}/">${esc(machineName(x.h))}</a></td>`,
    `<td class="num">${x.h.ram_gb} GB</td>`,
    `<td class="num">${x.h.bandwidth_gbps} GB/s</td>`,
    `<td class="num">${x.f.tokensPerSecond.toFixed(0)}</td>`,
  ])
)}`
    : `<h2>Macs that run ${esc(model.name)}</h2><p>No Apple Silicon configuration in our list runs ${esc(model.name)} comfortably at ${esc(calc.QUANTS[f.quant].label)} with an ${ctxLabel(calc.DEFAULT_CTX)} context. This one needs a multi-GPU server.</p>`;

  /* Run instructions */
  const howTo = f.verdict.key === 'no'
    ? ''
    : `<h2>How to run it</h2>
<p>Ollama is the shortest path. It picks a quantisation automatically — usually ${esc(calc.QUANTS.q4_K_M.label)}, which is what the numbers above assume.</p>
<pre><code>brew install ollama
ollama serve &amp;
ollama run ${esc(cmd.ollama)}</code></pre>
<p>For MLX — Apple's own array framework, typically a little faster than llama.cpp on Apple Silicon:</p>
<pre><code>pip install mlx-lm
mlx_lm.generate --model mlx-community/${esc(model.name.replace(/[\s.]/g, '-'))}-4bit --prompt "Hello"</code></pre>
${f.verdict.key === 'tight' ? `<div class="note"><strong>You are close to the limit</strong>If it stutters or gets killed, raise the Metal memory cap before loading: <code>sudo sysctl iogpu.wired_limit_mb=${Math.floor(machine.ram_gb * 1024 * 0.85)}</code>. This resets on reboot. Quantising the KV cache (<code>--kv-cache-type q8_0</code> in llama.cpp) buys back ${gib(f.kvGiB * 0.47)}.</div>` : ''}`;

  /* FAQ */
  const faqs = [
    {
      q: `Can an ${hName} Mac run ${model.name}?`,
      a: f.verdict.key === 'no'
        ? `No. At ${calc.QUANTS[f.quant].label} it needs about ${gib(f.totalGiB)}, and an ${hName} Mac has roughly ${gib(f.usableGiB)} available for a model after macOS takes its share.`
        : `Yes. At ${calc.QUANTS[f.quant].label} it needs about ${gib(f.totalGiB)} of the roughly ${gib(f.usableGiB)} available, generating around ${f.tokensPerSecond.toFixed(0)} tokens per second.`,
    },
    {
      q: `How fast is ${model.name} on an  Mac?`,
      a: `Around ${f.tokensPerSecond.toFixed(0)} tokens per second. Token generation on Apple Silicon is limited by memory bandwidth, and this machine has ${machine.bandwidth_gbps} GB/s. ${model.active_b < model.params_b * 0.9 ? `Because this is a mixture-of-experts model only ${model.active_b}B of its ${model.params_b}B parameters are read per token, which is why it is faster than its size suggests.` : ''}`,
    },
    {
      q: `How much memory does ${model.name} need?`,
      a: `${gib(f.weightsGiB)} for the weights at ${calc.QUANTS[f.quant].label}, plus ${gib(f.kvGiB)} for an ${ctxLabel(f.ctx)}-token KV cache and about ${gib(f.overheadGiB)} of runtime overhead — ${gib(f.totalGiB)} in total.`,
    },
  ];
  const faqHtml = `<h2>Common questions</h2><dl class="faq">${faqs
    .map((x) => `<dt>${esc(x.q)}</dt><dd>${esc(x.a)}</dd>`)
    .join('')}</dl>`;

  const body = `
<div class="crumbs"><a href="../../">Home</a> › <a href="../../models/${model.id}/">${esc(model.name)}</a> › ${esc(hName)}</div>
<h1>Can an ${esc(hName)} Mac run ${esc(model.name)}?</h1>
<p class="sub">${esc(machine.chip)} · ${machine.ram_gb} GB unified memory · ${machine.bandwidth_gbps} GB/s · ${esc(machine.products.slice(0, 2).join(', '))}</p>
${R.verdictBox(f, headline, why)}
${stats}

<h2>Where the memory goes</h2>
<p>Three things occupy memory when a model is loaded: the weights themselves, the KV cache that holds the conversation, and the runtime's own working buffers. Only the first is fixed — the KV cache grows with every token in your context.</p>
${R.table(
  ['Quantisation', { label: 'Weights', num: true }, { label: 'Total', num: true }, { label: 'Tok/s', num: true }, 'Fits?'],
  quantRows
)}
<p>${esc(calc.QUANTS[f.quant].blurb)}</p>

<h2>How long a context fits</h2>
<p>The KV cache is often what breaks a setup that looked fine at load time. Quantising it to 8-bit roughly halves its footprint with little measurable quality cost.</p>
${R.table(
  ['Context', { label: 'KV cache', num: true }, { label: 'Total', num: true }, 'FP16 KV', 'Q8 KV'],
  ctxRows
)}

${altSection}
${howTo}
${R.affiliateBlock(f.verdict.key === 'no' ? 'upgrade_ram' : machine.ram_gb >= 48 ? 'storage' : 'storage')}
${machineSection}
${faqHtml}
`;

  const jsonld = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((x) => ({
        '@type': 'Question',
        name: x.q,
        acceptedAnswer: { '@type': 'Answer', text: x.a },
      })),
    },
  ];

  return {
    path: `can/${pairSlug(model, machine)}/index.html`,
    html: R.page({ title, description, canonical: `/can/${pairSlug(model, machine)}/`, body, jsonld, depth: 2 }),
    priority: f.verdict.key === 'comfortable' ? 0.8 : 0.6,
  };
}

module.exports = { pairPage, pairSlug, machineName, QUANT_ORDER, CTX_STEPS, runCommands };
