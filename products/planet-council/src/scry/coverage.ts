import type { Config } from "../config.js";

export type CoverageProbe = {
  address: string;
  ok: boolean;
  inCoverage: boolean;
  coverageStatus?: string;
  confidenceBand?: string;
  indexed?: boolean;
  synthetic: boolean;
  asOf?: string;
  dimensions: Array<{ name: string; status: string; ageHours?: number }>;
  raw?: unknown;
  reason?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Free unpaid coverage probe — does not consume Planet check quota. */
export async function probeCoverage(
  cfg: Config,
  address: string,
): Promise<CoverageProbe> {
  if (cfg.SCRY_MOCK) {
    return {
      address,
      ok: true,
      inCoverage: true,
      coverageStatus: "partial",
      confidenceBand: "MID",
      indexed: true,
      synthetic: true,
      asOf: "2026-09-23T00:00:00Z",
      dimensions: [
        { name: "activity", status: "fresh", ageHours: 2 },
        { name: "identity", status: "stale", ageHours: 200 },
        { name: "cohort_coverage", status: "stale", ageHours: 400 },
      ],
    };
  }

  const url = `${cfg.SCRY_BASE_URL}/x402/coverage/${encodeURIComponent(address)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.SCRY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep */
    }
    if (!res.ok) {
      return {
        address,
        ok: false,
        inCoverage: false,
        synthetic: false,
        dimensions: [],
        reason: `Coverage probe HTTP ${res.status}`,
        raw: body,
      };
    }
    const rec = asRecord(body) ?? {};
    const dimsRec = asRecord(asRecord(rec.coverage_receipt)?.dimensions) ?? {};
    const dimensions: CoverageProbe["dimensions"] = [];
    for (const [name, val] of Object.entries(dimsRec)) {
      const d = asRecord(val);
      if (!d) continue;
      dimensions.push({
        name,
        status: typeof d.status === "string" ? d.status : "unknown",
        ageHours:
          typeof d.age_hours === "number" ? d.age_hours : undefined,
      });
    }
    return {
      address,
      ok: true,
      inCoverage: Boolean(rec.in_coverage ?? rec.indexed),
      coverageStatus:
        typeof rec.coverage_status === "string"
          ? rec.coverage_status
          : undefined,
      confidenceBand:
        typeof rec.confidence_band === "string"
          ? rec.confidence_band
          : undefined,
      indexed: Boolean(rec.indexed ?? rec.in_coverage),
      synthetic: false,
      asOf:
        typeof rec.coverage_computed_at === "string"
          ? rec.coverage_computed_at
          : undefined,
      dimensions,
      raw: body,
    };
  } catch (err: any) {
    return {
      address,
      ok: false,
      inCoverage: false,
      synthetic: false,
      dimensions: [],
      reason: err?.message ?? String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function formatCoverageHtml(probe: CoverageProbe): string {
  const esc = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  if (!probe.ok) {
    return [
      "<b>Coverage probe</b>",
      `<code>${esc(probe.address)}</code>`,
      `Unavailable: ${esc(probe.reason ?? "unknown")}`,
      "<i>Free check — no Planet quota used. Not financial advice.</i>",
    ].join("\n");
  }
  const lines = [
    "<b>Coverage probe (free)</b>",
    `<code>${esc(probe.address)}</code>`,
    probe.synthetic ? "<i>SYNTHETIC DEMO</i>" : "",
    `In Scry cohort: <b>${probe.inCoverage ? "yes" : "no"}</b>`,
    probe.coverageStatus
      ? `Coverage status: ${esc(probe.coverageStatus)}`
      : "",
    probe.confidenceBand
      ? `Confidence band: ${esc(probe.confidenceBand)}`
      : "",
    probe.asOf ? `Computed at: ${esc(probe.asOf)}` : "",
  ].filter(Boolean);
  if (probe.dimensions.length) {
    lines.push("", "<b>Dimensions</b>");
    for (const d of probe.dimensions.slice(0, 8)) {
      const age =
        d.ageHours != null ? ` · ${d.ageHours.toFixed(1)}h` : "";
      lines.push(`• ${esc(d.name)}: ${esc(d.status)}${age}`);
    }
  }
  lines.push(
    "",
    probe.inCoverage
      ? "Likely a wallet path — /wallet or /scan next."
      : "Not in indexed wallet cohort — may still be a mint or uncovered wallet. /scan to choose.",
    "<i>Free check — no Planet quota used. Evidence metadata only. DYOR.</i>",
  );
  return lines.join("\n");
}

/**
 * Heuristic auto-detect for /scan.
 * Prefer wallet when free coverage says the address is in the indexed cohort.
 */
export async function suggestScanKind(
  cfg: Config,
  address: string,
): Promise<"wallet" | "mint" | "ask"> {
  const probe = await probeCoverage(cfg, address);
  if (probe.ok && probe.inCoverage) return "wallet";
  return "ask";
}
