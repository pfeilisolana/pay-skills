import type { ScryEvidenceBundle } from "../scry/client.js";
import type { ModelReply } from "./council.js";
import { clampText } from "../lib/solana.js";

function evidenceBullets(bundle: ScryEvidenceBundle): string[] {
  const bullets: string[] = [];
  bullets.push(`Target: \`${bundle.target}\` (${bundle.kind})`);
  bullets.push(`Depth: ${bundle.depth}`);
  for (const route of bundle.routes) {
    const status = route.ok ? "ok" : `fail/${route.status ?? "?"}`;
    bullets.push(`• ${route.route} — ${status}`);
  }
  return bullets;
}

export function formatTelegramBrief(opts: {
  bundle: ScryEvidenceBundle;
  replies: ModelReply[];
  maxChars: number;
}): string {
  const okReplies = opts.replies.filter((r) => r.ok && r.text);
  const primary = okReplies[0]?.text ?? "_No model reply available._";
  const dissent = okReplies.slice(1);

  const parts = [
    "*Planet Council brief*",
    "_Evidence from Scry · interpretation from AI · not financial advice_",
    "",
    "*Evidence (Scry)*",
    ...evidenceBullets(opts.bundle),
    "",
    "*Council reading (AI)*",
    primary,
  ];

  if (dissent.length) {
    parts.push("", "*Dissent / additional models*");
    for (const d of dissent) {
      parts.push(`*${d.model}*`, d.text);
    }
  }

  const failed = opts.replies.filter((r) => !r.ok);
  if (failed.length) {
    parts.push("", "*Model errors*");
    for (const f of failed) {
      parts.push(`• ${f.model}: ${f.error ?? "failed"}`);
    }
  }

  parts.push("", "_Scry does not issue verdicts. You decide. DYOR._");
  return clampText(parts.join("\n"), opts.maxChars);
}
