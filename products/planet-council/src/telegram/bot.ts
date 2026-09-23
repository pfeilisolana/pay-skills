import { Bot, InlineKeyboard } from "grammy";
import type { Config } from "../config.js";
import { JsonStore } from "../billing/store.js";
import { PLANS, canRunCheck, type PlanId } from "../billing/plans.js";
import {
  fetchConnectionEvidence,
  fetchDeployerEvidence,
  fetchMintEvidence,
  fetchPlanetOffers,
  fetchWalletEvidence,
  fetchWatchlistSnapshot,
  type EvidenceResult,
} from "../scry/client.js";
import { runCouncil } from "../brief/council.js";
import { formatTelegramBrief, formatUnavailable } from "../brief/format.js";
import { isSolanaAddress } from "../lib/solana.js";

function parsePlan(raw?: string): PlanId | null {
  const v = (raw ?? "").toLowerCase();
  if (v === "free" || v === "plus" || v === "pro" || v === "founder") return v;
  return null;
}

export function createBot(cfg: Config, store: JsonStore) {
  if (!cfg.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required to start the bot");
  }
  const bot = new Bot(cfg.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "<b>Planet Council</b> — Scry evidence edge cards + multi-model reading.",
        "",
        "Get a real edge before you trust a wallet or mint:",
        "• Deterministic <b>edge card</b> (quarantine, bundler, lineage, holders)",
        "• Spend-aware Scry ladder (cheap triage → deep only when needed)",
        "• Optional 3-model council with dissent (Plus/Pro)",
        "• Watchlist digests so you catch freshness changes",
        "",
        "<b>Commands</b>",
        "/scan &lt;wallet_or_mint&gt;",
        "/wallet &lt;address&gt;",
        "/mint &lt;mint&gt;",
        "/connect &lt;walletA&gt; &lt;walletB&gt;  (Plus+)",
        "/deployer &lt;address&gt;  (Pro+)",
        "/watch &lt;address&gt; · /unwatch · /watchlist · /digest",
        "/plans · /usage",
        "",
        "Free = shallow edge card + 1 model.",
        "Plus/Pro = deep ladder + 3-model council + watchlist.",
        "Not financial advice. Scry is evidence-only.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("plans", async (ctx) => {
    const offers = await fetchPlanetOffers(cfg);
    const lines = [
      "<b>Planet plans</b>",
      ...Object.values(PLANS).map(
        (p) =>
          `• <b>${p.label}</b>: $${p.priceUsd} — deep=${p.deepEvidence} multi=${p.multiModel} watch=${p.watchlistCap}`,
      ),
      "",
      "High-stakes reviews: Scry Forensics Dossier (~$249) via Planet intake when coverage is thin.",
      "",
      "Paid unlock for this private alpha: ask an allowlisted admin for <code>/grant</code>.",
      "SOL <code>/activate</code> is disabled (containment — billing redesign is separate).",
      "",
      `<code>${escapeShort(JSON.stringify(offers), 500)}</code>`,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("usage", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    const row = store.getEntitlement(id);
    const plan = PLANS[row.plan];
    await ctx.reply(
      [
        `Plan: ${plan.label}`,
        `Used today: ${row.checksUsedToday}`,
        `Used month: ${row.checksUsedMonth}`,
        `Watchlist: ${row.watchlist.length}/${plan.watchlistCap}`,
        row.expiresAt ? `Expires: ${row.expiresAt}` : "Expires: n/a",
      ].join("\n"),
    );
  });

  bot.command("grant", async (ctx) => {
    const adminId = String(ctx.from?.id ?? "");
    if (!cfg.adminTelegramIds.has(adminId)) {
      await ctx.reply("Not authorized.");
      return;
    }
    const parts = (ctx.message?.text ?? "").split(/\s+/);
    const targetUser = parts[1];
    const plan = parsePlan(parts[2]);
    if (!targetUser || !plan) {
      await ctx.reply("Usage: /grant <telegramUserId> <free|plus|pro|founder>");
      return;
    }
    const row = store.grant(targetUser, plan);
    await ctx.reply(`Granted ${plan} to ${targetUser} until ${row.expiresAt}`);
  });

  bot.command("activate", async (ctx) => {
    await ctx.reply(
      [
        "SOL /activate is disabled for this private alpha.",
        "Billing redesign is separate; this is containment, not a repaired checkout.",
        "Ask an allowlisted admin for /grant unpaid testing access.",
        "Future paid digital goods in Telegram require Stars-compatible checkout.",
      ].join("\n"),
    );
  });

  async function gate(ctx: any): Promise<
    | { ok: true; id: string; plan: (typeof PLANS)[PlanId] }
    | { ok: false }
  > {
    const id = String(ctx.from?.id ?? "");
    const ent = store.getEntitlement(id);
    const check = canRunCheck({
      plan: ent.plan,
      checksUsedToday: ent.checksUsedToday,
      checksUsedMonth: ent.checksUsedMonth,
      freeChecksPerDay: cfg.FREE_CHECKS_PER_DAY,
    });
    if (!check.ok) {
      await ctx.reply(check.reason);
      return { ok: false };
    }
    return { ok: true, id, plan: PLANS[ent.plan] };
  }

  async function deliverEvidence(
    ctx: any,
    id: string,
    plan: (typeof PLANS)[PlanId],
    result: EvidenceResult,
    cacheKey?: string,
  ) {
    if (!result.ok) {
      await ctx.reply(formatUnavailable(result.reason), { parse_mode: "HTML" });
      return;
    }

    const council = await runCouncil({
      cfg,
      bundle: result.bundle,
      multiModel: plan.multiModel,
    });
    if (!council.ok) {
      // Still deliver deterministic edge card when evidence exists — that is the user edge.
      if (result.bundle.ok) {
        const text = formatTelegramBrief({
          bundle: result.bundle,
          replies: council.replies,
          maxChars: cfg.MAX_BRIEF_CHARS,
          planLabel: plan.label,
        });
        try {
          await ctx.reply(text, { parse_mode: "HTML" });
          store.incrementUsage(id);
          if (cacheKey) store.putCachedBrief(cacheKey, text);
        } catch (err: any) {
          await ctx.reply(
            formatUnavailable(
              `Telegram delivery failed: ${err?.message ?? err}`,
            ),
            { parse_mode: "HTML" },
          );
        }
        return;
      }
      await ctx.reply(
        formatUnavailable(`Council unavailable: ${council.reason}`),
        { parse_mode: "HTML" },
      );
      return;
    }

    const text = formatTelegramBrief({
      bundle: result.bundle,
      replies: council.replies,
      maxChars: cfg.MAX_BRIEF_CHARS,
      planLabel: plan.label,
    });
    try {
      await ctx.reply(text, { parse_mode: "HTML" });
      store.incrementUsage(id);
      if (cacheKey) store.putCachedBrief(cacheKey, text);
    } catch (err: any) {
      await ctx.reply(
        formatUnavailable(`Telegram delivery failed: ${err?.message ?? err}`),
        { parse_mode: "HTML" },
      );
    }
  }

  async function runScan(ctx: any, target: string, kind: "wallet" | "mint") {
    if (target.length > cfg.MAX_TARGET_CHARS || !isSolanaAddress(target)) {
      await ctx.reply("That does not look like a Solana address.");
      return;
    }
    const g = await gate(ctx);
    if (!g.ok) return;

    const cacheKey = `${kind}:${target}:${g.plan.deepEvidence ? "deep" : "shallow"}`;
    const cached = store.getCachedBrief(cacheKey, cfg.SCAN_DEDUP_SECONDS);
    if (cached) {
      await ctx.reply(
        `${cached}\n\n<i>Cached ≤${cfg.SCAN_DEDUP_SECONDS}s · no usage charged</i>`,
        { parse_mode: "HTML" },
      );
      return;
    }

    await ctx.reply(
      `Running ${g.plan.deepEvidence ? "deep" : "shallow"} Scry ladder + ${
        g.plan.multiModel ? "multi-model" : "1-model"
      } council…`,
    );

    const result =
      kind === "mint"
        ? await fetchMintEvidence(cfg, target, g.plan.deepEvidence)
        : await fetchWalletEvidence(cfg, target, g.plan.deepEvidence, {
            pro: g.plan.id === "pro" || g.plan.id === "founder",
          });

    await deliverEvidence(ctx, g.id, g.plan, result, cacheKey);
  }

  bot.command("wallet", async (ctx) => {
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target) return ctx.reply("Usage: /wallet <address>");
    await runScan(ctx, target, "wallet");
  });

  bot.command("mint", async (ctx) => {
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target) return ctx.reply("Usage: /mint <mint>");
    await runScan(ctx, target, "mint");
  });

  bot.command("scan", async (ctx) => {
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target) return ctx.reply("Usage: /scan <wallet_or_mint>");
    const keyboard = new InlineKeyboard()
      .text("Treat as wallet", `scan_wallet:${target}`)
      .text("Treat as mint", `scan_mint:${target}`);
    await ctx.reply("How should I treat this address?", {
      reply_markup: keyboard,
    });
  });

  bot.command("connect", async (ctx) => {
    const parts = (ctx.message?.text ?? "").split(/\s+/);
    const a = parts[1];
    const b = parts[2];
    if (!a || !b || !isSolanaAddress(a) || !isSolanaAddress(b)) {
      await ctx.reply("Usage: /connect <walletA> <walletB>");
      return;
    }
    const g = await gate(ctx);
    if (!g.ok) return;
    if (!g.plan.connectAllowed) {
      await ctx.reply("Pairwise /connect requires Plus or Pro. /plans");
      return;
    }
    await ctx.reply("Pulling pairwise connection evidence…");
    const result = await fetchConnectionEvidence(cfg, a, b);
    await deliverEvidence(ctx, g.id, g.plan, result);
  });

  bot.command("deployer", async (ctx) => {
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target || !isSolanaAddress(target)) {
      await ctx.reply("Usage: /deployer <address>");
      return;
    }
    const g = await gate(ctx);
    if (!g.ok) return;
    if (!g.plan.deployerAllowed) {
      await ctx.reply("Deployer history requires Pro/Founder. /plans");
      return;
    }
    await ctx.reply("Pulling deployer launch-history evidence…");
    const result = await fetchDeployerEvidence(cfg, target);
    await deliverEvidence(ctx, g.id, g.plan, result);
  });

  bot.command("watch", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target || !isSolanaAddress(target)) {
      await ctx.reply("Usage: /watch <address>");
      return;
    }
    const ent = store.getEntitlement(id);
    const plan = PLANS[ent.plan];
    const res = store.addWatch(id, target, plan.watchlistCap);
    if (!res.ok) {
      await ctx.reply(res.reason);
      return;
    }
    await ctx.reply(
      `Watching ${target}\nWatchlist ${res.watchlist.length}/${plan.watchlistCap}\nUse /digest for a freshness pass.`,
    );
  });

  bot.command("unwatch", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target) {
      await ctx.reply("Usage: /unwatch <address>");
      return;
    }
    const res = store.removeWatch(id, target);
    await ctx.reply(`Removed. Watchlist now ${res.watchlist.length}.`);
  });

  bot.command("watchlist", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    const ent = store.getEntitlement(id);
    const plan = PLANS[ent.plan];
    if (!ent.watchlist.length) {
      await ctx.reply(
        plan.watchlistCap
          ? "Watchlist empty. /watch <address>"
          : "Watchlist requires Plus/Pro. /plans",
      );
      return;
    }
    await ctx.reply(
      [
        `Watchlist (${ent.watchlist.length}/${plan.watchlistCap}):`,
        ...ent.watchlist.map((a, i) => `${i + 1}. ${a}`),
      ].join("\n"),
    );
  });

  bot.command("digest", async (ctx) => {
    const g = await gate(ctx);
    if (!g.ok) return;
    if (!g.plan.digestAllowed) {
      await ctx.reply("Watchlist digest requires Plus/Pro. /plans");
      return;
    }
    const list = store.listWatchlist(g.id);
    if (!list.length) {
      await ctx.reply("Watchlist empty. /watch <address> first.");
      return;
    }
    await ctx.reply(`Refreshing ${list.length} watched wallet(s)…`);
    const result = await fetchWatchlistSnapshot(cfg, list);
    await deliverEvidence(ctx, g.id, g.plan, result);
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (data.startsWith("scan_wallet:")) {
      await runScan(ctx, data.slice("scan_wallet:".length), "wallet");
    } else if (data.startsWith("scan_mint:")) {
      await runScan(ctx, data.slice("scan_mint:".length), "mint");
    }
  });

  return bot;
}

function escapeShort(input: string, max: number): string {
  const clipped = input.length > max ? `${input.slice(0, max)}…` : input;
  return clipped
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
