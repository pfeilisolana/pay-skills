import type { ScryEvidenceBundle } from "../scry/client.js";
import type { ModelReply } from "./council.js";
import { buildEdgeCard, type EdgeCard } from "./edge-card.js";
import { clampText, escapeHtml } from "../lib/solana.js";

function severityMark(sev: EdgeCard["signals"][number]["severity"]): string {
  if (sev === "material") return "●";
  if (sev === "watch") return "◐";
  return "○";
}

function formatEdgeCard(card: EdgeCard): string[] {
  const lines: string[] = [
    "<b>Edge card (Scry facts)</b>",
    `Target: <code>${escapeHtml(card.target)}</code> (${escapeHtml(card.kind)}) · depth=${escapeHtml(card.depth)}`,
  ];
  if (card.synthetic) {
    lines.push("<i>SYNTHETIC DEMO — not live Scry evidence.</i>");
  }
  if (card.confidence != null) {
    lines.push(`Confidence: ${card.confidence.toFixed(2)}`);
  }
  if (card.coverageStatus) {
    lines.push(`Coverage: ${escapeHtml(card.coverageStatus)}`);
  }
  if (card.asOf) {
    lines.push(`As of: ${escapeHtml(card.asOf)}`);
  }
  if (card.estimatedSpendUsd > 0) {
    lines.push(`Scry spend this pull: ~$${card.estimatedSpendUsd}`);
  }
  if (card.signals.length) {
    lines.push("");
    for (const s of card.signals) {
      lines.push(
        `${severityMark(s.severity)} <b>${escapeHtml(s.label)}</b>: ${escapeHtml(s.value)}`,
      );
    }
  } else {
    lines.push("No structured signals extracted from this pull.");
  }
  if (card.missingFields.length) {
    lines.push(
      `Missing fields: ${escapeHtml(card.missingFields.slice(0, 8).join(", "))}`,
    );
  }
  if (card.warnings.length) {
    lines.push("");
    lines.push("<b>Coverage warnings</b>");
    for (const w of card.warnings.slice(0, 4)) {
      lines.push(`• ${escapeHtml(w)}`);
    }
  }
  if (card.nextSteps.length) {
    lines.push("");
    lines.push("<b>Suggested next evidence</b>");
    for (const n of card.nextSteps) {
      lines.push(`• ${escapeHtml(n)}`);
    }
  }
  return lines;
}

function routeLines(bundle: ScryEvidenceBundle): string[] {
  return bundle.routes.map((route) => {
    const status = route.ok ? "ok" : `fail/${route.status ?? "?"}`;
    const price = route.priceUsd ? ` · $${route.priceUsd}` : "";
    return `• <code>${escapeHtml(route.route)}</code> — ${status}${price}`;
  });
}

export function formatUnavailable(reason: string): string {
  return [
    "<b>Planet Council</b>",
    "<i>Evidence from Scry · interpretation from AI · not financial advice</i>",
    "",
    "<b>Unavailable</b>",
    escapeHtml(reason),
    "",
    "No usage charged for this failed pull.",
    "<i>Scry does not issue verdicts. You decide. DYOR.</i>",
  ].join("\n");
}

export function formatTelegramBrief(opts: {
  bundle: ScryEvidenceBundle;
  replies: ModelReply[];
  maxChars: number;
  planLabel?: string;
}): string {
  const card = buildEdgeCard(opts.bundle);
  const okReplies = opts.replies.filter((r) => r.ok && r.text);
  const primary = okReplies[0];
  const dissent = okReplies.slice(1);

  const parts: string[] = [
    "<b>Planet Council brief</b>",
    "<i>Evidence from Scry · interpretation from AI · not financial advice</i>",
    opts.planLabel ? `Plan: ${escapeHtml(opts.planLabel)}` : "",
    "",
    ...formatEdgeCard(card),
    "",
    "<b>Routes pulled</b>",
    ...routeLines(opts.bundle),
  ].filter(Boolean);

  if (primary) {
    parts.push(
      "",
      `<b>Council reading (AI · ${escapeHtml(primary.model)})</b>`,
      escapeHtml(primary.text),
    );
  }

  if (dissent.length) {
    parts.push("", "<b>Dissent / additional models</b>");
    for (const d of dissent) {
      parts.push(`<b>${escapeHtml(d.model)}</b>`, escapeHtml(d.text));
    }
  }

  const failed = opts.replies.filter((r) => !r.ok);
  if (failed.length) {
    parts.push("", "<b>Model errors</b>");
    for (const f of failed) {
      parts.push(`• ${escapeHtml(f.model)}: ${escapeHtml(f.error ?? "failed")}`);
    }
  }

  if (card.dossierSuggested) {
    parts.push(
      "",
      "<b>Deeper option</b>",
      "Coverage looks thin for a high-stakes review. Planet offers a Scry Forensics Dossier (~$249, manual intake) when you need analyst-grade lineage/cluster notes — /plans.",
    );
  } else if (card.depth === "shallow") {
    parts.push(
      "",
      "<b>Upgrade path</b>",
      "Plus/Pro unlocks deep Scry ladder + 3-model council + watchlist. /plans",
    );
  }

  parts.push("", "<i>Scry does not issue verdicts. You decide. DYOR.</i>");

  // Prefer keeping edge card + warnings if we must truncate.
  return clampText(parts.join("\n"), opts.maxChars);
}
