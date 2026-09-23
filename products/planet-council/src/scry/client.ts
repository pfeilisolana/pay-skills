import type { Config } from "../config.js";

export type RouteHit = {
  route: string;
  ok: boolean;
  status?: number;
  body: unknown;
  priceUsd: number;
};

export type ScryEvidenceBundle = {
  target: string;
  kind: "wallet" | "mint" | "connection" | "deployer" | "cohort";
  depth: "shallow" | "deep";
  fetchedAt: string;
  routes: RouteHit[];
  synthetic: boolean;
  ok: boolean;
  reason?: string;
};

export type EvidenceResult =
  | { ok: true; bundle: ScryEvidenceBundle }
  | { ok: false; reason: string; bundle?: ScryEvidenceBundle };

const PRICE: Record<string, number> = {
  "quick-flag": 0.001,
  "bundler-check": 0.01,
  lineage: 0.03,
  forensics: 0.05,
  "/risk": 0.03,
  "launch-dossier": 0.3,
  "deployer-summary": 0.39,
  connection: 0.04,
  "watchlist-snapshot": 0.05,
  "hot-wallets/daily": 0.1,
  "pumpfun-risk-protection": 0.05,
};

function priceFor(path: string): number {
  for (const [k, v] of Object.entries(PRICE)) {
    if (path.includes(k)) return v;
  }
  return 0;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

async function scryGet(
  cfg: Config,
  path: string,
): Promise<RouteHit> {
  const url = `${cfg.SCRY_BASE_URL}${path}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (cfg.SCRY_INTERNAL_TOKEN) {
    headers.authorization = `Bearer ${cfg.SCRY_INTERNAL_TOKEN}`;
    headers["x-scry-internal-token"] = cfg.SCRY_INTERNAL_TOKEN;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.SCRY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return {
      route: path,
      ok: res.ok,
      status: res.status,
      body,
      priceUsd: res.ok ? priceFor(path) : 0,
    };
  } catch (err: any) {
    return {
      route: path,
      ok: false,
      status: 0,
      body: { error: err?.message ?? String(err) },
      priceUsd: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

function subjectMatches(body: unknown, target: string, fields: string[]): boolean {
  const rec = asRecord(body);
  if (!rec) return true; // non-object success still counted; edge card will mark thin
  for (const f of fields) {
    const v = rec[f];
    if (typeof v === "string" && v.length > 20) {
      return v === target;
    }
  }
  return true;
}

function mockWallet(address: string, deep: boolean): ScryEvidenceBundle {
  const routes: RouteHit[] = [
    {
      route: `/x402/wallet/${address}/quick-flag`,
      ok: true,
      status: 200,
      priceUsd: 0.001,
      body: {
        address,
        synthetic: true,
        mock: true,
        supported: true,
        in_db: true,
        quarantine: { is_known_service: false },
        bundler_hint: { observed: false },
        coverage: { status: "partial", confidence: 0.62, missing_fields: ["holdings"] },
        confidence_score: 0.62,
        as_of: "2026-09-23T00:00:00Z",
        caveat: "Synthetic demo evidence. Not live Scry data.",
      },
    },
  ];
  if (deep) {
    routes.push(
      {
        route: `/x402/wallet/${address}/forensics`,
        ok: true,
        status: 200,
        priceUsd: 0.05,
        body: {
          address,
          synthetic: true,
          mock: true,
          identity: { x_handle: "demo_handle" },
          funding_lineage: { hops: 2 },
          cluster: { members_indexed: 4 },
          coverage: { status: "partial" },
          confidence_score: 0.7,
          as_of: "2026-09-23T00:00:00Z",
          caveat: "Synthetic demo evidence. Not live Scry data.",
        },
      },
      {
        route: `/x402/wallet/${address}/lineage`,
        ok: true,
        status: 200,
        priceUsd: 0.03,
        body: {
          address,
          synthetic: true,
          mock: true,
          upstream: [{ address: "MockFunder1111111111111111111111111111111" }],
          hop_count: 2,
          coverage: { status: "partial" },
          as_of: "2026-09-23T00:00:00Z",
          caveat: "Synthetic demo evidence. Not live Scry data.",
        },
      },
    );
  }
  return {
    target: address,
    kind: "wallet",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes,
    synthetic: true,
    ok: true,
  };
}

function mockMint(mint: string, deep: boolean): ScryEvidenceBundle {
  const routes: RouteHit[] = [
    {
      route: `/x402/mint/${mint}/risk`,
      ok: true,
      status: 200,
      priceUsd: 0.03,
      body: {
        mint,
        synthetic: true,
        mock: true,
        supported: true,
        risk: "WATCH",
        risk_score: 0.42,
        holder_concentration_pct_proxy: 48.2,
        creator_wallet: "MockCreator111111111111111111111111111111",
        rug_evidence: { flags: ["mock_low_liquidity"] },
        coverage: { status: "partial", missing_fields: ["liquidity_depth"] },
        confidence_score: 0.55,
        as_of: "2026-09-23T00:00:00Z",
        caveat: "Synthetic demo evidence. Not live Scry data.",
      },
    },
  ];
  if (deep) {
    routes.push({
      route: `/x402/pumpfun/launch-dossier?mint=${mint}`,
      ok: true,
      status: 200,
      priceUsd: 0.3,
      body: {
        mint,
        synthetic: true,
        mock: true,
        creator: "MockCreator111111111111111111111111111111",
        launch_window: { seconds: 120 },
        coverage: { status: "partial" },
        as_of: "2026-09-23T00:00:00Z",
        caveat: "Synthetic demo evidence. Not live Scry data.",
      },
    });
  }
  return {
    target: mint,
    kind: "mint",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes,
    synthetic: true,
    ok: true,
  };
}

/** Decide which deep routes to buy after a shallow pull — spend only when justified. */
export function selectWalletDeepRoutes(
  address: string,
  quick: RouteHit,
  opts: { pro: boolean },
): string[] {
  const body = asRecord(quick.body) ?? {};
  const paths: string[] = [];
  const quarantined =
    body.service_quarantined === true ||
    asRecord(body.quarantine)?.is_known_service === true;
  const unsupported = body.supported === false;

  // Always stop early on quarantine/unsupported for free-ish triage; paid still may want dossier.
  if (unsupported && !opts.pro) return paths;

  const bundlerHint =
    asRecord(body.bundler_hint)?.observed === true ||
    asRecord(body.quick_flags)?.bundler_hint === true ||
    body.bundler_hint === true;

  // Core deep ladder: forensics + lineage are the highest-edge pair for humans.
  paths.push(`/x402/wallet/${address}/forensics`);
  paths.push(`/x402/wallet/${address}/lineage`);
  if (bundlerHint || opts.pro) {
    paths.push(`/x402/wallet/${address}/bundler-check`);
  }
  if (opts.pro && !quarantined) {
    paths.push(`/x402/wallet/${address}/full-context-pro`);
  }
  return paths;
}

export function selectMintDeepRoutes(mint: string, risk: RouteHit): string[] {
  const body = asRecord(risk.body) ?? {};
  const paths = [`/x402/pumpfun/launch-dossier?mint=${encodeURIComponent(mint)}`];
  const creator =
    (typeof body.creator_wallet === "string" && body.creator_wallet) ||
    (typeof body.creator === "string" && body.creator) ||
    null;
  if (creator) {
    paths.push(`/x402/deployer-summary?address=${encodeURIComponent(creator)}`);
  }
  return paths;
}

export async function fetchWalletEvidence(
  cfg: Config,
  address: string,
  deep: boolean,
  opts: { pro?: boolean } = {},
): Promise<EvidenceResult> {
  if (cfg.SCRY_MOCK) {
    return { ok: true, bundle: mockWallet(address, deep) };
  }
  if (!cfg.SCRY_INTERNAL_TOKEN) {
    return {
      ok: false,
      reason:
        "Live Scry credentials are not configured (SCRY_INTERNAL_TOKEN). Refusing silent mock.",
    };
  }

  const routes: RouteHit[] = [];
  const quick = await scryGet(cfg, `/x402/wallet/${address}/quick-flag`);
  routes.push(quick);
  if (quick.ok && !subjectMatches(quick.body, address, ["address"])) {
    return {
      ok: false,
      reason: "Scry returned evidence for a different wallet (wrong_subject).",
      bundle: {
        target: address,
        kind: "wallet",
        depth: "shallow",
        fetchedAt: new Date().toISOString(),
        routes,
        synthetic: false,
        ok: false,
        reason: "wrong_subject",
      },
    };
  }

  if (deep && quick.ok) {
    const deeper = selectWalletDeepRoutes(address, quick, {
      pro: Boolean(opts.pro),
    });
    const hits = await Promise.all(deeper.map((p) => scryGet(cfg, p)));
    routes.push(...hits);
  }

  const ok = routes.some((r) => r.ok);
  const bundle: ScryEvidenceBundle = {
    target: address,
    kind: "wallet",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes,
    synthetic: false,
    ok,
    reason: ok ? undefined : "all_routes_failed",
  };
  if (!ok) {
    return {
      ok: false,
      reason: "Scry wallet routes failed or returned no usable evidence.",
      bundle,
    };
  }
  return { ok: true, bundle };
}

export async function fetchMintEvidence(
  cfg: Config,
  mint: string,
  deep: boolean,
): Promise<EvidenceResult> {
  if (cfg.SCRY_MOCK) {
    return { ok: true, bundle: mockMint(mint, deep) };
  }
  if (!cfg.SCRY_INTERNAL_TOKEN) {
    return {
      ok: false,
      reason:
        "Live Scry credentials are not configured (SCRY_INTERNAL_TOKEN). Refusing silent mock.",
    };
  }

  const routes: RouteHit[] = [];
  const risk = await scryGet(cfg, `/x402/mint/${mint}/risk`);
  routes.push(risk);
  if (risk.ok && !subjectMatches(risk.body, mint, ["mint"])) {
    return {
      ok: false,
      reason: "Scry returned evidence for a different mint (wrong_subject).",
      bundle: {
        target: mint,
        kind: "mint",
        depth: "shallow",
        fetchedAt: new Date().toISOString(),
        routes,
        synthetic: false,
        ok: false,
        reason: "wrong_subject",
      },
    };
  }

  if (deep && risk.ok) {
    const deeper = selectMintDeepRoutes(mint, risk);
    const hits = await Promise.all(deeper.map((p) => scryGet(cfg, p)));
    routes.push(...hits);
  }

  const ok = routes.some((r) => r.ok);
  const bundle: ScryEvidenceBundle = {
    target: mint,
    kind: "mint",
    depth: deep ? "deep" : "shallow",
    fetchedAt: new Date().toISOString(),
    routes,
    synthetic: false,
    ok,
    reason: ok ? undefined : "all_routes_failed",
  };
  if (!ok) {
    return {
      ok: false,
      reason: "Scry mint routes failed or returned no usable evidence.",
      bundle,
    };
  }
  return { ok: true, bundle };
}

export async function fetchConnectionEvidence(
  cfg: Config,
  a: string,
  b: string,
): Promise<EvidenceResult> {
  if (cfg.SCRY_MOCK) {
    return {
      ok: true,
      bundle: {
        target: `${a}↔${b}`,
        kind: "connection",
        depth: "shallow",
        fetchedAt: new Date().toISOString(),
        synthetic: true,
        ok: true,
        routes: [
          {
            route: `/x402/wallet/connection?a=${a}&b=${b}`,
            ok: true,
            status: 200,
            priceUsd: 0.04,
            body: {
              synthetic: true,
              mock: true,
              a,
              b,
              connected: true,
              hop_distance: 2,
              coverage: { status: "partial" },
              caveat: "Synthetic demo evidence. Not live Scry data.",
              as_of: "2026-09-23T00:00:00Z",
            },
          },
        ],
      },
    };
  }
  if (!cfg.SCRY_INTERNAL_TOKEN) {
    return {
      ok: false,
      reason:
        "Live Scry credentials are not configured (SCRY_INTERNAL_TOKEN). Refusing silent mock.",
    };
  }
  const path = `/x402/wallet/connection?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
  const hit = await scryGet(cfg, path);
  const bundle: ScryEvidenceBundle = {
    target: `${a}↔${b}`,
    kind: "connection",
    depth: "shallow",
    fetchedAt: new Date().toISOString(),
    routes: [hit],
    synthetic: false,
    ok: hit.ok,
  };
  if (!hit.ok) {
    return { ok: false, reason: "Wallet connection evidence unavailable.", bundle };
  }
  return { ok: true, bundle };
}

export async function fetchDeployerEvidence(
  cfg: Config,
  address: string,
): Promise<EvidenceResult> {
  if (cfg.SCRY_MOCK) {
    return {
      ok: true,
      bundle: {
        target: address,
        kind: "deployer",
        depth: "deep",
        fetchedAt: new Date().toISOString(),
        synthetic: true,
        ok: true,
        routes: [
          {
            route: `/x402/deployer-summary?address=${address}`,
            ok: true,
            status: 200,
            priceUsd: 0.39,
            body: {
              address,
              synthetic: true,
              mock: true,
              launches_observed: 3,
              related_wallets: 2,
              coverage: { status: "partial" },
              caveat: "Synthetic demo evidence. Not live Scry data.",
              as_of: "2026-09-23T00:00:00Z",
            },
          },
        ],
      },
    };
  }
  if (!cfg.SCRY_INTERNAL_TOKEN) {
    return {
      ok: false,
      reason:
        "Live Scry credentials are not configured (SCRY_INTERNAL_TOKEN). Refusing silent mock.",
    };
  }
  const path = `/x402/deployer-summary?address=${encodeURIComponent(address)}`;
  const hit = await scryGet(cfg, path);
  const bundle: ScryEvidenceBundle = {
    target: address,
    kind: "deployer",
    depth: "deep",
    fetchedAt: new Date().toISOString(),
    routes: [hit],
    synthetic: false,
    ok: hit.ok,
  };
  if (!hit.ok) {
    return { ok: false, reason: "Deployer summary unavailable.", bundle };
  }
  return { ok: true, bundle };
}

export async function fetchWatchlistSnapshot(
  cfg: Config,
  addresses: string[],
): Promise<EvidenceResult> {
  const capped = addresses.slice(0, 25);
  if (cfg.SCRY_MOCK) {
    return {
      ok: true,
      bundle: {
        target: `watchlist:${capped.length}`,
        kind: "cohort",
        depth: "shallow",
        fetchedAt: new Date().toISOString(),
        synthetic: true,
        ok: true,
        routes: [
          {
            route: `/x402/wallet/watchlist-snapshot`,
            ok: true,
            status: 200,
            priceUsd: 0.05,
            body: {
              synthetic: true,
              mock: true,
              addresses: capped,
              coverage: { status: "partial" },
              caveat: "Synthetic demo evidence. Not live Scry data.",
              as_of: "2026-09-23T00:00:00Z",
            },
          },
        ],
      },
    };
  }
  if (!cfg.SCRY_INTERNAL_TOKEN) {
    return {
      ok: false,
      reason:
        "Live Scry credentials are not configured (SCRY_INTERNAL_TOKEN). Refusing silent mock.",
    };
  }
  // Prefer snapshot endpoint; fall back to parallel quick-flags for small lists.
  if (capped.length >= 3) {
    const q = capped.map((a) => `address=${encodeURIComponent(a)}`).join("&");
    const hit = await scryGet(cfg, `/x402/wallet/watchlist-snapshot?${q}`);
    if (hit.ok) {
      return {
        ok: true,
        bundle: {
          target: `watchlist:${capped.length}`,
          kind: "cohort",
          depth: "shallow",
          fetchedAt: new Date().toISOString(),
          routes: [hit],
          synthetic: false,
          ok: true,
        },
      };
    }
  }
  const hits = await Promise.all(
    capped.map((a) => scryGet(cfg, `/x402/wallet/${a}/quick-flag`)),
  );
  const ok = hits.some((h) => h.ok);
  const bundle: ScryEvidenceBundle = {
    target: `watchlist:${capped.length}`,
    kind: "cohort",
    depth: "shallow",
    fetchedAt: new Date().toISOString(),
    routes: hits,
    synthetic: false,
    ok,
  };
  if (!ok) return { ok: false, reason: "Watchlist refresh failed.", bundle };
  return { ok: true, bundle };
}

export async function fetchPlanetOffers(cfg: Config): Promise<unknown> {
  if (cfg.SCRY_MOCK) {
    return {
      offers: [
        { id: "planet-free", price_usd_cents: 0 },
        { id: "planet-plus-monthly", price_usd_cents: 999 },
        { id: "planet-pro-monthly", price_usd_cents: 2999 },
        { id: "scry-dossier-standard", price_usd_cents: 24900 },
      ],
      checkout_note: "manual_intake_until_checkout_configured",
      revenue_priority: [
        "planet_solana_wallet_watch",
        "scry_forensics_dossier",
        "x402_scry_data_api",
      ],
    };
  }
  const res = await scryGet(cfg, "/api/planet/offers");
  return res.body;
}
