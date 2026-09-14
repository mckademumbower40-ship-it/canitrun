# Can It Run?

**Which AI models actually run on your Mac.** A static site of 1,100+ pages answering
one question — "can a *{this Mac}* run *{that model}*?" — with the arithmetic shown.

- **Zero running cost.** Static HTML on GitHub Pages. No server, no database, no build service.
- **Zero AI slop.** Every number is computed in `lib/calc.js` from published model
  architectures and Apple's memory bandwidth specs. No language model is ever asked
  whether something fits — that's arithmetic, and arithmetic is the only reason
  anyone would trust the site.
- **Self-maintaining.** A daily GitHub Action pulls newly trending open-weight models
  from Hugging Face, derives their exact memory characteristics from their own
  `config.json`, rebuilds, and publishes.

## Why the numbers are trustworthy

Spot-checked against real-world reports:

| Claim | This site | Reported reality |
|---|---|---|
| Llama 3.1 8B Q4 on a Mac mini M4 24GB | 20 tok/s | ~20–22 tok/s |
| Llama 3.3 70B Q4 @ 8K on M4 Max 48GB | does not fit | famously borderline, needs KV quant |
| DeepSeek R1 671B Q4 on Mac Studio M3 Ultra 512GB | 411 GiB, 18 tok/s | fits, ~17–20 tok/s |
| DeepSeek R1 active parameters (derived) | 37.44B | 37B published |
| DeepSeek R1 MLA KV cache (derived) | 69 KB/token | ~70 KB/token |

## Setup

Everything that can be automated already is. The site is live, and all 1,137 URLs
have been submitted to IndexNow (Bing, Yandex, Seznam, Naver), which needs no
account — ownership is proved by the key file in `static/`.

What's left needs your logins:

```sh
./scripts/setup.sh
```

A five-stage wizard covering Amazon Associates, Google Search Console, Bing
Webmaster Tools, and an optional custom domain. It opens each page, says exactly
what to click, captures what you copy back, and publishes the changes for you.
Safe to quit and re-run — it remembers what you already entered.

## Commands

```sh
npm run build      # regenerate docs/ (about 0.7s for 1,100 pages)
npm run serve      # build and preview at localhost:4321
npm run check      # verify all 24,000 internal links resolve
npm run discover   # report newly trending models not yet in the catalogue
npm run all        # discover, add, rebuild, verify
```

## Layout

```
data/models.json      model catalogue (hand-curated + auto-discovered)
data/machines.json    every Apple Silicon configuration
data/affiliates.json  monetisation — set your Amazon tag here, once
data/site.json        name, tagline, base URL

lib/calc.js           the sizing engine. everything else is presentation
lib/render.js         HTML shell, CSS, affiliate blocks
lib/pages.js          model × machine pages
lib/hubs.js           per-model and per-Mac hubs
lib/guides.js         memory-tier guides, method page, home

static/               copied verbatim into docs/ (verification files live here,
                      because build.js wipes docs/ on every run)

build.js              writes docs/
scripts/discover.js   Hugging Face crawler
scripts/checklinks.js internal link checker
scripts/indexnow.js   IndexNow submission (no account needed)
scripts/setup.sh      guided setup for the steps only a human can do
scripts/set-affiliate-tag.js  one-command monetisation switch
```

## Monetisation

`data/affiliates.json` is the only file you touch. Set `amazon.tag` to your
Associates tracking ID and every link across all 1,100 pages picks it up on the
next build. **Until a tag is set the site renders plain, non-affiliate links and
hides the disclosure** — so it never claims a relationship that doesn't exist.

Amazon Associates requires an approved application and some traffic before it
pays out. Nothing here is guaranteed to earn; what it gives you is a large,
genuinely useful, internally consistent surface that has a real chance of
ranking, and costs nothing to keep online while it tries.

## Editing the model catalogue

Add an entry to `data/models.json`:

```json
{
  "id": "some-model-7b", "name": "Some Model 7B",
  "family": "Family", "vendor": "Vendor",
  "params_b": 7.6, "active_b": 7.6,
  "kv_kb_per_token": 56, "max_ctx": 131072,
  "license": "Apache 2.0", "released": "2025-01", "tags": ["general"]
}
```

`kv_kb_per_token` is `2 × layers × kv_heads × head_dim × 2 bytes ÷ 1024`, all of which
are in the model's `config.json`. `scripts/discover.js` does this for you.

Adding one model creates 27 new pages. Adding one Mac configuration creates 39.

## Method

Full derivation of every formula is published at `/method/` on the site itself.
