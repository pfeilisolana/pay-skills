# Planet Council

Human GTM layer for **Scry Wallet Intelligence** (`scry.solanahub.de`) — the Scry lane’s cash path.

Scry stays **evidence-only** (x402 / Planet offers).  
Planet Council adds a **Telegram edge card + brief** that:

1. Pulls Scry evidence with a **spend-aware ladder** (cheap triage → deep only when justified)  
2. Builds a **deterministic edge card** users can act on before any LLM finishes  
3. Optionally runs a multi-model council (Claude + GPT + Grok) with dissent  
4. Gates deep / multi-model / watchlist behind Planet entitlements  

> Reviewer note (GPT / Claude / Grok): start with [`docs/REVIEWER_BRIEF.md`](docs/REVIEWER_BRIEF.md), then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

## Why this exists

- Scry already has the graph, lineage, bundler, mint, and x402 catalog.  
- Planet Plus/Pro checkout is still `manual_intake_until_checkout_configured`.  
- Agent x402 demand alone is slow cash; Telegram humans pay now.  
- **Edge card + multi-model dissent** is the differentiation vs raw trackers / RugCheck clones.  
- Watchlist digests create retention so Plus/Pro is not a one-shot scan.

## Product split (do not blur)

| Layer | System | May say |
|---|---|---|
| Evidence | Scry | coverage, freshness, lineage, cluster facts |
| Edge card | Council (deterministic) | structured signals extracted from Scry JSON |
| Interpretation | Council (LLM) | model opinions, dissent, open questions |
| Entitlement | Planet | free / plus / pro / founder limits |

Responses always separate **Edge card (Scry facts)** vs **Council reading (AI)**.

## User edge (what they actually get)

| Signal | Why it matters |
|---|---|
| Service/router quarantine | Avoid treating CEX/router vaults as “smart wallets” |
| Bundler / private-routing hint | Spot tip-service / private path patterns early |
| Funding lineage hops + nearest funder | Source-of-funds without buying two dossiers |
| Cluster / peer counts | Coordination context before trusting a “fresh” wallet |
| Mint holder concentration + creator | Preflight before chasing a launch |
| Coverage / freshness / missing fields | Know when evidence is too thin to lean on |
| Spend meter | See what the pull cost; stop burning USDC |

## Quick start

```bash
cd products/planet-council
cp .env.example .env
npm install
npm run typecheck
npm test
SCRY_MOCK=1 npm run dev   # explicit synthetic demo
```

Required env (see `.env.example`):

- `TELEGRAM_BOT_TOKEN`
- `SCRY_BASE_URL` (default `https://scry.solanahub.de`)
- `SCRY_INTERNAL_TOKEN` for live pulls (**no silent mock** if unset; set `SCRY_MOCK=1` for demos)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` (any subset works; 3 = full council)
- `HELIUS_API_KEY` optional enrichment / RPC
- `PLANET_ADMIN_TELEGRAM_IDS` for `/grant` during private alpha

## Commands (Telegram)

| Command | Free | Plus/Pro |
|---|---|---|
| `/coverage <addr>` | **free** cohort/freshness probe (no quota) | yes |
| `/scan <mint\|wallet>` | auto-detect when indexed + shallow | deep ladder + 3-model |
| `/wallet <address>` | limited | full forensics path |
| `/mint <mint>` | limited | launch/mint evidence path |
| `/connect <a> <b>` | — | pairwise connection evidence |
| `/deployer <address>` | — | Pro/Founder deployer history |
| `/watch` `/unwatch` `/watchlist` | — | Plus 10 / Pro 50 slots |
| `/digest` | — | **free** coverage deltas (retention) |
| `/digest deep` | — | paid evidence refresh (uses quota) |
| `/upgrade plus\|pro\|founder` | files Planet intake | — |
| `/dossier <addr>` | files ~$249 dossier intake | — |
| `/case` | files priority case intake | — |
| `/export` | — | Pro/Founder last-brief export |
| `/plans` `/usage` | yes | yes |
| `/activate <tx_sig>` | **disabled** (containment) | admin `/grant` for alpha |

## Efficiency & margin

- Free `/coverage` + `/digest` keep users engaged without burning Scry USDC or LLM spend.  
- Parallel Scry deep routes after quick-flag / mint-risk.  
- Parallel LLM calls (not sequential).  
- Compact prompts: edge card + truncated route JSON.  
- 120s scan dedup cache (no double-charge on repeat taps).  
- Usage counted **only after successful Telegram delivery**.  
- High-margin path: `/dossier` → Planet intake → ~$249 Scry Forensics Dossier.  

## Status of this package

- [x] Scry client + spend-aware route ladder  
- [x] Deterministic edge card  
- [x] Entitlement model aligned to `/api/planet/offers`  
- [x] Council orchestrator (1–3 models, parallel)  
- [x] Telegram bot wiring + watchlist digest  
- [x] Fail-closed live mode (no silent mock)  
- [x] SOL `/activate` contained (admin `/grant` only)  
- [x] Free coverage probe + auto-detect `/scan`  
- [x] Planet intake for `/upgrade` `/dossier` `/case`  
- [x] Watchlist coverage-delta digests (free) + deep refresh  
- [x] Pro `/export` of last brief  
- [x] Unit tests for parsing / entitlements / edge card / fail-closed / intake  
- [ ] Production hosting / secrets  
- [ ] Live LemonSqueezy / Telegram Stars checkout  
- [ ] Helius webhook push digests (scheduled)  

## Repo context

This lives in `pay-skills` so reviewers can see:

1. `providers/scry/wallet-intel/` — Scry listed for agents via pay catalog (agent SEO)  
2. `products/scry-agent-seo/` — Bazaar / x402 discovery playbook + Codex handoff  
3. `products/planet-council/` — human monetization path on top of Scry  

Codex owns the separate Scry API release. Do not change Scry’s evidence contract here —
except via the documented P0 handoff for `resource.description` on 402 challenges.
