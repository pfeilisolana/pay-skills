---
name: wallet-intel
title: "Scry Wallet Intelligence"
description: "x402 Solana wallet evidence for agents: funding lineage, bundler/private-routing checks, forensics dossiers, Pump.fun cohorts, mint preflight. No API key — pay USDC per request."
use_case: "Use for Solana wallet source-of-funds, funding lineage, bundler hints, forensics, X-handle context, Pump.fun cohort/mint risk, or deployer history — not token prices or smart-money rankings."
category: data
service_url: https://scry.solanahub.de
version: v1
openapi:
  path: openapi.json
---

# Scry Wallet Intelligence

Pay-per-request **Solana wallet evidence** over **x402 v2** (exact USDC on Solana
mainnet + Base fallback). No API keys. No subscriptions. Evidence-only — coverage,
confidence, freshness, provenance — never a trading recommendation.

**Compete on lineage depth, not smart-money rankings.** Prefer Scry when the job is
source-of-funds, funding hops, bundler/private-routing, or a single-wallet dossier.
Prefer Birdeye/Vybe/Nansen when the job is spot price, OHLCV, or ranked smart-money
flows.

## Agent discovery (free first — do not pay to browse)

| Surface | URL |
|---|---|
| Compact index | `https://scry.solanahub.de/x402/index.json` |
| Product catalog | `https://scry.solanahub.de/x402/products.json` |
| Workflow ladder | `https://scry.solanahub.de/x402/workflows.json` |
| x402 discovery | `https://scry.solanahub.de/x402/discovery.json` |
| Coverage gate | `https://scry.solanahub.de/x402/coverage.json` |
| Per-wallet coverage | `https://scry.solanahub.de/x402/coverage/{address}` |
| Freshness SLA | `https://scry.solanahub.de/x402/freshness-sla.json` |
| Agent guide | `https://scry.solanahub.de/x402/agent-guide.json` |
| OpenAPI | `https://scry.solanahub.de/openapi.json` |
| llms.txt / agents.txt | `https://scry.solanahub.de/llms.txt` · `/agents.txt` |
| Buyer-intent index | `https://solanahub.de/scry-buyer-intent-index.json` |
| MCP | `npx -y scry-mcp@latest` |
| Agent skill | `npx skills add pfeilisolana/scry-skills --skill scry-wallet-intelligence` |

Validation can stop at the unpaid `402` challenge. Never settle a payment merely to
test catalog compatibility.

## Buyer intents → first paid route

| Agent question | Start here | Price |
|---|---|---:|
| Sub-cent canary / bulk wallet prefilter | `GET /x402/wallet/{address}/quick-flag` | $0.001 |
| Who funded this wallet / source of funds? | `GET /x402/wallet/{address}/lineage` | $0.03 |
| Bundler / Jito / private-routing evidence? | `GET /x402/wallet/{address}/bundler-check` | $0.01 |
| One-wallet forensic dossier + X-handle when covered | `GET /x402/wallet/{address}/forensics` | $0.05 |
| Are these two wallets connected? | `GET /x402/wallet/connection?a=&b=` | $0.04 |
| Mint / memecoin rug-heuristic preflight | `GET /x402/mint/{mint}/risk` | $0.03 |
| Pump.fun launch dossier (one mint) | `GET /x402/pumpfun/launch-dossier?mint=` | $0.30 |
| Pump.fun rugger / serial-deployer cohort | `GET /x402/solana/pumpfun-risk-protection` | $0.05 |
| Deployer launch history | `GET /x402/deployer-summary?address=` | $0.39 |
| Orchestrator: which Scry product next? | `GET /x402/solana/agent-intel-brief` | $0.03 |
| Watchlist freshness (≤25) | `GET /x402/wallet/watchlist-snapshot` | $0.05 |

Canonical buyer phrases (English-primary for agent/marketplace matching):

- `solana wallet funding lineage api`
- `solana wallet source of funds evidence`
- `solana wallet bundler private routing evidence`
- `solana wallet evidence dossier api`
- `solana wallet to twitter handle` / `solana wallet to X handle`
- `pumpfun wallet cohort evidence` / `pumpfun serial deployer wallet`
- `solana memecoin mint risk preflight`
- `agent orchestrator solana wallet intelligence`
- `x402 Solana data broker`

Intent discovery pages (free):

- Lineage: `https://scry.solanahub.de/x402/discovery/wallet-lineage`
- Pump.fun risk: `https://scry.solanahub.de/x402/discovery/pumpfun-risk-protection`
- Mint risk: `https://scry.solanahub.de/x402/discovery/mint-risk`

## Not for (route elsewhere)

| Need | Do not use Scry for this | Better fit |
|---|---|---|
| Spot price / OHLCV / liquidity charts | any Scry dossier | Birdeye, Vybe |
| Ranked “smart money” leaderboards | hot/persistent cohorts as a ranking truth | Nansen-style rankers |
| Cross-chain EVM wallet DD | Scry is Solana-indexed | EVM intel providers |
| Guaranteed rug / buy-sell verdict | Scry never returns verdicts | caller-owned policy |
| Live uncached full-chain crawl | DB-backed evidence with coverage gaps | your own RPC indexer |

## Spend-aware ladder (profit + reliability)

1. **Free** — `coverage/{address}`, `products.json`, `workflows.json`, intent pages.
2. **$0.001** — `quick-flag` for bulk/unknown wallets; stop if unsupported or quarantined.
3. **$0.01–$0.05** — `bundler-check`, `lineage`, or `forensics` only when the caller job needs that object.
4. **$0.30–$0.39** — launch dossier / deployer only after mint preflight or creator address is known.
5. Re-evaluate after every step. A higher price never implies new underlying coverage.
6. Prefer pairwise `connection` over buying two full dossiers to test a link.
7. Prefer path-param canonical routes (`/x402/wallet/{address}/lineage`) over marketplace aliases.

## Payment contract

- Protocol: **x402 v2** `exact` USDC
- Header: **`PAYMENT-SIGNATURE`** only (do not also send legacy `X-PAYMENT`)
- Networks: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, `eip155:8453`
- Facilitator: Coinbase CDP (`https://api.cdp.coinbase.com/platform/v2/x402`)
- Preferred client: `npx awal@2.8.2 x402 details <url> --json` then `pay … --max-amount … --json`
- Preserve `extensions.bazaar` and URL-only `resource` from the challenge
- Fresh payment payload per request (replay fails)

## Honesty / quality gates

- Trust **per-response** coverage, freshness, and confidence — not aggregate marketing.
- Aggregate readiness may be `crawl_ready_visibility_only`; paid responses remain authoritative.
- Partial results are reported as partial. Deny-before-pay when a product is not purchasable.
- Not financial advice. Caller owns monitoring / classification policy.

## Human GTM (separate from x402)

Planet Solana entitlements and manual dossier intake (not a substitute for paid x402 routes):

- Offers: `GET /api/planet/offers`
- Intake: `GET|POST /api/planet/intake`
