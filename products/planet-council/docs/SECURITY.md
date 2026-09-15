# Security baseline

## Non-negotiables

1. **No user custody** — bot never holds user trading keys or deposits for swaps.  
2. **Scry evidence purity** — do not write model verdicts back into Scry responses or caches labeled as evidence.  
3. **Verify before unlock** — entitlements flip only after confirmed payment / admin grant.  
4. **Secrets server-side** — Telegram, LLM, Helius, Scry internal tokens only in env.  
5. **Replay protection** — each payment signature activates at most once.  
6. **Prompt injection** — treat token names, metadata, memos, and wallet-linked social text as untrusted.  
7. **Rate limits** — per Telegram user and per target address/mint.  
8. **No financial-advice framing** — disclaimers on every brief; no “buy/sell now”.  

## Payment verification

`/activate <tx_sig>`:

- fetch tx via Helius or public RPC  
- require success + transfer to `PLANET_PAYMENT_ADDRESS`  
- amount ≥ selected plan  
- memo/reference matches plan id when present  
- store `tx_sig` uniquely  

## Abuse

- Cap free tier hard (3/day)  
- Exponential backoff on scrape-like bursts  
- Strip HTML / markdown exploits from model output before Telegram send  
- Log grants and denials with telegram id hash  

## Incident notes for reviewers

If a model outputs a definitive “this is a rug, sell”, that is a **prompt/policy bug**, not a Scry bug. Fix the council layer; do not change Scry’s evidence contract to compensate.
