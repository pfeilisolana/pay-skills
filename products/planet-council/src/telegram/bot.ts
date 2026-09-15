import { Bot, InlineKeyboard } from "grammy";
import type { Config } from "../config.js";
import { JsonStore } from "../billing/store.js";
import { PLANS, canRunCheck, type PlanId } from "../billing/plans.js";
import {
  fetchMintEvidence,
  fetchPlanetOffers,
  fetchWalletEvidence,
} from "../scry/client.js";
import { runCouncil } from "../brief/council.js";
import { formatTelegramBrief } from "../brief/format.js";
import { isSolanaAddress } from "../lib/solana.js";
import {
  fetchTransaction,
  matchSolActivation,
} from "../billing/payments.js";

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
        "Planet Council — Scry evidence + multi-model reading.",
        "",
        "Commands:",
        "/scan <wallet_or_mint>",
        "/wallet <address>",
        "/mint <mint>",
        "/plans",
        "/usage",
        "/activate <tx_signature>",
        "",
        "Free = shallow evidence + 1 model.",
        "Plus/Pro = deep Scry ladder + 3-model council.",
        "Not financial advice. Scry is evidence-only.",
      ].join("\n"),
    );
  });

  bot.command("plans", async (ctx) => {
    const offers = await fetchPlanetOffers(cfg);
    const lines = [
      "Planet plans:",
      ...Object.values(PLANS).map(
        (p) =>
          `• ${p.label}: $${p.priceUsd} — deep=${p.deepEvidence} multi=${p.multiModel}`,
      ),
      "",
      cfg.PLANET_PAYMENT_ADDRESS
        ? `Pay SOL to \`${cfg.PLANET_PAYMENT_ADDRESS}\` then /activate <tx>`
        : "Payment address not configured — ask an admin for /grant or finish checkout wiring.",
      "",
      `Offers catalog snapshot: \`\`\`${JSON.stringify(offers).slice(0, 500)}\`\`\``,
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
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
    const id = String(ctx.from?.id ?? "");
    const sig = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!sig) {
      await ctx.reply("Usage: /activate <tx_signature>");
      return;
    }
    if (!cfg.PLANET_PAYMENT_ADDRESS) {
      await ctx.reply("PLANET_PAYMENT_ADDRESS is not configured.");
      return;
    }
    try {
      if (store.paymentUsed(sig)) {
        await ctx.reply("That payment signature was already used.");
        return;
      }
      const tx = await fetchTransaction(sig, cfg);
      if (!tx) {
        await ctx.reply(
          "Transaction not found yet. Wait for confirmation and retry.",
        );
        return;
      }
      const match = matchSolActivation(tx, cfg);
      if (!match) {
        await ctx.reply(
          "Could not match a qualifying SOL transfer to the Planet payment address.",
        );
        return;
      }
      const row = store.activate({
        telegramUserId: id,
        plan: match.plan,
        txSig: sig,
      });
      await ctx.reply(
        `Activated ${PLANS[match.plan].label} until ${row.expiresAt}`,
      );
    } catch (err: any) {
      await ctx.reply(`Activation failed: ${err?.message ?? err}`);
    }
  });

  async function runScan(ctx: any, target: string, kind: "wallet" | "mint") {
    const id = String(ctx.from?.id ?? "");
    if (!isSolanaAddress(target)) {
      await ctx.reply("That does not look like a Solana address.");
      return;
    }
    const ent = store.getEntitlement(id);
    const gate = canRunCheck({
      plan: ent.plan,
      checksUsedToday: ent.checksUsedToday,
      checksUsedMonth: ent.checksUsedMonth,
      freeChecksPerDay: cfg.FREE_CHECKS_PER_DAY,
    });
    if (!gate.ok) {
      await ctx.reply(gate.reason);
      return;
    }
    const plan = PLANS[ent.plan];
    await ctx.reply(
      `Running ${plan.deepEvidence ? "deep" : "shallow"} Scry pull + ${
        plan.multiModel ? "3-model" : "1-model"
      } council…`,
    );

    const bundle =
      kind === "mint"
        ? await fetchMintEvidence(cfg, target, plan.deepEvidence)
        : await fetchWalletEvidence(cfg, target, plan.deepEvidence);

    const replies = await runCouncil({
      cfg,
      bundle,
      multiModel: plan.multiModel,
    });
    store.incrementUsage(id);
    const text = formatTelegramBrief({
      bundle,
      replies,
      maxChars: cfg.MAX_BRIEF_CHARS,
    });
    await ctx.reply(text, { parse_mode: "Markdown" });
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
