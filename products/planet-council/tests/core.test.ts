import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canRunCheck, PLANS } from "../src/billing/plans.js";
import { planForSolAmount, matchSolActivation } from "../src/billing/payments.js";
import { JsonStore } from "../src/billing/store.js";
import { isSolanaAddress, clampText, escapeHtml } from "../src/lib/solana.js";
import { COUNCIL_SYSTEM_PROMPT } from "../src/brief/prompts.js";
import { formatTelegramBrief, formatUnavailable } from "../src/brief/format.js";
import { buildEdgeCard } from "../src/brief/edge-card.js";
import {
  fetchWalletEvidence,
  selectWalletDeepRoutes,
  selectMintDeepRoutes,
} from "../src/scry/client.js";
import { loadConfig, configuredModels } from "../src/config.js";
import { selectModels, runCouncil } from "../src/brief/council.js";

test("plans: free daily cap blocks with upgrade hint", () => {
  const blocked = canRunCheck({
    plan: "free",
    checksUsedToday: 3,
    checksUsedMonth: 3,
    freeChecksPerDay: 3,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.reason, /Plus/);
  const ok = canRunCheck({
    plan: "free",
    checksUsedToday: 2,
    checksUsedMonth: 2,
    freeChecksPerDay: 3,
  });
  assert.equal(ok.ok, true);
});

test("plans: plus monthly cap + watchlist entitlements", () => {
  assert.equal(PLANS.plus.monthlyCap, 50);
  assert.equal(PLANS.plus.watchlistCap, 10);
  assert.equal(PLANS.pro.watchlistCap, 50);
  assert.equal(PLANS.pro.deployerAllowed, true);
  const blocked = canRunCheck({
    plan: "plus",
    checksUsedToday: 0,
    checksUsedMonth: 50,
    freeChecksPerDay: 3,
  });
  assert.equal(blocked.ok, false);
});

test("payments: sol amount mapping still works (billing redesign separate)", () => {
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

test("store: payment replay blocked + watchlist caps", () => {
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
  const denied = store.addWatch("free-user", "Abc1111111111111111111111111111111111111111", 0);
  assert.equal(denied.ok, false);
  const ok = store.addWatch("1", "Abc1111111111111111111111111111111111111111", 10);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.watchlist.length, 1);
});

test("store: scan cache dedup", () => {
  const dir = mkdtempSync(join(tmpdir(), "planet-council-"));
  const store = new JsonStore(join(dir, "db.json"));
  store.putCachedBrief("wallet:x:shallow", "brief");
  assert.equal(store.getCachedBrief("wallet:x:shallow", 120), "brief");
  assert.equal(store.getCachedBrief("wallet:x:shallow", 0), null);
});

test("solana address + clamp + html escape", () => {
  assert.equal(
    isSolanaAddress("PayTo111111111111111111111111111111111111111"),
    true,
  );
  assert.equal(isSolanaAddress("nope"), false);
  assert.ok(clampText("abcdefghij", 8).includes("…"));
  assert.equal(escapeHtml("<b>&"), "&lt;b&gt;&amp;");
});

test("prompt boundary forbids trade calls", () => {
  assert.match(COUNCIL_SYSTEM_PROMPT, /Never give buy\/sell\/hold/i);
  assert.match(COUNCIL_SYSTEM_PROMPT, /evidence-only/i);
});

test("edge card extracts quarantine + bundler + lineage", () => {
  const card = buildEdgeCard({
    target: "Abc1111111111111111111111111111111111111111",
    kind: "wallet",
    depth: "deep",
    fetchedAt: "2026-09-23T00:00:00Z",
    synthetic: false,
    ok: true,
    routes: [
      {
        route: "/x402/wallet/Abc/quick-flag",
        ok: true,
        priceUsd: 0.001,
        body: {
          address: "Abc1111111111111111111111111111111111111111",
          quarantine: { is_known_service: true, label: "Exchange Hot" },
          bundler_hint: { observed: true },
          coverage: { status: "partial", missing_fields: ["holdings"] },
          confidence_score: 0.7,
          as_of: "2026-09-23T00:00:00Z",
        },
      },
      {
        route: "/x402/wallet/Abc/lineage",
        ok: true,
        priceUsd: 0.03,
        body: {
          address: "Abc1111111111111111111111111111111111111111",
          hop_count: 2,
          upstream: [{ address: "Funder111111111111111111111111111111111111" }],
        },
      },
    ],
  });
  assert.equal(card.usable, true);
  assert.ok(card.signals.some((s) => s.key === "quarantine" && s.severity === "material"));
  assert.ok(card.signals.some((s) => s.key === "bundler"));
  assert.ok(card.signals.some((s) => s.key === "lineage"));
  assert.ok(card.estimatedSpendUsd >= 0.03);
});

test("format separates edge card, evidence, council; escapes html", () => {
  const text = formatTelegramBrief({
    maxChars: 4000,
    bundle: {
      target: "Abc<script>",
      kind: "wallet",
      depth: "shallow",
      fetchedAt: "2026-09-15T00:00:00Z",
      synthetic: false,
      ok: true,
      routes: [
        {
          route: "/x402/wallet/Abc/quick-flag",
          ok: true,
          priceUsd: 0.001,
          body: {
            address: "Abc",
            coverage: { status: "partial" },
            confidence_score: 0.5,
            caveat: "Evidence only",
          },
        },
      ],
    },
    replies: [
      {
        model: "claude",
        ok: true,
        text: "## Council reading\nLooks incomplete <script>",
      },
    ],
  });
  assert.match(text, /Edge card/);
  assert.match(text, /Council reading/);
  assert.match(text, /not financial advice/i);
  assert.doesNotMatch(text, /<script>/);
  assert.match(text, /&lt;script&gt;/);
});

test("formatUnavailable does not invent success", () => {
  const text = formatUnavailable("missing credentials");
  assert.match(text, /Unavailable/);
  assert.match(text, /No usage charged/);
});

test("config fail-closed default + configured models", () => {
  const cfg = loadConfig({ SCRY_MOCK: undefined } as any);
  assert.equal(cfg.SCRY_MOCK, false);
  const withKeys = loadConfig({
    SCRY_MOCK: "0",
    ANTHROPIC_API_KEY: "x",
    OPENAI_API_KEY: "y",
  } as any);
  assert.deepEqual(configuredModels(withKeys), ["claude", "gpt"]);
  assert.deepEqual(selectModels(withKeys, false), ["claude"]);
  assert.deepEqual(selectModels(withKeys, true), ["claude", "gpt"]);
});

test("scry client: mock only when SCRY_MOCK=1; else fail-closed", async () => {
  const live = loadConfig({ SCRY_MOCK: "0", SCRY_INTERNAL_TOKEN: undefined } as any);
  const denied = await fetchWalletEvidence(live, "Abc1111111111111111111111111111111111111111", false);
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.reason, /Refusing silent mock/);

  const demo = loadConfig({ SCRY_MOCK: "1" } as any);
  const ok = await fetchWalletEvidence(demo, "Abc1111111111111111111111111111111111111111", true);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.bundle.synthetic, true);
    assert.ok(ok.bundle.routes.length >= 2);
  }
});

