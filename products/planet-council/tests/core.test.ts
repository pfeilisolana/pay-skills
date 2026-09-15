import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canRunCheck, PLANS } from "../src/billing/plans.js";
import { planForSolAmount, matchSolActivation } from "../src/billing/payments.js";
import { JsonStore } from "../src/billing/store.js";
import { isSolanaAddress, clampText } from "../src/lib/solana.js";
import { COUNCIL_SYSTEM_PROMPT } from "../src/brief/prompts.js";
import { formatTelegramBrief } from "../src/brief/format.js";

test("plans: free daily cap blocks", () => {
  const blocked = canRunCheck({
    plan: "free",
    checksUsedToday: 3,
    checksUsedMonth: 3,
    freeChecksPerDay: 3,
  });
  assert.equal(blocked.ok, false);
  const ok = canRunCheck({
    plan: "free",
    checksUsedToday: 2,
    checksUsedMonth: 2,
    freeChecksPerDay: 3,
  });
  assert.equal(ok.ok, true);
});

test("plans: plus monthly cap", () => {
  assert.equal(PLANS.plus.monthlyCap, 50);
  const blocked = canRunCheck({
    plan: "plus",
    checksUsedToday: 0,
    checksUsedMonth: 50,
    freeChecksPerDay: 3,
  });
  assert.equal(blocked.ok, false);
});

test("payments: sol amount mapping", () => {
  const cfg = {
    PLANET_PLUS_AMOUNT_SOL: 0.08,
    PLANET_PRO_AMOUNT_SOL: 0.25,
    PLANET_FOUNDER_AMOUNT_SOL: 1.0,
  } as const;
  assert.equal(planForSolAmount(0.08, cfg), "plus");
  assert.equal(planForSolAmount(0.25, cfg), "pro");
  assert.equal(planForSolAmount(1.0, cfg), "founder");
  assert.equal(planForSolAmount(0.01, cfg), null);
});

test("payments: match destination lamports", () => {
  const payTo = "PayTo111111111111111111111111111111111111111";
  const tx = {
    meta: {
      err: null,
      preBalances: [2_000_000_000, 0],
      postBalances: [1_920_000_000, 80_000_000],
    },
    transaction: {
      message: {
        accountKeys: ["Sender1111111111111111111111111111111111111", payTo],
      },
    },
  };
  const match = matchSolActivation(tx, {
    PLANET_PAYMENT_ADDRESS: payTo,
    PLANET_PLUS_AMOUNT_SOL: 0.08,
    PLANET_PRO_AMOUNT_SOL: 0.25,
    PLANET_FOUNDER_AMOUNT_SOL: 1.0,
  });
  assert.ok(match);
  assert.equal(match?.plan, "plus");
});

test("store: payment replay blocked", () => {
  const dir = mkdtempSync(join(tmpdir(), "planet-council-"));
  const store = new JsonStore(join(dir, "db.json"));
  store.activate({
    telegramUserId: "1",
    plan: "plus",
    txSig: "sigA",
  });
  assert.throws(() =>
    store.activate({
      telegramUserId: "2",
      plan: "plus",
      txSig: "sigA",
    }),
  );
});

test("solana address + clamp", () => {
  assert.equal(
    isSolanaAddress("PayTo111111111111111111111111111111111111111"),
    true,
  );
  assert.equal(isSolanaAddress("nope"), false);
  assert.ok(clampText("abcdefghij", 8).includes("…"));
});

test("prompt boundary forbids trade calls", () => {
  assert.match(COUNCIL_SYSTEM_PROMPT, /Never give buy\/sell\/hold/i);
  assert.match(COUNCIL_SYSTEM_PROMPT, /evidence-only/i);
});

test("format separates evidence and council", () => {
  const text = formatTelegramBrief({
    maxChars: 2000,
    bundle: {
      target: "Abc",
      kind: "wallet",
      depth: "shallow",
      fetchedAt: "2026-09-15T00:00:00Z",
      routes: [{ route: "/x402/wallet/Abc/quick-flag", ok: true, body: {} }],
    },
    replies: [
      {
        model: "claude",
        ok: true,
        text: "## Council reading\nLooks incomplete.",
      },
    ],
  });
  assert.match(text, /Evidence \(Scry\)/);
  assert.match(text, /Council reading \(AI\)/);
  assert.match(text, /not financial advice/i);
});
