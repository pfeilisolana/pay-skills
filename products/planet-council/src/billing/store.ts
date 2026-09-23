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
  watchlist: string[];
};

export type PaymentRecord = {
  txSig: string;
  telegramUserId: string;
  plan: PlanId;
  activatedAt: string;
};

export type ScanCacheRecord = {
  key: string;
  brief: string;
  createdAt: string;
};

type DbShape = {
  entitlements: Record<string, EntitlementRecord>;
  payments: Record<string, PaymentRecord>;
  scanCache: Record<string, ScanCacheRecord>;
};

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function ensureWatchlist(row: EntitlementRecord): EntitlementRecord {
  if (!Array.isArray(row.watchlist)) row.watchlist = [];
  return row;
}

export class JsonStore {
  private data: DbShape;

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<DbShape>;
      this.data = {
        entitlements: parsed.entitlements ?? {},
        payments: parsed.payments ?? {},
        scanCache: parsed.scanCache ?? {},
      };
    } else {
      this.data = { entitlements: {}, payments: {}, scanCache: {} };
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
        watchlist: [],
      };
      this.data.entitlements[telegramUserId] = fresh;
      this.flush();
      return fresh;
    }
    ensureWatchlist(existing);
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

  listWatchlist(telegramUserId: string): string[] {
    return [...this.getEntitlement(telegramUserId).watchlist];
  }

  addWatch(
    telegramUserId: string,
    address: string,
    cap: number,
  ): { ok: true; watchlist: string[] } | { ok: false; reason: string } {
    const row = this.getEntitlement(telegramUserId);
    if (cap <= 0) {
      return {
        ok: false,
        reason: "Watchlist requires Plus/Pro. /plans to upgrade.",
      };
    }
    if (row.watchlist.includes(address)) {
      return { ok: true, watchlist: [...row.watchlist] };
    }
    if (row.watchlist.length >= cap) {
      return {
        ok: false,
        reason: `Watchlist full (${cap}). /unwatch one first or upgrade.`,
      };
    }
    row.watchlist.push(address);
    this.flush();
    return { ok: true, watchlist: [...row.watchlist] };
  }

  removeWatch(
    telegramUserId: string,
    address: string,
  ): { ok: true; watchlist: string[] } {
    const row = this.getEntitlement(telegramUserId);
    row.watchlist = row.watchlist.filter((a) => a !== address);
    this.flush();
    return { ok: true, watchlist: [...row.watchlist] };
  }

  getCachedBrief(key: string, maxAgeSeconds: number): string | null {
    if (maxAgeSeconds <= 0) return null;
    const hit = this.data.scanCache[key];
    if (!hit) return null;
    const age = (Date.now() - Date.parse(hit.createdAt)) / 1000;
    if (age > maxAgeSeconds) {
      delete this.data.scanCache[key];
      this.flush();
      return null;
    }
    return hit.brief;
  }

  putCachedBrief(key: string, brief: string) {
    this.data.scanCache[key] = {
      key,
      brief,
      createdAt: new Date().toISOString(),
    };
    // Keep cache bounded
    const keys = Object.keys(this.data.scanCache);
    if (keys.length > 200) {
      const sorted = keys
        .map((k) => this.data.scanCache[k])
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      for (const old of sorted.slice(0, keys.length - 200)) {
        delete this.data.scanCache[old.key];
      }
    }
    this.flush();
  }
}
