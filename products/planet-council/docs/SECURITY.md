# Security baseline

## Non-negotiables

1. **No user custody** — bot never holds user trading keys or deposits for swaps.  
2. **Scry evidence purity** — do not write model verdicts back into Scry responses or caches labeled as evidence.  
3. **Verify before unlock** — entitlements flip only after confirmed payment / admin grant.  
4. **Secrets server-side** — Telegram, LLM, Helius, Scry internal tokens only in env.  
5. **Replay protection** — each payment signature activates at most once (when activation is re-enabled).  
6. **Prompt injection** — treat token names, metadata, memos, and wallet-linked social text as untrusted.  
7. **Rate limits** — per Telegram user and scan dedup window.  
8. **No financial-advice framing** — disclaimers on every brief; no “buy/sell now”.  
9. **Fail-closed evidence** — never silently substitute mock Scry data for live users.  
10. **Safe Telegram HTML** — escape model and evidence text before `parse_mode=HTML`.  

## Payment verification (contained)

`/activate <tx_sig>` is **disabled** in this private alpha:

- Prior defect: first claimant of an unrelated public transfer to the payment address could unlock.  
- Store concurrency / race on payment claim is not fully hardened.  
- Containment: admin `/grant` only until Stars-compatible or repaired verify-before-unlock ships.  

Helpers in `billing/payments.ts` remain for unit tests and a future redesign — they are not reachable from the bot command.

## Abuse

- Cap free tier hard (3/day)  
- Dedup identical scans for `SCAN_DEDUP_SECONDS`  
- Escape HTML from model output before Telegram send  
- Bound target length, model output, and brief size  
- Log grants with telegram id  

## Incident notes for reviewers

If a model outputs a definitive “this is a rug, sell”, that is a **prompt/policy bug**, not a Scry bug. Fix the council layer; do not change Scry’s evidence contract to compensate.
