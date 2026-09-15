import type { Config } from "../config.js";
import type { PlanId } from "./plans.js";

export type ActivationMatch = {
  plan: PlanId;
  lamports: number;
  destination: string;
};

export function matchSolActivation(
  tx: any,
  cfg: Pick<
    Config,
    | "PLANET_PAYMENT_ADDRESS"
    | "PLANET_PLUS_AMOUNT_SOL"
    | "PLANET_PRO_AMOUNT_SOL"
    | "PLANET_FOUNDER_AMOUNT_SOL"
  >,
): ActivationMatch | null {
  const destination = cfg.PLANET_PAYMENT_ADDRESS;
  if (!destination) return null;
  if (tx?.meta?.err) return null;

  const keys: string[] = (tx?.transaction?.message?.accountKeys ?? []).map(
    (k: any) => (typeof k === "string" ? k : k.pubkey),
  );
  const pre: number[] = tx?.meta?.preBalances ?? [];
  const post: number[] = tx?.meta?.postBalances ?? [];
  if (!keys.length || pre.length !== post.length) return null;

  const idx = keys.findIndex((k) => k === destination);
  if (idx < 0) return null;
  const delta = post[idx] - pre[idx];
  if (delta <= 0) return null;

  const sol = delta / 1_000_000_000;
  const plan = planForSolAmount(sol, cfg);
  if (!plan) return null;
  return { plan, lamports: delta, destination };
}

export function planForSolAmount(
  sol: number,
  cfg: Pick<
    Config,
    | "PLANET_PLUS_AMOUNT_SOL"
    | "PLANET_PRO_AMOUNT_SOL"
    | "PLANET_FOUNDER_AMOUNT_SOL"
  >,
): PlanId | null {
  const near = (have: number, need: number) => have + 1e-9 >= need * 0.95;
  if (near(sol, cfg.PLANET_FOUNDER_AMOUNT_SOL)) return "founder";
  if (near(sol, cfg.PLANET_PRO_AMOUNT_SOL)) return "pro";
  if (near(sol, cfg.PLANET_PLUS_AMOUNT_SOL)) return "plus";
  return null;
}

export async function fetchTransaction(
  signature: string,
  cfg: Pick<Config, "HELIUS_API_KEY" | "HELIUS_RPC_URL">,
): Promise<any> {
  const url = cfg.HELIUS_API_KEY
    ? `${cfg.HELIUS_RPC_URL}/?api-key=${cfg.HELIUS_API_KEY}`
    : cfg.HELIUS_RPC_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        signature,
        { encoding: "json", maxSupportedTransactionVersion: 0 },
      ],
    }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as any;
  if (body.error) throw new Error(body.error.message ?? "RPC error");
  return body.result;
}