test("ladder: bundler hint adds bundler-check; pro adds full-context", () => {
  const quick = {
    route: "/x402/wallet/A/quick-flag",
    ok: true,
    priceUsd: 0.001,
    body: { bundler_hint: { observed: true }, supported: true },
  };
  const paths = selectWalletDeepRoutes("A", quick, { pro: true });
  assert.ok(paths.some((p) => p.includes("bundler-check")));
  assert.ok(paths.some((p) => p.includes("forensics")));
  assert.ok(paths.some((p) => p.includes("lineage")));
  assert.ok(paths.some((p) => p.includes("full-context-pro")));

  const mintPaths = selectMintDeepRoutes("Mint111111111111111111111111111111111111111", {
    route: "/risk",
    ok: true,
    priceUsd: 0.03,
    body: { creator_wallet: "Creator11111111111111111111111111111111111" },
  });
  assert.ok(mintPaths.some((p) => p.includes("launch-dossier")));
  assert.ok(mintPaths.some((p) => p.includes("deployer-summary")));
});

test("council: demo mode returns labeled synthetic reading", async () => {
  const cfg = loadConfig({ SCRY_MOCK: "1" } as any);
  const evidence = await fetchWalletEvidence(
    cfg,
    "Abc1111111111111111111111111111111111111111",
    false,
  );
  assert.equal(evidence.ok, true);
  if (!evidence.ok) return;
  const council = await runCouncil({
    cfg,
    bundle: evidence.bundle,
    multiModel: false,
  });
  assert.equal(council.ok, true);
  if (council.ok) {
    assert.match(council.replies[0].text, /Synthetic demo/i);
  }
});

test("council: no models in live mode fails closed", async () => {
  const cfg = loadConfig({ SCRY_MOCK: "0", SCRY_INTERNAL_TOKEN: "tok" } as any);
  const council = await runCouncil({
    cfg,
    bundle: {
      target: "Abc",
      kind: "wallet",
      depth: "shallow",
      fetchedAt: "2026-09-23T00:00:00Z",
      synthetic: false,
      ok: true,
      routes: [
        {
          route: "/x402/wallet/Abc/quick-flag",
          ok: true,
          priceUsd: 0.001,
          body: { address: "Abc", coverage: { status: "ok" }, confidence_score: 0.9 },
        },
      ],
    },
    multiModel: true,
  });
  assert.equal(council.ok, false);
  if (!council.ok) assert.equal(council.reason, "no_models");
});
