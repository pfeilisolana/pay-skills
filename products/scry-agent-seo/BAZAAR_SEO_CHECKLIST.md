# Bazaar SEO checklist (profit-minded)

Use after any Scry product or copy change.

## Before ship

- [ ] Every paid route `PaymentRequired.resource.description` is non-empty and ≤500 chars
- [ ] Description leads with **buyer job + Solana object** (wallet / mint / cohort)
- [ ] Description includes **not-for** vs price/smart-money clones
- [ ] Description stays **evidence-only** (no buy/sell)
- [ ] `extensions.bazaar.info.input` has method + params with examples
- [ ] `extensions.bazaar.info.output.example` matches real shape
- [ ] English-only in primary search / bazaar copy

## After ship

- [ ] Settle one mainnet canary on `quick-flag` ($0.001)
- [ ] Settle one canary on each new hero route once
- [ ] CDP search: Scry URL in top results for each readiness `indexing_terms` entry
- [ ] `pay catalog check providers/scry/wallet-intel/PAY.md` green
- [ ] `llms.txt` / `agents.txt` Compete line still accurate

## Ranking reality

CDP ranks on **retrieval relevance + listing quality + economic usage**.
Empty descriptions → zero metadata quality. No settlements → weak ranking.
Free crawl surfaces help agents that already know Scry; **Bazaar search** needs
descriptions + pays.
