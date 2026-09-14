'use strict';
/**
 * Deterministic sizing engine for local LLMs on Apple Silicon.
 *
 * Every number on the site comes from this file. No language model is ever
 * asked whether a model "fits" - that is arithmetic, and arithmetic is the
 * only reason anyone would trust the site. The LLM only writes prose around
 * numbers this module has already decided.
 */

const GIB = 1024 ** 3;

/** Effective bits per weight for common GGUF/MLX quantisations, including
 *  the embedding and output tensors that are usually kept at higher precision. */
const QUANTS = {
  fp16:    { bits: 16.0, label: 'FP16',    blurb: 'Full precision. Reference quality, twice the memory of Q8.' },
  q8_0:    { bits: 8.5,  blurb: 'Q8_0',    label: 'Q8_0' },
  q6_K:    { bits: 6.6,  label: 'Q6_K',    blurb: 'Near-lossless. A good stop when you have memory to spare.' },
  q5_K_M:  { bits: 5.7,  label: 'Q5_K_M',  blurb: 'Slightly better than Q4_K_M, noticeably bigger.' },
  q4_K_M:  { bits: 4.9,  label: 'Q4_K_M',  blurb: 'The default. Best quality-per-gigabyte for most people.' },
  q3_K_M:  { bits: 3.9,  label: 'Q3_K_M',  blurb: 'Visible quality loss. Use to squeeze one size class up.' },
  q2_K:    { bits: 3.0,  label: 'Q2_K',    blurb: 'Last resort. Often worse than a smaller model at Q4.' },
};
QUANTS.q8_0.blurb = 'Indistinguishable from FP16 in practice, at half the size.';

const KV_QUANTS = {
  fp16: { mult: 1.00, label: 'FP16' },
  q8:   { mult: 0.53, label: 'Q8' },
  q4:   { mult: 0.28, label: 'Q4' },
};

const DEFAULT_QUANT = 'q4_K_M';
const DEFAULT_CTX = 8192;

/** Weight memory in GiB. */
function weightsGiB(paramsB, quant = DEFAULT_QUANT) {
  const bits = QUANTS[quant].bits;
  return (paramsB * 1e9 * bits) / 8 / GIB;
}

/** KV cache in GiB for a given context length. */
function kvGiB(kvKbPerToken, ctx = DEFAULT_CTX, kvQuant = 'fp16') {
  return (kvKbPerToken * 1024 * ctx * KV_QUANTS[kvQuant].mult) / GIB;
}

/** Runtime overhead: compute buffers, activations, the inference process itself. */
function overheadGiB(wGiB, ctx = DEFAULT_CTX) {
  return 0.5 + 0.05 * wGiB + 0.3 * (ctx / 8192);
}

/**
 * Memory macOS will actually let you hand to a model.
 * The OS, the window server and your browser need headroom; Metal also applies
 * a default wired-memory limit you can raise with `sudo sysctl iogpu.wired_limit_mb`.
 */
function usableGiB(ramGb) {
  const reserve = Math.min(Math.max(ramGb * 0.15, 3), 16);
  return ramGb - reserve;
}

/** Estimated token generation speed. Memory-bandwidth bound, which is why
 *  bandwidth - not GPU core count - is the number that matters on a Mac. */
function tokensPerSecond(model, machine, quant = DEFAULT_QUANT) {
  const activeGiB = weightsGiB(model.active_b, quant);
  const isMoE = model.active_b < model.params_b * 0.9;
  // MoE gather patterns are less bandwidth-efficient than a dense sweep.
  const efficiency = isMoE ? 0.50 : 0.80;
  const activeGB = activeGiB * GIB / 1e9;
  return (machine.bandwidth_gbps / activeGB) * efficiency;
}

const VERDICTS = {
  comfortable: { key: 'comfortable', label: 'Yes, comfortably', tone: 'good' },
  tight:       { key: 'tight',       label: 'Yes, but tight',   tone: 'warn' },
  no:          { key: 'no',          label: 'No',               tone: 'bad' },
};

/**
 * The single question the site exists to answer.
 * Returns the full breakdown so a page can show its work.
 */
function fit(model, machine, opts = {}) {
  const quant = opts.quant || DEFAULT_QUANT;
  const ctx = Math.min(opts.ctx || DEFAULT_CTX, model.max_ctx);
  const kvQuant = opts.kvQuant || 'fp16';

  const w = weightsGiB(model.params_b, quant);
  const kv = kvGiB(model.kv_kb_per_token, ctx, kvQuant);
  const oh = overheadGiB(w, ctx);
  const total = w + kv + oh;
  const usable = usableGiB(machine.ram_gb);

  let verdict;
  if (total <= usable * 0.85) verdict = VERDICTS.comfortable;
  else if (total <= usable) verdict = VERDICTS.tight;
  else verdict = VERDICTS.no;

  const tps = tokensPerSecond(model, machine, quant);

  return {
    quant, ctx, kvQuant,
    weightsGiB: w, kvGiB: kv, overheadGiB: oh, totalGiB: total,
    usableGiB: usable, ramGb: machine.ram_gb,
    headroomGiB: usable - total,
    utilisation: total / usable,
    verdict,
    tokensPerSecond: tps,
    speedBand: tps >= 40 ? 'fast' : tps >= 15 ? 'usable' : tps >= 6 ? 'slow' : 'painful',
  };
}

/** Best quantisation that still fits, walking down from highest quality. */
function bestFittingQuant(model, machine, opts = {}) {
  const order = ['fp16', 'q8_0', 'q6_K', 'q5_K_M', 'q4_K_M', 'q3_K_M', 'q2_K'];
  for (const q of order) {
    const f = fit(model, machine, { ...opts, quant: q });
    if (f.verdict.key === 'comfortable') return { quant: q, fit: f };
  }
  for (const q of order) {
    const f = fit(model, machine, { ...opts, quant: q });
    if (f.verdict.key === 'tight') return { quant: q, fit: f };
  }
  return null;
}

/** Longest context that fits at a given quantisation, to the nearest useful step. */
function maxContext(model, machine, quant = DEFAULT_QUANT, kvQuant = 'fp16') {
  const steps = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];
  let best = 0;
  for (const ctx of steps) {
    if (ctx > model.max_ctx) break;
    if (fit(model, machine, { quant, ctx, kvQuant }).verdict.key !== 'no') best = ctx;
  }
  return best;
}

module.exports = {
  QUANTS, KV_QUANTS, VERDICTS, DEFAULT_QUANT, DEFAULT_CTX,
  weightsGiB, kvGiB, overheadGiB, usableGiB, tokensPerSecond,
  fit, bestFittingQuant, maxContext,
};
