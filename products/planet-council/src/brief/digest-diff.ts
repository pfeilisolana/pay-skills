import type { CoverageProbe } from "../scry/coverage.js";

export type WatchSnapshot = {
  address: string;
  inCoverage: boolean;
  coverageStatus?: string;
  confidenceBand?: string;
  dimensionStatuses: Record<string, string>;
  capturedAt: string;
};

export function snapshotFromProbe(probe: CoverageProbe): WatchSnapshot {
  const dimensionStatuses: Record<string, string> = {};
  for (const d of probe.dimensions) {
    dimensionStatuses[d.name] = d.status;
  }
  return {
    address: probe.address,
    inCoverage: probe.inCoverage,
    coverageStatus: probe.coverageStatus,
    confidenceBand: probe.confidenceBand,
    dimensionStatuses,
    capturedAt: new Date().toISOString(),
  };
}

export type DigestDelta = {
  address: string;
  changes: string[];
  firstSeen: boolean;
};

export function diffWatchSnapshots(
  prev: WatchSnapshot | undefined,
  next: WatchSnapshot,
): DigestDelta {
  if (!prev) {
    return {
      address: next.address,
      firstSeen: true,
      changes: [
        `First digest snapshot · coverage=${next.coverageStatus ?? "n/a"} · in_cohort=${next.inCoverage}`,
      ],
    };
  }
  const changes: string[] = [];
  if (prev.inCoverage !== next.inCoverage) {
    changes.push(
      `Cohort membership: ${prev.inCoverage ? "in" : "out"} → ${next.inCoverage ? "in" : "out"}`,
    );
  }
  if (prev.coverageStatus !== next.coverageStatus) {
    changes.push(
      `Coverage: ${prev.coverageStatus ?? "?"} → ${next.coverageStatus ?? "?"}`,
    );
  }
  if (prev.confidenceBand !== next.confidenceBand) {
    changes.push(
      `Confidence: ${prev.confidenceBand ?? "?"} → ${next.confidenceBand ?? "?"}`,
    );
  }
  const keys = new Set([
    ...Object.keys(prev.dimensionStatuses),
    ...Object.keys(next.dimensionStatuses),
  ]);
  for (const k of keys) {
    const a = prev.dimensionStatuses[k];
    const b = next.dimensionStatuses[k];
    if (a !== b) {
      changes.push(`Dimension ${k}: ${a ?? "?"} → ${b ?? "?"}`);
    }
  }
  if (!changes.length) {
    changes.push("No coverage-metadata change since last digest");
  }
  return { address: next.address, firstSeen: false, changes };
}

export function formatDigestDeltaHtml(deltas: DigestDelta[]): string {
  const esc = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const lines = [
    "<b>Watchlist digest (coverage deltas)</b>",
    "<i>Free coverage metadata · no Scry paid routes · not financial advice</i>",
    "",
  ];
  for (const d of deltas) {
    const short = `${d.address.slice(0, 4)}…${d.address.slice(-4)}`;
    lines.push(`<b>${esc(short)}</b>${d.firstSeen ? " · new" : ""}`);
    for (const c of d.changes.slice(0, 5)) {
      lines.push(`• ${esc(c)}`);
    }
    lines.push("");
  }
  lines.push(
    "Run /wallet on a changed address for a paid evidence brief.",
    "<i>Scry does not issue verdicts. You decide. DYOR.</i>",
  );
  return lines.join("\n");
}
