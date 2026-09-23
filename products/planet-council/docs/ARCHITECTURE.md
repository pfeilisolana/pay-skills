# Architecture

```text
Telegram user
    │
    ▼
planet-council bot (this package)
    ├── entitlements + watchlist (JSON store)
    ├── scry client ── spend-aware ladder ──► scry.solanahub.de
    │         │
    │         ▼
    │   deterministic edge card (no LLM)
    │
    └── council orchestrator (parallel)
            ├── Anthropic Claude
            ├── OpenAI GPT
            └── xAI Grok
                    │
                    ▼
            Telegram brief
            (Edge card · Routes · Council · Dissent · Upsell)
```

## Scry route ladder

### Wallet input

1. `GET /x402/wallet/{address}/quick-flag` ($0.001) — always  
2. Stop early when unsupported (non-Pro)  
3. If deep entitled → parallel:
   - `forensics` + `lineage` (always on deep)
   - `bundler-check` when hinted or Pro
   - `full-context-pro` for Pro/Founder only  

### Mint input

1. `GET /x402/mint/{mint}/risk` ($0.03)  
2. If deep entitled → parallel:
   - `pumpfun/launch-dossier`
   - `deployer-summary` when creator wallet present  

### Pair / deployer / digest

- `/connect` → `GET /x402/wallet/connection`  
- `/deployer` → `GET /x402/deployer-summary`  
- `/digest` → `watchlist-snapshot` or parallel quick-flags  

## Edge card contract

Extracted **only** from successful Scry JSON:

- quarantine / bundler / identity / lineage / cluster  
- mint risk label, holder concentration, creator, rug flags  
- coverage status, missing fields, confidence, as_of  
- estimated Scry spend for this pull  
- suggested next evidence steps (not trades)  

LLM briefs must not contradict the edge card’s facts.

## Entitlement source of truth

Planet offers catalog: `https://scry.solanahub.de/api/planet/offers`

| Offer | Limits | Council behavior |
|---|---|---|
| Free | 3 checks/day | shallow edge card + single-model |
| Plus | 50/mo · watch 10 | deep ladder + 3-model + digest |
| Pro | 250/mo · watch 50 | deep + fuller ladder + deployer |
| Founder | founder cohort | Pro-equivalent |

While checkout is manual intake:

1. Admin `/grant` via `PLANET_ADMIN_TELEGRAM_IDS`  
2. SOL `/activate` **disabled** (containment; payment replay defect)  
3. Optional forward to Planet intake / future Stars checkout  

## Fail-closed rules

- `SCRY_MOCK` defaults to off. Missing live token → unavailable, never silent mock.  
- Wrong-subject responses rejected.  
- No models configured in live mode → unavailable (edge card may still render if evidence ok).  
- Usage increments only after successful Telegram send.  
- Scan dedup cache avoids double-spend on accidental re-taps.  
