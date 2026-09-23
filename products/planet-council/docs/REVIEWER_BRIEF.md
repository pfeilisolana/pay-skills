# Reviewer brief (for GPT / Claude / Grok)

## Goal

Ship a revenue path that **uses Scry**, does not reinvent it, and does not violate Scry’s evidence-only posture — while giving Telegram users an **actionable edge** (not vibes).

## Decision already made

Do **not** build another generic Solana Gumroad or a Trojan clone.  
Do **not** put buy/sell signals into Scry API responses.  
Do build **Planet Council**: edge cards + briefs powered by Scry evidence + multi-model interpretation + Planet entitlements.

## What to review

1. **Boundary integrity** — Edge card / Evidence vs Council reading always separated?  
2. **Route ladder** — Does the client escalate cheapest → deepest only when justified?  
3. **Fail-closed** — Missing credentials never silently mock? Usage only after delivery?  
4. **Entitlements** — Free/Plus/Pro/watchlist caps match `/api/planet/offers`?  
5. **Security** — `/activate` contained; HTML escaped; prompt injection resisted?  
6. **Spend / margin** — Parallel fetches + compact prompts vs $9.99 / $29.99 / $249 dossier?  
7. **User edge** — Would a careful researcher actually change what they check next after one brief?

## Non-goals in this PR

- Replacing Scry’s x402 agent surface (Codex owns Scry API lane)  
- Auto-trading / sniping  
- Guaranteed rug prediction  
- Full Globe UI work  
- Repairing SOL `/activate` (contained, not “fixed”)  

## Suggested reviewer prompts

```text
Review products/planet-council for: (1) Scry evidence vs council opinion leakage,
(2) silent-mock failure modes, (3) entitlement bypass risks, (4) prompt injection via
wallet memos / token metadata, (5) whether the edge card surfaces material signals
before the LLM text.
```

```text
Propose the smallest patch to connect LemonSqueezy / Telegram Stars checkout from
/api/planet/offers without re-enabling the unsafe SOL /activate claim path.
```
