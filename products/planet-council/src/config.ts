import { z } from "zod";

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true");

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  PLANET_ADMIN_TELEGRAM_IDS: z.string().optional().default(""),
  SCRY_BASE_URL: z.string().url().default("https://scry.solanahub.de"),
  SCRY_INTERNAL_TOKEN: z.string().optional(),
  /** Explicit demo only. Default fail-closed: never silently mock live traffic. */
  SCRY_MOCK: boolish.default("0"),
  SCRY_TIMEOUT_MS: z.coerce.number().int().positive().default(12_000),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5"),
  XAI_API_KEY: z.string().optional(),
  XAI_MODEL: z.string().default("grok-3"),
  HELIUS_API_KEY: z.string().optional(),
  HELIUS_RPC_URL: z.string().default("https://mainnet.helius-rpc.com"),
  PLANET_PAYMENT_ADDRESS: z.string().optional(),
  PLANET_PAYMENT_ASSET: z.enum(["sol", "usdc"]).default("sol"),
  PLANET_PLUS_AMOUNT_SOL: z.coerce.number().default(0.08),
  PLANET_PRO_AMOUNT_SOL: z.coerce.number().default(0.25),
  PLANET_FOUNDER_AMOUNT_SOL: z.coerce.number().default(1.0),
  DATABASE_PATH: z.string().default("./data/planet-council.json"),
  FREE_CHECKS_PER_DAY: z.coerce.number().int().positive().default(3),
  MAX_BRIEF_CHARS: z.coerce.number().int().positive().default(3500),
  MAX_MODEL_CHARS: z.coerce.number().int().positive().default(2500),
  MAX_TARGET_CHARS: z.coerce.number().int().positive().default(64),
  SCAN_DEDUP_SECONDS: z.coerce.number().int().nonnegative().default(120),
});

export type Config = z.infer<typeof schema> & {
  adminTelegramIds: Set<string>;
};

export type ModelId = "claude" | "gpt" | "grok";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(env);
  const adminTelegramIds = new Set(
    parsed.PLANET_ADMIN_TELEGRAM_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return { ...parsed, adminTelegramIds };
}

export function configuredModels(cfg: Config): ModelId[] {
  const out: ModelId[] = [];
  if (cfg.ANTHROPIC_API_KEY) out.push("claude");
  if (cfg.OPENAI_API_KEY) out.push("gpt");
  if (cfg.XAI_API_KEY) out.push("grok");
  return out;
}
