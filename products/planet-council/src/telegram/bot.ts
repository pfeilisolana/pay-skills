import { Bot, InlineKeyboard, InputFile } from "grammy";
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
import {
  formatCoverageHtml,
  probeCoverage,
  suggestScanKind,
} from "../scry/coverage.js";
import {
  offerLabel,
  resolveOfferId,
  submitPlanetIntake,
  type IntakeOfferId,
} from "../scry/intake.js";
import { runCouncil } from "../brief/council.js";
import { formatTelegramBrief, formatUnavailable } from "../brief/format.js";
import {
  diffWatchSnapshots,
  formatDigestDeltaHtml,
  snapshotFromProbe,
} from "../brief/digest-diff.js";
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
        "• Free <b>/coverage</b> probe (no quota)",
        "• Deterministic <b>edge card</b> (quarantine, bundler, lineage, holders)",
        "• Spend-aware Scry ladder + optional 3-model dissent",
        "• Watchlist <b>/digest</b> deltas so freshness changes stand out",
        "• <b>/dossier</b> / <b>/upgrade</b> intake when you need paid depth",
        "",
        "<b>Commands</b>",
        "/coverage &lt;address&gt; — free cohort/freshness probe",
        "/scan &lt;wallet_or_mint&gt; — auto-detect when indexed",
        "/wallet · /mint · /connect · /deployer",
        "/watch · /unwatch · /watchlist · /digest [deep]",
        "/dossier &lt;address&gt; · /upgrade plus|pro|founder · /case",
        "/export · /plans · /usage",
        "",
        "Free = shallow edge card + 1 model (3/day).",
        "Plus/Pro = deep ladder + council + watchlist.",
        "Not financial advice. Scry is evidence-only.",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
  });

  bot.command("plans", async (ctx) => {
    const offers = await fetchPlanetOffers(cfg);
    const keyboard = new InlineKeyboard()
      .text("Upgrade Plus", "upgrade:plus")
      .text("Upgrade Pro", "upgrade:pro")
      .row()
      .text("Founder", "upgrade:founder")
      .text("Request dossier $249", "dossier_help");
    const lines = [
      "<b>Planet plans</b>",
      ...Object.values(PLANS).map(
        (p) =>
          `• <b>${p.label}</b>: $${p.priceUsd} — deep=${p.deepEvidence} multi=${p.multiModel} watch=${p.watchlistCap} export=${p.exportAllowed}`,
      ),
      "",
      "High-stakes: <b>Scry Forensics Dossier ~$249</b> via /dossier &lt;address&gt;",
      "Priority multi-wallet case from ~$799 via /case",
      "",
      "Checkout is manual intake until LemonSqueezy/Stars is live — buttons file a request.",
      "SOL <code>/activate</code> remains disabled (containment).",
      "",
      `<code>${escapeShort(JSON.stringify(offers), 400)}</code>`,
    ];
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
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
        row.lastBriefAt ? `Last brief: ${row.lastBriefAt}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
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
        "Use /upgrade plus|pro|founder to file Planet intake, or ask an admin for /grant.",
        "Future in-bot digital goods need Stars-compatible checkout.",
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
      const keyboard = new InlineKeyboard()
        .text("Upgrade Plus", "upgrade:plus")
        .text("Request dossier", "dossier_help");
      await ctx.reply(check.reason, { reply_markup: keyboard });
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

    const canRenderEdge = result.bundle.ok;
    if (!council.ok && !canRenderEdge) {
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
    const keyboard = new InlineKeyboard()
      .text("Watch", `watch:${result.bundle.target.split("↔")[0] ?? ""}`)
      .text("Dossier $249", `dossier:${result.bundle.target.split("↔")[0] ?? ""}`)
      .row()
      .text("Upgrade", "upgrade:plus");
    try {
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
      store.incrementUsage(id);
      store.saveLastBrief(id, {
        html: text,
        target: result.bundle.target,
      });
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

  async function fileIntake(
    ctx: any,
    offerId: IntakeOfferId,
    object?: string,
    objectType?: "wallet" | "token_or_mint" | "other",
  ) {
    const id = String(ctx.from?.id ?? "");
    const username = ctx.from?.username;
    await ctx.reply(`Filing Planet intake for ${offerLabel(offerId)}…`);
    const result = await submitPlanetIntake(cfg, {
      offerId,
      telegramUserId: id,
      telegramUsername: username,
      object,
      objectType: objectType ?? (object ? "wallet" : "other"),
      useCase: `Telegram request for ${offerLabel(offerId)}`,
      urgency: offerId.startsWith("scry-case") ? "priority" : "standard",
      notes: `telegram_user=${id}; plan=${store.getEntitlement(id).plan}`,
    });
    if (!result.ok) {
      await ctx.reply(`Intake failed: ${result.reason}`);
      return;
    }
    store.logIntake({
      intakeId: result.intakeId,
      telegramUserId: id,
      offerId: result.offerId,
      object,
    });
    await ctx.reply(
      [
        `<b>Intake received</b>`,
        `Offer: ${escapeShort(offerLabel(offerId), 80)}`,
        `ID: <code>${escapeShort(result.intakeId, 80)}</code>`,
        result.synthetic ? "<i>SYNTHETIC DEMO — not sent to live Planet.</i>" : "",
        result.nextStep ? `Next: ${escapeShort(result.nextStep, 120)}` : "",
        "",
        "Someone from Planet/Scry will follow up manually while checkout is being configured.",
        "Evidence-only reviews. Not financial advice.",
      ]
        .filter(Boolean)
        .join("\n"),
      { parse_mode: "HTML" },
    );
  }

  bot.command("coverage", async (ctx) => {
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target || !isSolanaAddress(target)) {
      await ctx.reply("Usage: /coverage <address> — free, no quota.");
      return;
    }
    const probe = await probeCoverage(cfg, target);
    const keyboard = new InlineKeyboard()
      .text("Scan as wallet", `scan_wallet:${target}`)
      .text("Scan as mint", `scan_mint:${target}`)
      .row()
      .text("Watch", `watch:${target}`)
      .text("Dossier", `dossier:${target}`);
    await ctx.reply(formatCoverageHtml(probe), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

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
    if (!isSolanaAddress(target)) {
      await ctx.reply("That does not look like a Solana address.");
      return;
    }
    await ctx.reply("Checking free coverage to auto-detect…");
    const kind = await suggestScanKind(cfg, target);
    if (kind === "wallet") {
      await ctx.reply("Indexed wallet cohort hit — running wallet ladder.");
      await runScan(ctx, target, "wallet");
      return;
    }
    const keyboard = new InlineKeyboard()
      .text("Treat as wallet", `scan_wallet:${target}`)
      .text("Treat as mint", `scan_mint:${target}`);
    await ctx.reply(
      "Not in the indexed wallet cohort (or probe unavailable). How should I treat it?",
      { reply_markup: keyboard },
    );
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
      `Watching ${target}\nWatchlist ${res.watchlist.length}/${plan.watchlistCap}\nUse /digest for free coverage deltas (or /digest deep for paid refresh).`,
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
    const id = String(ctx.from?.id ?? "");
    const ent = store.getEntitlement(id);
    const plan = PLANS[ent.plan];
    if (!plan.digestAllowed) {
      await ctx.reply("Watchlist digest requires Plus/Pro. /plans");
      return;
    }
    const list = store.listWatchlist(id);
    if (!list.length) {
      await ctx.reply("Watchlist empty. /watch <address> first.");
      return;
    }
    const deep = (ctx.message?.text ?? "").toLowerCase().includes("deep");
    if (deep) {
      const g = await gate(ctx);
      if (!g.ok) return;
      await ctx.reply(`Deep-refreshing ${list.length} watched wallet(s)…`);
      const result = await fetchWatchlistSnapshot(cfg, list);
      await deliverEvidence(ctx, g.id, g.plan, result);
      return;
    }

    // Default: free coverage deltas — retention without burning margin.
    await ctx.reply(
      `Coverage digest for ${list.length} wallet(s) (free metadata, no quota)…`,
    );
    const deltas = [];
    for (const address of list) {
      const probe = await probeCoverage(cfg, address);
      if (!probe.ok) {
        deltas.push({
          address,
          firstSeen: !store.getWatchSnapshot(id, address),
          changes: [`Probe failed: ${probe.reason ?? "unknown"}`],
        });
        continue;
      }
      const next = snapshotFromProbe(probe);
      const prev = store.getWatchSnapshot(id, address);
      deltas.push(diffWatchSnapshots(prev, next));
      store.putWatchSnapshot(id, next);
    }
    await ctx.reply(formatDigestDeltaHtml(deltas), { parse_mode: "HTML" });
  });

  bot.command("upgrade", async (ctx) => {
    const raw = (ctx.message?.text ?? "").split(/\s+/)[1] ?? "";
    const offer = resolveOfferId(raw);
    if (!offer || !offer.startsWith("planet-")) {
      await ctx.reply("Usage: /upgrade plus|pro|founder");
      return;
    }
    await fileIntake(ctx, offer);
  });

  bot.command("dossier", async (ctx) => {
    const target = (ctx.message?.text ?? "").split(/\s+/)[1];
    if (!target || !isSolanaAddress(target)) {
      await ctx.reply(
        "Usage: /dossier <wallet_or_mint>\nFiles a ~$249 Scry Forensics Dossier intake request.",
      );
      return;
    }
    await fileIntake(ctx, "scry-dossier-standard", target, "wallet");
  });

  bot.command("case", async (ctx) => {
    const note = (ctx.message?.text ?? "").split(/\s+/).slice(1).join(" ");
    const id = String(ctx.from?.id ?? "");
    await fileIntake(ctx, "scry-case-priority", note || undefined, "other");
    if (!note) {
      await ctx.reply(
        `Tip: /case <short scope> helps review. Your user id is ${id}.`,
      );
    }
  });

  bot.command("export", async (ctx) => {
    const id = String(ctx.from?.id ?? "");
    const ent = store.getEntitlement(id);
    const plan = PLANS[ent.plan];
    if (!plan.exportAllowed) {
      await ctx.reply("HTML export requires Pro/Founder. /plans");
      return;
    }
    const last = store.getLastBrief(id);
    if (!last.html) {
      await ctx.reply("No brief to export yet. Run /scan first.");
      return;
    }
    const body = [
      "Planet Council export",
      `Target: ${last.target ?? ""}`,
      `At: ${last.at ?? ""}`,
      `Plan: ${plan.label}`,
      "",
      last.html,
      "",
      "Evidence from Scry · interpretation from AI · not financial advice.",
    ].join("\n");
    await ctx.replyWithDocument(
      new InputFile(Buffer.from(body, "utf8"), `planet-council-${Date.now()}.html.txt`),
      {
        caption: "Last brief export (Pro). Not financial advice.",
      },
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (data.startsWith("scan_wallet:")) {
      await runScan(ctx, data.slice("scan_wallet:".length), "wallet");
    } else if (data.startsWith("scan_mint:")) {
      await runScan(ctx, data.slice("scan_mint:".length), "mint");
    } else if (data.startsWith("watch:")) {
      const target = data.slice("watch:".length);
      const id = String(ctx.from?.id ?? "");
      const plan = PLANS[store.getEntitlement(id).plan];
      if (!isSolanaAddress(target)) {
        await ctx.reply("Invalid watch target.");
        return;
      }
      const res = store.addWatch(id, target, plan.watchlistCap);
      await ctx.reply(res.ok ? `Watching ${target}` : res.reason);
    } else if (data.startsWith("dossier:")) {
      const target = data.slice("dossier:".length);
      if (!isSolanaAddress(target)) {
        await ctx.reply("Usage: /dossier <address>");
        return;
      }
      await fileIntake(ctx, "scry-dossier-standard", target, "wallet");
    } else if (data.startsWith("upgrade:")) {
      const offer = resolveOfferId(data.slice("upgrade:".length));
      if (!offer) {
        await ctx.reply("Unknown upgrade.");
        return;
      }
      await fileIntake(ctx, offer);
    } else if (data === "dossier_help") {
      await ctx.reply(
        "Send /dossier <wallet_or_mint> to file a ~$249 Scry Forensics Dossier intake.",
      );
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
