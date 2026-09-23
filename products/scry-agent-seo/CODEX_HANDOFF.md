# Codex handoff — Bazaar description gap (P0)

## Problem

CDP Bazaar hybrid search ranks sellers with **natural-language `description`** fields.
As of 2026-09-23, Scry hero routes appear when querying the domain
`scry.solanahub.de`, but queries such as:

- `solana wallet funding lineage`
- `solana wallet forensics`
- `pumpfun rugger wallet`

…surface unrelated EVM wallet APIs with 250–370 character descriptions.

Live Scry `PAYMENT-REQUIRED` (base64) for lineage decodes to a `resource` object
that contains **only** `url` — no `description`. Per CDP “Get discovered” docs,
placeholder / missing descriptions score **zero** on metadata quality (max 500 chars).

## Requested API change (Scry lane)

On every paid x402 v2 challenge:

1. Populate `resource.description` (≤500 chars) with buyer-intent copy.  
2. Keep bazaar `info.input` / `output.example` complete.  
3. Re-settle one mainnet USDC canary on `GET /x402/wallet/{address}/quick-flag`
   after deploy so facilitator re-indexes.

### Suggested description templates

**lineage**

> Solana wallet funding lineage / source-of-funds evidence via x402: hop-depth upstream funders, amounts, signatures, coverage and freshness. Use when one wallet’s funder path is the object. Not for spot price, OHLCV, or smart-money rankings. Evidence only — no trading verdict.

**bundler-check**

> Solana wallet bundler / private-routing evidence via x402: tip-service and private-path hints (e.g. Jito-class patterns), service quarantine context, coverage and freshness. Use before a deeper dossier when routing behavior is the question. Evidence only.

**forensics**

> Solana single-wallet evidence dossier via x402: identity/X-handle when covered, cluster peers, funding context, activity, coverage and freshness. Use for one wallet in depth. Not a cohort screener or trading recommendation.

**quick-flag**

> Sub-cent ($0.001) Solana wallet prefilter via x402: service/router quarantine, bundler hint, identity/freshness badges. Lowest-cost catalog entry and micropayment canary. Not a full dossier.

**mint risk**

> Solana mint risk preflight via x402: holder-concentration proxy, creator context when covered, coverage and freshness. Use for one mint before launch-dossier spend. Not a rug verdict or price feed.

**pumpfun-risk-protection**

> Pump.fun wallet-cohort evidence via x402: rugger / serial-deployer / service-router candidates with coverage metadata. Use for cohort preflight, not one-mint dossiers or one-wallet forensics.

**agent-intel-brief**

> Agent-orchestrator Solana wallet-intelligence brief via x402: 24h/7d context, cutoffs, coverage gaps, and next evidence depth. Use to choose the next Scry route — not as a substitute for a known-wallet dossier.

## Out of scope for Codex

- pay-skills `PAY.md` rewrite (handled in this repo)  
- Planet Council Telegram product  

## Acceptance

- [ ] Decode any hero-route `PAYMENT-REQUIRED` → `resource.description` non-empty, ≤500 chars  
- [ ] CDP search for `solana wallet funding lineage` returns a `scry.solanahub.de` lineage URL in top results within indexing lag  
- [ ] Evidence-only posture preserved (no buy/sell language)  
