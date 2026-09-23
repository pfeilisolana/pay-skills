export type PlanId = "free" | "plus" | "pro" | "founder";

export type PlanLimits = {
  id: PlanId;
  label: string;
  deepEvidence: boolean;
  multiModel: boolean;
  dailyCap?: number;
  monthlyCap?: number;
  watchlistCap: number;
  connectAllowed: boolean;
  deployerAllowed: boolean;
  digestAllowed: boolean;
  exportAllowed: boolean;
  priceUsd: number;
};

/** Mirrors scry.solanahub.de/api/planet/offers (Sep 2026 catalog). */
export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    id: "free",
    label: "Planet Free",
    deepEvidence: false,
    multiModel: false,
    dailyCap: 3,
    watchlistCap: 0,
    connectAllowed: false,
    deployerAllowed: false,
    digestAllowed: false,
    exportAllowed: false,
    priceUsd: 0,
  },
  plus: {
    id: "plus",
    label: "Planet Plus",
    deepEvidence: true,
    multiModel: true,
    monthlyCap: 50,
    watchlistCap: 10,
    connectAllowed: true,
    deployerAllowed: false,
    digestAllowed: true,
    exportAllowed: false,
    priceUsd: 9.99,
  },
  pro: {
    id: "pro",
    label: "Planet Pro",
    deepEvidence: true,
    multiModel: true,
    monthlyCap: 250,
    watchlistCap: 50,
    connectAllowed: true,
    deployerAllowed: true,
    digestAllowed: true,
    exportAllowed: true,
    priceUsd: 29.99,
  },
  founder: {
    id: "founder",
    label: "Planet Founder",
    deepEvidence: true,
    multiModel: true,
    monthlyCap: 250,
    watchlistCap: 50,
    connectAllowed: true,
    deployerAllowed: true,
    digestAllowed: true,
    exportAllowed: true,
    priceUsd: 99,
  },
};

export function canRunCheck(opts: {
  plan: PlanId;
  checksUsedToday: number;
  checksUsedMonth: number;
  freeChecksPerDay: number;
}): { ok: true } | { ok: false; reason: string } {
  const limits = PLANS[opts.plan];
  if (limits.id === "free") {
    const cap = opts.freeChecksPerDay ?? limits.dailyCap ?? 3;
    if (opts.checksUsedToday >= cap) {
      return {
        ok: false,
        reason:
          `Free plan allows ${cap}/day. /plans to upgrade — Plus unlocks deep Scry ladder, 3-model council, and a 10-wallet watchlist.`,
      };
    }
    return { ok: true };
  }
  const monthly = limits.monthlyCap ?? 50;
  if (opts.checksUsedMonth >= monthly) {
    return {
      ok: false,
      reason: `${limits.label} monthly cap (${monthly}) reached.`,
    };
  }
  return { ok: true };
}
