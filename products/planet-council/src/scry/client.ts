import type { Config } from "../config.js";

export type ScryEvidenceBundle = {
  target: string;
  kind: "wallet" | "mint";
  depth: "shallow" | "deep";
  fetchedAt: string;
  routes: Array<{ route: string; ok: boolean; status?: number; body: unknown }>;
};

async function scryGet(
  cfg: Config,
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${cfg.SCRY_BASE_URL}${path}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (cfg.SCRY_INTERNAL_TOKEN) {
    headers.authorization = `Bearer ${cfg.SCRY_INTERNAL_TOKEN}`;
    headers["x-scry-internal-token"] = cfg.SCRY_INTERNAL_TOKEN;
  }
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, body };
}

function mockWallet(address: string, deep: boolean): ScryEvidenceBundle {
  return {
    target: address,
    kind: "wallet",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes: [
      {
        route: `/x402/wallet/${address}/quick-flag`,
        ok: true,
        status: 200,
        body: {
          address,
          quarantine: { is_known_service: false },
          bundler_hint: { observed: false },
          coverage: { status: "partial", score: 0.62 },
          freshness: { as_of: "2026-09-15T00:00:00Z" },
          mock: true,
        },
      },
      ...(deep
        ? [
            {
              route: `/x402/wallet/${address}/forensics`,
              ok: true,
              status: 200,
              body: {
                address,
                funding_lineage: { hops: 2, notes: "mock upstream" },
                cluster: { members_indexed: 4 },
                coverage: { status: "partial" },
                mock: true,
              },
            },
            {
              route: `/x402/wallet/${address}/lineage`,
              ok: true,
              status: 200,
              body: {
                address,
                upstream: [
                  { address: "MockFunder1111111111111111111111111111111" },
                ],
                mock: true,
              },
            },
          ]
        : []),
    ],
  };
}

function mockMint(mint: string, deep: boolean): ScryEvidenceBundle {
  return {
    target: mint,
    kind: "mint",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes: [
      {
        route: `/x402/mint/${mint}/risk`,
        ok: true,
        status: 200,
        body: {
          mint,
          holder_concentration: { top10_pct: 48.2 },
          rug_evidence: { flags: ["mock_low_liquidity"] },
          coverage: { status: "partial" },
          mock: true,
        },
      },
      ...(deep
        ? [
            {
              route: `/x402/pumpfun/launch-dossier?mint=${mint}`,
              ok: true,
              status: 200,
              body: {
                mint,
                creator: "MockCreator111111111111111111111111111111",
                launch_window: { seconds: 120 },
                mock: true,
              },
            },
          ]
        : []),
    ],
  };
}

export async function fetchWalletEvidence(
  cfg: Config,
  address: string,
  deep: boolean,
): Promise<ScryEvidenceBundle> {
  if (cfg.SCRY_MOCK || !cfg.SCRY_INTERNAL_TOKEN) {
    return mockWallet(address, deep);
  }
  const routes: ScryEvidenceBundle["routes"] = [];
  const quick = await scryGet(cfg, `/x402/wallet/${address}/quick-flag`);
  routes.push({ route: `/x402/wallet/${address}/quick-flag`, ...quick });
  if (deep) {
    for (const path of [
      `/x402/wallet/${address}/forensics`,
      `/x402/wallet/${address}/lineage`,
      `/x402/wallet/${address}/bundler-check`,
    ]) {
      const r = await scryGet(cfg, path);
      routes.push({ route: path, ...r });
    }
  }
  return {
    target: address,
    kind: "wallet",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes,
  };
}

export async function fetchMintEvidence(
  cfg: Config,
  mint: string,
  deep: boolean,
): Promise<ScryEvidenceBundle> {
  if (cfg.SCRY_MOCK || !cfg.SCRY_INTERNAL_TOKEN) {
    return mockMint(mint, deep);
  }
  const routes: ScryEvidenceBundle["routes"] = [];
  const risk = await scryGet(cfg, `/x402/mint/${mint}/risk`);
  routes.push({ route: `/x402/mint/${mint}/risk`, ...risk });
  if (deep) {
    const dossier = await scryGet(
      cfg,
      `/x402/pumpfun/launch-dossier?mint=${encodeURIComponent(mint)}`,
    );
    routes.push({
      route: `/x402/pumpfun/launch-dossier?mint=${mint}`,
      ...dossier,
    });
  }
  return {
    target: mint,
    kind: "mint",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes,
  };
}

export async function fetchPlanetOffers(cfg: Config): Promise<unknown> {
  if (cfg.SCRY_MOCK) {
    return {
      offers: [
        { id: "planet-free", price_usd_cents: 0 },
        { id: "planet-plus-monthly", price_usd_cents: 999 },
        { id: "planet-pro-monthly", price_usd_cents: 2999 },
      ],
      checkout_note: "manual_intake_until_checkout_configured",
    };
  }
  const res = await scryGet(cfg, "/api/planet/offers");
  return res.body;
}
