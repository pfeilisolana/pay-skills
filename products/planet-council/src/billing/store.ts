import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { PlanId } from "./plans.js";

export type EntitlementRecord = {
  telegramUserId: string;
  plan: PlanId;
  checksUsedToday: number;
  checksUsedMonth: number;
  dayKey: string;
  monthKey: string;
  activatedAt?: string;
  expiresAt?: string;
  activationTx?: string;
};

export type PaymentRecord = {
  txSig: string;
  telegramUserId: string;
  plan: PlanId;
  activatedAt: string;
};

type DbShape = {
  entitlements: Record<string, EntitlementRecord>;
  payments: Record<string, PaymentRecord>;
};

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export class JsonStore {
  private data: DbShape;

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      this.data = JSON.parse(readFileSync(path, "utf8")) as DbShape;
    } else {
      this.data = { entitlements: {}, payments: {} };
      this.flush();
    }
  }

  private flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  getEntitlement(telegramUserId: string): EntitlementRecord {
    const existing = this.data.entitlements[telegramUserId];
    const today = dayKey();
    const month = monthKey();
    if (!existing) {
      const fresh: EntitlementRecord = {
        telegramUserId,
        plan: "free",
        checksUsedToday: 0,
        checksUsedMonth: 0,
        dayKey: today,
        monthKey: month,
      };
      this.data.entitlements[telegramUserId] = fresh;
      this.flush();
      return fresh;
    }
    let changed = false;
    if (existing.dayKey !== today) {
      existing.dayKey = today;
      existing.checksUsedToday = 0;
      changed = true;
    }
    if (existing.monthKey !== month) {
      existing.monthKey = month;
      existing.checksUsedMonth = 0;
      changed = true;
    }
    if (existing.expiresAt && Date.parse(existing.expiresAt) < Date.now()) {
      existing.plan = "free";
      existing.expiresAt = undefined;
      changed = true;
    }
    if (changed) this.flush();
    return existing;
  }

  incrementUsage(telegramUserId: string): EntitlementRecord {
    const row = this.getEntitlement(telegramUserId);
    row.checksUsedToday += 1;
    row.checksUsedMonth += 1;
    this.flush();
    return row;
  }

  paymentUsed(txSig: string): boolean {
    return Boolean(this.data.payments[txSig]);
  }

  activate(opts: {
    telegramUserId: string;
    plan: PlanId;
    txSig: string;
    days?: number;
  }): EntitlementRecord {
    if (this.paymentUsed(opts.txSig)) {
      throw new Error("Payment signature already used");
    }
    const now = new Date();
    const expires = new Date(now.getTime() + (opts.days ?? 30) * 86400000);
    const row = this.getEntitlement(opts.telegramUserId);
    row.plan = opts.plan;
    row.activatedAt = now.toISOString();
    row.expiresAt = expires.toISOString();
    row.activationTx = opts.txSig;
    this.data.payments[opts.txSig] = {
      txSig: opts.txSig,
      telegramUserId: opts.telegramUserId,
      plan: opts.plan,
      activatedAt: now.toISOString(),
    };
    this.flush();
    return row;
  }

  grant(telegramUserId: string, plan: PlanId, days = 30): EntitlementRecord {
    const row = this.getEntitlement(telegramUserId);
    const now = new Date();
    row.plan = plan;
    row.activatedAt = now.toISOString();
    row.expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
    this.flush();
    return row;
  }
}
