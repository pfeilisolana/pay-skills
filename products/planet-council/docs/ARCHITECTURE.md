# Architecture

```text
Telegram user
    │
    ▼
planet-council bot (this package)
    ├── entitlements (SQLite/Postgres) ← /activate tx verify OR Planet intake
    ├── scry client ───────────────────► scry.solanahub.de (evidence)
    │                                      optional: HELIUS enrichment
    └── council orchestrator
            ├── Anthropic Claude (risk / gaps)
            ├── OpenAI GPT (structured DD card)
            └── xAI Grok (narrative / dissent)
                    │
                    ▼
            Telegram brief (Evidence + Council reading + Dissent)
```

## Scry route ladder

### Wallet input

1. `GET /x402/wallet/{address}/quick-flag` ($0.001)  
2. If deep entitled → `forensics` + `lineage` (+ `bundler-check` when hinted)  
3. Optional `full-context-pro` for Pro/Founder  

### Mint input

1. `GET /x402/mint/{mint}/risk` ($0.03)  
2. If deep entitled → `pumpfun/launch-dossier` when Pump-like  
3. Optional deployer path via dossier creator address → `deployer-summary`  

### Always free first

- `GET /x402/products.json`  
- `GET /api/planet/offers`  

## Entitlement source of truth

Planet offers catalog: `https://scry.solanahub.de/api/planet/offers`

| Offer | Limits (from catalog) | Council behavior |
|---|---|---|
| Free | 3 checks/day | shallow evidence + single-model brief |
| Plus | 50 checks/month | deep evidence + 3-model council |
| Pro | 250 checks/month | deep + fuller ladder + longer briefs |
| Founder | founder cohort | Pro-equivalent + priority |

While `checkout_status=manual_intake_until_checkout_configured`, this bot supports:

1. Manual grant via `PLANET_ADMIN_TELEGRAM_IDS`  
2. On-chain `/activate <signature>` against `PLANET_PAYMENT_ADDRESS`  
3. Optional forward to Planet intake API  

## Interpretation contract

Council prompts receive **only** Scry JSON (and optional Helius summary).  
Models must:

- cite evidence fields when making claims  
- mark coverage gaps explicitly  
- refuse trading instructions  
- output dissent when models disagree  

Telegram formatter renders two blocks:

1. **Evidence (Scry)**  
2. **Council reading (AI)**  
