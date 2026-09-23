# Scry agent SEO (x402 discovery)

Playbook for making **autonomous agents** find, choose, and **pay** Scry via x402 —
with margin and conversion in mind. Lives in `pay-skills` so reviewers can iterate
without touching the Scry API release lane (Codex).

## Goal

Maximize **confirmed settled x402 calls** on high-intent Solana evidence jobs
(lineage, bundler, forensics, mint/Pump.fun, deployer) while:

1. Winning Bazaar / pay-skills / MCP / skill discovery  
2. Routing agents to the **cheapest sufficient** SKU first (higher conversion, less chargeback-like waste)  
3. Differentiating vs price/smart-money clones  
4. Keeping Scry **evidence-only**

## Where agents actually discover sellers

| Channel | What ranks / matches | Scry surface |
|---|---|---|
| Coinbase CDP Bazaar search | `description` + schemas + settled usage | Live `402` `PaymentRequired` + facilitator index |
| pay-skills / `pay` MCP | `PAY.md` frontmatter + OpenAPI summaries | `providers/scry/wallet-intel/` |
| Crawlers / LLM browsers | `llms.txt`, `agents.txt`, `.well-known/*`, HTML hubs | `scry.solanahub.de` + `solanahub.de/en/scry/*` |
| MCP installs | server card description + tool names | `scry-mcp` |
| Agent skills | `SKILL.md` job routing | `pfeilisolana/scry-skills` |

## P0 — Bazaar metadata (Codex / Scry API)

**Observed 2026-09-23:** searching `scry.solanahub.de` returns Scry routes, but natural
queries like `solana wallet funding lineage` often rank **EVM wallet** sellers with
rich 250–370 character descriptions. Scry’s live `PAYMENT-REQUIRED` payload has:

```json
"resource": { "url": "https://scry.solanahub.de/x402/wallet/.../lineage" }
```

…and **no `resource.description`**. CDP curation docs: bare endpoint names score
**zero** on metadata quality; keep description **≤ 500 characters**.

### Fix (API lane)

For every paid route’s `PaymentRequired`:

1. Set `resource.description` to a **buyer-intent sentence** (when to call + object + not-for), ≤500 chars.  
2. Keep `extensions.bazaar.info.input` complete (method, pathParams/queryParams with examples).  
3. Keep `extensions.bazaar.info.output.example` realistic.  
4. Optionally set provider metadata (`name`, tags, icon) per bazaar extension if supported by your stack.  
5. After deploy: settle **one real mainnet micropayment** per hero route (`quick-flag` $0.001 first) so CDP indexes/ refreshes quality signals.

### Example description (lineage, ~280 chars)

> Solana wallet funding lineage / source-of-funds evidence via x402: hop-depth upstream funders, amounts, signatures, coverage and freshness. Use when one wallet’s funder path is the object. Not for spot price, OHLCV, or smart-money rankings. Evidence only — no trading verdict.

Hero routes to prioritize descriptions for:

| Route | Primary phrases |
|---|---|
| `/wallet/{address}/lineage` | funding lineage, source of funds, upstream funder |
| `/wallet/{address}/bundler-check` | bundler, private routing, Jito tip service |
| `/wallet/{address}/forensics` | wallet evidence dossier, X/Twitter handle |
| `/wallet/{address}/quick-flag` | sub-cent wallet check, micropayment test |
| `/mint/{mint}/risk` | mint risk preflight, memecoin holder concentration |
| `/solana/pumpfun-risk-protection` | pumpfun rugger, serial deployer cohort |
| `/solana/agent-intel-brief` | agent orchestrator wallet intelligence |

## P1 — pay-skills listing (this repo)

`providers/scry/wallet-intel/PAY.md` is the registry copy for `pay` CLI / MCP agents.

Rules that convert:

- **Frontmatter** within length limits; lead with x402 + Solana + no API key.  
- **`use_case`** states when **and** when-not (vs Birdeye/Nansen).  
- **Category `data`** — evidence broker, not market-data finance clone.  
- **Buyer-intent table** → first paid route + price.  
- **Free-first URLs** before any pay instruction.  
- **Spend ladder** that stops early (protects user wallet + Scry reputation).  
- English-primary phrases only in search/metadata (DE copy stays on human pages).

Validate:

```bash
pay catalog check providers/scry/wallet-intel/PAY.md
pay catalog check . --no-probe
```

## P2 — Crawl / LLM SEO (already strong; keep consistent)

Keep these in sync when products change:

- `llms.txt` / `agents.txt` Compete line (lineage depth ≠ smart money)  
- `x402/index.json` three primary jobs  
- `x402/workflows.json` stop/escalate rules  
- `solanahub.de/scry-buyer-intent-index.json` phrase → route map  
- Use-case HTML `#agent-route-contract` anchors  

Do **not** mix German into primary buyer-search terms.

## P3 — Install surfaces

| Surface | Conversion tip |
|---|---|
| MCP | Tool descriptions = same buyer intents as Bazaar descriptions |
| Skill | First lines: job → route → price → free precheck |
| Planet Council | Human GTM; link agents to x402 catalog, don’t replace it |

## Profit mechanics

```text
Discover (free) → cheapest canary ($0.001) → justified escalate ($0.01–0.05)
  → rare deep SKUs ($0.30–0.39) → optional human dossier ($249)
```

- **Volume:** win “lineage / bundler / dossier” queries with descriptions + usage.  
- **Margin:** teach stop-when in workflows so agents don’t overbuy once and churn.  
- **Trust:** deny-before-pay + honest coverage beats fake “always green” clones.  
- **Moat:** hop-depth funder evidence + quarantine — say it in every discovery blurb.

## Metrics to watch

1. Bazaar search: Scry in top-5 for each indexing term in readiness JSON  
2. `confirmed_external` settled payments (not facilitator residual alone)  
3. pay-skills catalog probe green for `scry/wallet-intel`  
4. Mix: % of sessions that stop at quick-flag vs escalate (healthy ladder)  
5. MCP/skill install → first paid call conversion  

## Non-goals

- Do not put buy/sell language into Scry discovery copy.  
- Do not claim global Solana coverage — cohort is indexed memecoin-trader scope.  
- Do not treat pay-skills listing success as Bazaar ranking proof (separate indexes).  

## Handoff

- **This PR / pay-skills:** listing + playbook (agent-facing registry SEO).  
- **Codex / Scry API:** P0 `resource.description` on 402 challenges + settled canary pays.  
- **Planet Council:** human briefs/intake — orthogonal cash path.
