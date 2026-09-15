export type PlanId = "free" | "plus" | "pro" | "founder";

export type PlanLimits = {
  id: PlanId;
  label: string;
  deepEvidence: boolean;
  multiModel: boolean;
  dailyCap?: number;
  monthlyCap?: number;
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
    priceUsd: 0,
  },
  plus: {
    id: "plus",
    label: "Planet Plus",
    deepEvidence: true,
    multiModel: true,
    monthlyCap: 50,
    priceUsd: 9.99,
  },
  pro: {
    id: "pro",
    label: "Planet Pro",
    deepEvidence: true,
    multiModel: true,
    monthlyCap: 250,
    priceUsd: 29.99,
  },
  founder: {
    id: "founder",
    label: "Planet Founder",
    deepEvidence: true,
    multiModel: true,
    monthlyCap: 250,
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
        reason: `Free plan allows ${cap}/day. /plans to upgrade.`,
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
