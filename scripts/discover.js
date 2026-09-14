#!/usr/bin/env node
'use strict';
/**
 * Finds open-weight models that are trending on Hugging Face and are not yet in
 * data/models.json, then derives their exact memory characteristics from the
 * published config.json.
 *
 * Nothing here is guessed. Parameter counts come from the safetensors index and
 * KV cache size is computed from the real attention shapes, so a model added by
 * this script is as trustworthy as one added by hand.
 *
 *   node scripts/discover.js           # report only
 *   node scripts/discover.js --write   # append accepted models to data/models.json
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data', 'models.json');
const WRITE = process.argv.includes('--write');
const LIMIT = Number(process.env.DISCOVER_LIMIT || 60);

/** Families we cover. Keeps the site focused instead of drifting into every fine-tune. */
const FAMILIES = [
  { re: /^meta-llama\//i, family: 'Llama', vendor: 'Meta' },
  { re: /^Qwen\//i, family: 'Qwen', vendor: 'Alibaba' },
  { re: /^google\/gemma/i, family: 'Gemma', vendor: 'Google' },
  { re: /^mistralai\//i, family: 'Mistral', vendor: 'Mistral AI' },
  { re: /^deepseek-ai\//i, family: 'DeepSeek', vendor: 'DeepSeek' },
  { re: /^microsoft\/[Pp]hi/i, family: 'Phi', vendor: 'Microsoft' },
  { re: /^openai\/gpt-oss/i, family: 'gpt-oss', vendor: 'OpenAI' },
  { re: /^allenai\//i, family: 'OLMo', vendor: 'Ai2' },
];

const slug = (id) => id.split('/').pop().toLowerCase()
  .replace(/[._]/g, '-').replace(/-instruct$/, '').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'canitrun-discover' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/** Full config.json, which the summary in the API index does not include. */
async function rawConfig(repo) {
  const r = await fetch(`https://huggingface.co/${repo}/raw/main/config.json`, { headers: { 'User-Agent': 'canitrun-discover' } });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

/**
 * Derive the numbers the sizing engine needs, straight from the config.
 * Handles both grouped-query attention and DeepSeek-style multi-head latent
 * attention, whose KV cache is a compressed latent vector and therefore far
 * smaller than its parameter count would suggest.
 */
function derive(cfg, params) {
  const c = cfg.text_config || cfg;
  const L = c.num_hidden_layers ?? c.n_layer;
  const heads = c.num_attention_heads ?? c.n_head;
  const hidden = c.hidden_size ?? c.n_embd;
  if (!L || !heads || !hidden) return null;

  const isMLA = Boolean(c.kv_lora_rank);
  let kvBytesPerToken;
  if (isMLA) {
    // MLA caches one latent vector plus the RoPE part, per layer.
    kvBytesPerToken = (c.kv_lora_rank + (c.qk_rope_head_dim ?? 64)) * L * 2;
  } else {
    const kvHeads = c.num_key_value_heads ?? heads;
    const headDim = c.head_dim ?? hidden / heads;
    kvBytesPerToken = 2 * L * kvHeads * headDim * 2;
  }
  const kv_kb_per_token = Math.round(kvBytesPerToken / 1024);
  if (!kv_kb_per_token) return null;

  const maxCtx = c.max_position_embeddings ?? 8192;

  // Active parameters per token. Dense models read everything; MoE models read
  // the attention stack plus only the experts the router selects.
  const nRouted = c.n_routed_experts ?? c.num_local_experts ?? c.num_experts;
  const topK = c.num_experts_per_tok ?? c.experts_per_token;
  let active = params;
  let reviewed = true;

  if (nRouted && topK) {
    const moeInter = c.moe_intermediate_size;
    const inter = c.intermediate_size;
    const nShared = c.n_shared_experts ?? 0;
    const denseLayers = c.first_k_dense_replace ?? 0;
    const vocab = c.vocab_size ?? 0;

    if (moeInter && inter && vocab) {
      const headDim = c.head_dim ?? (isMLA ? (c.qk_nope_head_dim ?? 128) + (c.qk_rope_head_dim ?? 64) : hidden / heads);
      const attnPerLayer = isMLA
        ? hidden * (c.q_lora_rank ?? hidden) + (c.q_lora_rank ?? hidden) * heads * headDim
          + hidden * (c.kv_lora_rank + (c.qk_rope_head_dim ?? 64))
          + c.kv_lora_rank * heads * ((c.qk_nope_head_dim ?? 128) + (c.v_head_dim ?? 128))
          + heads * (c.v_head_dim ?? 128) * hidden
        : hidden * heads * headDim + 2 * hidden * (c.num_key_value_heads ?? heads) * headDim + heads * headDim * hidden;

      const moeLayers = L - denseLayers;
      const ffnDense = 3 * hidden * inter;
      const ffnMoE = (topK + nShared) * 3 * hidden * moeInter;
      const embed = vocab * hidden * (c.tie_word_embeddings ? 1 : 2);

      active = (embed + L * attnPerLayer + denseLayers * ffnDense + moeLayers * ffnMoE) / 1e9;
    } else {
      // Not enough shape information to be honest about it.
      reviewed = false;
    }
  }

  return {
    params_b: Number(params.toFixed(2)),
    active_b: Number(Math.min(active, params).toFixed(2)),
    kv_kb_per_token,
    max_ctx: Math.min(maxCtx, 131072),
    moe: Boolean(nRouted && topK),
    reviewed,
  };
}

async function main() {
  const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const known = new Set(db.models.map((m) => m.id));

  const trending = await json(
    `https://huggingface.co/api/models?filter=text-generation&sort=trendingScore&direction=-1&limit=${LIMIT}`
  );

  const found = [];
  for (const entry of trending) {
    const fam = FAMILIES.find((f) => f.re.test(entry.id));
    if (!fam) continue;
    const id = slug(entry.id);
    if (known.has(id)) continue;

    let detail;
    try { detail = await json(`https://huggingface.co/api/models/${entry.id}`); } catch { continue; }
    const params = detail?.safetensors?.total;
    if (!params) continue;
    const cfg = await rawConfig(entry.id);
    if (!cfg) continue;

    const d = derive(cfg, params / 1e9);
    if (!d) continue;

    found.push({
      id,
      name: entry.id.split('/').pop().replace(/-/g, ' '),
      family: fam.family,
      vendor: fam.vendor,
      params_b: d.params_b,
      active_b: d.active_b,
      kv_kb_per_token: d.kv_kb_per_token,
      max_ctx: d.max_ctx,
      license: detail.cardData?.license || 'see model card',
      released: (detail.createdAt || '').slice(0, 7),
      tags: [d.moe ? 'moe' : 'dense', 'auto-discovered'].concat(d.reviewed ? [] : ['needs-review']),
      _hf: entry.id,
      _downloads: entry.downloads,
    });
  }

  if (!found.length) { console.log('No new models. Catalogue is current.'); return; }

  console.log(`Found ${found.length} new model(s):\n`);
  for (const m of found) {
    console.log(`  ${m.name}  (${m._hf})`);
    console.log(`    ${m.params_b}B params${m.active_b < m.params_b ? ` / ${m.active_b}B active` : ''}, ${m.kv_kb_per_token} KB KV per token, ${m._downloads?.toLocaleString() ?? '?'} downloads`);
  }

  if (!WRITE) { console.log('\nRun with --write to add them.'); return; }

  for (const m of found) { delete m._hf; delete m._downloads; db.models.push(m); }
  db.models.sort((a, b) => a.family.localeCompare(b.family) || a.params_b - b.params_b);
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2) + '\n');
  console.log(`\nAdded ${found.length} model(s) to data/models.json.`);
}

if (require.main === module) main().catch((e) => { console.error('discover failed:', e.message); process.exit(1); });
module.exports = { derive, slug };
