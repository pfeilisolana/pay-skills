# Reviewer brief (for GPT / Claude / Grok)

## Goal

Ship a 30-day revenue path that **uses Scry**, does not reinvent it, and does not violate Scry’s evidence-only posture.

## Decision already made

Do **not** build another generic Solana Gumroad or a Trojan clone.  
Do **not** put buy/sell signals into Scry API responses.  
Do build **Planet Council**: Telegram briefs powered by Scry evidence + multi-model interpretation + Planet entitlements.

## What to review

1. **Boundary integrity** — Is evidence vs interpretation always separated in prompts and Telegram output?  
2. **Route ladder** — Does the Scry client escalate cheapest → deepest correctly?  
3. **Entitlements** — Do free limits match `/api/planet/offers`? Is Plus/Pro gate coherent while LemonSqueezy IDs are unset?  
4. **Security** — No user custody; payment verify-before-unlock; secrets server-side; no verdict laundering into Scry.  
5. **Spend** — LLM + Scry costs vs $9.99 / $29.99 Planet pricing.  
6. **Missing week-1 blockers** — What must Michael configure before mainnet users?

## Non-goals in this PR

- Replacing Scry’s x402 agent surface  
- Auto-trading / sniping  
- Guaranteed rug prediction  
- Full Globe UI work  

## Suggested reviewer prompts

```text
Review products/planet-council for: (1) Scry evidence vs council opinion leakage,
(2) entitlement bypass risks, (3) payment replay, (4) prompt injection via wallet
memos / token metadata, (5) whether the 4-week plan is realistic given Planet
checkout is still manual intake.
```

```text
Propose the smallest patch to connect LemonSqueezy product IDs from
/api/planet/offers without breaking the SOL/USDC /activate flow.
```
