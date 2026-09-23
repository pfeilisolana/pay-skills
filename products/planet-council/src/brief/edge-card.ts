import type { ScryEvidenceBundle } from "../scry/client.js";

/** Deterministic, evidence-only signals users can act on without waiting for LLMs. */
export type EdgeSignal = {
  key: string;
  label: string;
  value: string;
  severity: "info" | "watch" | "material";
};

export type EdgeCard = {
  target: string;
  kind: ScryEvidenceBundle["kind"];
  depth: "shallow" | "deep";
  synthetic: boolean;
  usable: boolean;
  confidence?: number;
  asOf?: string;
  coverageStatus?: string;
  missingFields: string[];
  warnings: string[];
  signals: EdgeSignal[];
  nextSteps: string[];
  estimatedSpendUsd: number;
  dossierSuggested: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[key];
  }
  return cur;
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function firstNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

function firstBool(...vals: unknown[]): boolean | undefined {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

function collectBodies(bundle: ScryEvidenceBundle): Record<string, unknown>[] {
  return bundle.routes
    .filter((r) => r.ok)
    .map((r) => asRecord(r.body))
    .filter((b): b is Record<string, unknown> => Boolean(b));
}

function pushSignal(
  signals: EdgeSignal[],
  key: string,
  label: string,
  value: string | undefined,
  severity: EdgeSignal["severity"] = "info",
) {
  if (!value) return;
  if (signals.some((s) => s.key === key)) return;
  signals.push({ key, label, value, severity });
}

const ROUTE_PRICE_USD: Record<string, number> = {
  "quick-flag": 0.001,
  pnl: 0.002,
  "bundler-check": 0.01,
  lineage: 0.03,
  "/risk": 0.03,
  forensics: 0.05,
  "launch-window-cluster": 0.05,
  "watchlist-snapshot": 0.05,
  "pumpfun-risk-protection": 0.05,
  connection: 0.04,
  "launch-dossier": 0.3,
  "deployer-summary": 0.39,
  "full-context-pro": 0.18,
  "transfer-tape": 0.15,
};

function estimateSpend(bundle: ScryEvidenceBundle): number {
  let total = 0;
  for (const route of bundle.routes) {
    if (!route.ok) continue;
    for (const [needle, price] of Object.entries(ROUTE_PRICE_USD)) {
      if (route.route.includes(needle)) {
        total += price;
        break;
      }
    }
  }
  return Math.round(total * 1000) / 1000;
}

export function buildEdgeCard(bundle: ScryEvidenceBundle): EdgeCard {
  const bodies = collectBodies(bundle);
  const signals: EdgeSignal[] = [];
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const nextSteps: string[] = [];

  const synthetic =
    bundle.synthetic === true ||
    bodies.some((b) => b.mock === true || b.synthetic === true);

  let confidence = firstNumber(
    ...bodies.map((b) => b.confidence_score),
    ...bodies.map((b) => dig(b, ["coverage", "confidence"])),
    ...bodies.map((b) => dig(b, ["coverage", "score"])),
  );
  const asOf = firstString(
    ...bodies.map((b) => b.as_of as string),
    ...bodies.map((b) => dig(b, ["freshness", "as_of"]) as string),
    ...bodies.map((b) => b.source_updated_at as string),
    bundle.fetchedAt,
  );
  const coverageStatus = firstString(
    ...bodies.map((b) => dig(b, ["coverage", "status"]) as string),
    ...bodies.map((b) => (b.supported === false ? "unsupported" : "")),
    ...bodies.map((b) => (b.in_db === false ? "not_indexed" : "")),
  );

  for (const b of bodies) {
    const missing = dig(b, ["coverage", "missing_fields"]);
    if (Array.isArray(missing)) {
      for (const m of missing) {
        if (typeof m === "string" && !missingFields.includes(m)) {
          missingFields.push(m);
        }
      }
    }
    const caveat = firstString(b.caveat);
    if (caveat && !warnings.includes(caveat)) warnings.push(caveat);
  }

  // Identity
  for (const b of bodies) {
    const handle = firstString(
      dig(b, ["identity", "x_handle"]) as string,
      dig(b, ["identity", "twitter_handle"]) as string,
      dig(b, ["x_handle"]) as string,
      dig(b, ["twitter_handle"]) as string,
      dig(b, ["quick_flags", "x_handle"]) as string,
    );
    pushSignal(
      signals,
      "identity",
      "Public X/Twitter handle (when covered)",
      handle ? `@${handle.replace(/^@/, "")}` : undefined,
      "watch",
    );
  }

  // Quarantine / known service
  for (const b of bodies) {
    const quarantined = firstBool(
      dig(b, ["quarantine", "is_known_service"]) as boolean,
      dig(b, ["service_quarantined"]) as boolean,
      dig(b, ["quick_flags", "service_quarantined"]) as boolean,
    );
    const label = firstString(
      dig(b, ["quarantine", "label"]) as string,
      dig(b, ["service_label"]) as string,
    );
    if (quarantined === true) {
      pushSignal(
        signals,
        "quarantine",
        "Service / router quarantine",
        label ? `Known service/router: ${label}` : "Known service or router",
        "material",
      );
    } else if (quarantined === false) {
      pushSignal(
        signals,
        "quarantine",
        "Service / router quarantine",
        "Not flagged as known service/router in this pull",
        "info",
      );
    }
  }

  // Bundler / private routing
  for (const b of bodies) {
    const bundler = firstBool(
      dig(b, ["bundler_hint", "observed"]) as boolean,
      dig(b, ["bundler", "observed"]) as boolean,
      dig(b, ["private_routing", "observed"]) as boolean,
      dig(b, ["quick_flags", "bundler_hint"]) as boolean,
    );
    const detail = firstString(
      dig(b, ["bundler_hint", "notes"]) as string,
      dig(b, ["bundler", "summary"]) as string,
    );
    if (bundler === true) {
      pushSignal(
        signals,
        "bundler",
        "Bundler / private-routing evidence",
        detail ?? "Bundler or private-routing pattern observed",
        "material",
      );
    } else if (bundler === false) {
      pushSignal(
        signals,
        "bundler",
        "Bundler / private-routing evidence",
        "No bundler/private-routing hint in this pull",
        "info",
      );
    }
  }

  // Funding lineage
  for (const b of bodies) {
    const hops = firstNumber(
      dig(b, ["funding_lineage", "hops"]) as number,
      dig(b, ["lineage", "hops"]) as number,
      dig(b, ["hop_count"]) as number,
    );
    const upstream = dig(b, ["upstream"]) ?? dig(b, ["funding_lineage", "upstream"]);
    let funder: string | undefined;
    if (Array.isArray(upstream) && upstream.length) {
      const first = asRecord(upstream[0]);
      funder = firstString(first?.address, first?.wallet);
    }
    if (hops != null || funder) {
      pushSignal(
        signals,
        "lineage",
        "Funding lineage",
        [
          hops != null ? `${hops} hop(s)` : null,
          funder ? `nearest funder ${funder.slice(0, 4)}…${funder.slice(-4)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "lineage present",
        "watch",
      );
    }
  }

  // Cluster / peers
  for (const b of bodies) {
    const members = firstNumber(
      dig(b, ["cluster", "members_indexed"]) as number,
      dig(b, ["cluster", "size"]) as number,
      dig(b, ["coordination_peers", "count"]) as number,
    );
    if (members != null) {
      pushSignal(
        signals,
        "cluster",
        "Cluster / coordination peers",
        `${members} indexed peer(s) in this evidence window`,
        members >= 3 ? "watch" : "info",
      );
    }
  }

  // Connection pairwise
  if (bundle.kind === "connection") {
    for (const b of bodies) {
      const connected = firstBool(b.connected as boolean);
      const hops = firstNumber(b.hop_distance as number, b.hops as number);
      if (connected != null) {
        pushSignal(
          signals,
          "connected",
          "Pairwise connection evidence",
          connected
            ? hops != null
              ? `Connected (hop distance ${hops})`
              : "Connected in indexed evidence"
            : "No connection observed in this pull",
          connected ? "watch" : "info",
        );
      }
    }
  }

  // Deployer history
  if (bundle.kind === "deployer") {
    for (const b of bodies) {
      const launches = firstNumber(
        b.launches_observed as number,
        b.launch_count as number,
      );
      const related = firstNumber(b.related_wallets as number);
      if (launches != null) {
        pushSignal(
          signals,
          "launches",
          "Observed launches",
          String(launches),
          launches >= 3 ? "watch" : "info",
        );
      }
      if (related != null) {
        pushSignal(
          signals,
          "related",
          "Related wallets",
          String(related),
          "info",
        );
      }
    }
  }

  // Mint-specific
  if (bundle.kind === "mint") {
    for (const b of bodies) {
      const risk = firstString(b.risk as string);
      const riskScore = firstNumber(b.risk_score as number);
      if (risk) {
        pushSignal(
          signals,
          "mint_risk_label",
          "Mint risk label (evidence heuristic)",
          riskScore != null ? `${risk} (score ${riskScore})` : risk,
          risk.toUpperCase() === "LOW" ? "info" : "watch",
        );
      }
      const top10 = firstNumber(
        dig(b, ["holder_concentration", "top10_pct"]) as number,
        b.holder_concentration_pct_proxy as number,
      );
      if (top10 != null) {
        pushSignal(
          signals,
          "holders",
          "Holder concentration (proxy)",
          `Top-10 ≈ ${top10}%`,
          top10 >= 40 ? "material" : "info",
        );
      }
      const creator = firstString(
        b.creator_wallet as string,
        dig(b, ["creator"]) as string,
        dig(b, ["launch", "creator"]) as string,
      );
      if (creator) {
        pushSignal(
          signals,
          "creator",
          "Creator / deployer wallet",
          `${creator.slice(0, 4)}…${creator.slice(-4)}`,
          "watch",
        );
      }
      const knownNet = firstBool(b.creator_in_known_creator_network as boolean);
      if (knownNet === true) {
        pushSignal(
          signals,
          "creator_network",
          "Known creator network",
          "Creator appears in a known creator network (coverage-dependent)",
          "material",
        );
      }
      const flags = dig(b, ["rug_evidence", "flags"]);
      if (Array.isArray(flags) && flags.length) {
        pushSignal(
          signals,
          "rug_flags",
          "Rug-evidence flags",
          flags.filter((f) => typeof f === "string").join(", "),
          "material",
        );
      }
    }
  }

  // Unsupported / not indexed
  for (const b of bodies) {
    if (b.supported === false) {
      warnings.push("Target marked unsupported for this product.");
    }
    if (b.in_db === false) {
      warnings.push("Target not present in Scry indexed cohort for this pull.");
    }
  }

  if (!bundle.routes.some((r) => r.ok)) {
    warnings.push("No successful Scry routes returned usable evidence.");
  }

  // Next-step ladder suggestions (caller-owned; not trade advice)
  const hasLineage = signals.some((s) => s.key === "lineage");
  const hasForensics = bundle.routes.some(
    (r) => r.ok && r.route.includes("forensics"),
  );
  const hasBundlerDetail = bundle.routes.some(
    (r) => r.ok && r.route.includes("bundler"),
  );
  const bundlerHint = signals.find((s) => s.key === "bundler")?.severity === "material";

  if (bundle.kind === "wallet") {
    if (!hasLineage) nextSteps.push("Pull funding lineage if source-of-funds matters.");
    if (!hasForensics) nextSteps.push("Pull forensics for identity/cluster dossier depth.");
    if (bundlerHint && !hasBundlerDetail) {
      nextSteps.push("Confirm bundler/private-routing with dedicated bundler-check.");
    }
    nextSteps.push("Add to /watchlist to re-check freshness later.");
  } else {
    if (!bundle.routes.some((r) => r.ok && r.route.includes("launch-dossier"))) {
      nextSteps.push("Escalate to Pump.fun launch dossier for creator/launch-window depth.");
    }
    if (signals.some((s) => s.key === "creator")) {
      nextSteps.push("Run /deployer on the creator wallet for launch-history evidence.");
    }
  }

  const usable =
    bundle.routes.some((r) => r.ok) &&
    (signals.length > 0 ||
      coverageStatus != null ||
      confidence != null ||
      bodies.length > 0);

  const estimatedSpendUsd = estimateSpend(bundle);
  const dossierSuggested =
    !usable ||
    coverageStatus === "partial" ||
    coverageStatus === "not_indexed" ||
    missingFields.length >= 3 ||
    (confidence != null && confidence < 0.45);

  if (confidence == null && usable) confidence = 0.5;

  return {
    target: bundle.target,
    kind: bundle.kind,
    depth: bundle.depth,
    synthetic,
    usable,
    confidence,
    asOf,
    coverageStatus,
    missingFields,
    warnings,
    signals,
    nextSteps: nextSteps.slice(0, 4),
    estimatedSpendUsd,
    dossierSuggested,
  };
}

export function edgeCardToPromptBlock(card: EdgeCard): string {
  return JSON.stringify(
    {
      target: card.target,
      kind: card.kind,
      depth: card.depth,
      synthetic: card.synthetic,
      confidence: card.confidence,
      as_of: card.asOf,
      coverage_status: card.coverageStatus,
      missing_fields: card.missingFields,
      warnings: card.warnings,
      signals: card.signals,
      next_steps: card.nextSteps,
      estimated_spend_usd: card.estimatedSpendUsd,
    },
    null,
    2,
  );
}
