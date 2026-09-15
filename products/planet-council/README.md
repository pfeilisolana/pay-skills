# Planet Council

Human GTM layer for **Scry Wallet Intelligence** (`scry.solanahub.de`).

Scry stays **evidence-only** (x402 / Planet offers).  
Planet Council adds a **Telegram brief** that:

1. Pulls Scry evidence for a wallet or mint  
2. Runs a multi-model council (Claude + GPT + Grok)  
3. Returns a clearly labeled **interpretation** (not Scry evidence)  
4. Gates deep / multi-model usage behind Planet entitlements  

> Reviewer note (GPT / Claude / Grok): start with [`docs/REVIEWER_BRIEF.md`](docs/REVIEWER_BRIEF.md), then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/SECURITY.md`](docs/SECURITY.md).

## Why this exists

- Scry already has the graph, lineage, bundler, mint, and x402 catalog.  
- Planet Plus/Pro checkout is still `manual_intake_until_checkout_configured`.  
- Agent x402 demand alone is slow cash; Telegram humans pay now.  
- Multi-model briefs are the differentiation vs raw trackers / RugCheck clones.

## Product split (do not blur)

| Layer | System | May say |
|---|---|---|
| Evidence | Scry | coverage, freshness, lineage, cluster facts |
| Interpretation | Council | model opinions, dissent, open questions |
| Entitlement | Planet | free / plus / pro / founder limits |

Council responses must always separate **Evidence** vs **Council reading**.

## Quick start

```bash
cd products/planet-council
cp .env.example .env
npm install
npm run typecheck
npm test
npm run dev
```

Required env (see `.env.example`):

- `TELEGRAM_BOT_TOKEN`
- `SCRY_BASE_URL` (default `https://scry.solanahub.de`)
- `SCRY_INTERNAL_TOKEN` **or** x402 payer wallet for paid routes
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` (any subset works; 3 = full council)
- `HELIUS_API_KEY` optional enrichment
- `PLANET_PAYMENT_ADDRESS` for SOL/USDC sub verification

## Commands (Telegram)

| Command | Free | Plus/Pro |
|---|---|---|
| `/start` | yes | yes |
| `/scan <mint\|wallet>` | shallow (quick-flag / mint risk) + 1-model brief | deep evidence + 3-model council |
| `/wallet <address>` | limited | full forensics path |
| `/mint <mint>` | limited | launch/mint evidence path |
| `/plans` | yes | yes |
| `/activate <tx_sig>` | unlock after on-chain payment | — |
| `/usage` | yes | yes |

## Status of this package

Scaffold intended for review + iteration:

- [x] Scry client + route ladder  
- [x] Entitlement model aligned to `/api/planet/offers`  
- [x] Council orchestrator (1–3 models)  
- [x] Telegram bot wiring  
- [x] On-chain activation verifier (SOL transfer memo)  
- [x] Unit tests for parsing / entitlements / prompt boundaries  
- [ ] Production hosting / secrets  
- [ ] Live LemonSqueezy / Stripe checkout (Planet still manual intake)  
- [ ] Watchlist webhook digests (Helius) — week 3  

## Repo context

This lives in `pay-skills` so reviewers can see:

1. `providers/scry/wallet-intel/` — Scry listed for agents via pay catalog  
2. `products/planet-council/` — human monetization path on top of Scry  
