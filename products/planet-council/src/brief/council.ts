import type { Config, ModelId } from "../config.js";
import { configuredModels } from "../config.js";
import type { ScryEvidenceBundle } from "../scry/client.js";
import { COUNCIL_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { buildEdgeCard } from "./edge-card.js";

export type { ModelId };

export type ModelReply = {
  model: ModelId;
  ok: boolean;
  text: string;
  error?: string;
};

export type CouncilResult =
  | { ok: true; replies: ModelReply[] }
  | { ok: false; reason: string; replies: ModelReply[] };

async function callOpenAiCompatible(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  maxChars: number;
}): Promise<string> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as any;
  const text = body?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("LLM returned empty content");
  }
  return text.length > opts.maxChars
    ? `${text.slice(0, opts.maxChars - 14)}\n…[truncated]`
    : text;
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxChars: number;
}): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 1200,
      temperature: 0.2,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as any;
  const text = body?.content?.find((c: any) => c.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned empty content");
  return text.length > opts.maxChars
    ? `${text.slice(0, opts.maxChars - 14)}\n…[truncated]`
    : text;
}

function demoReply(model: ModelId, bundle: ScryEvidenceBundle): string {
  const card = buildEdgeCard(bundle);
  return [
    "## Evidence summary",
    `- Target \`${bundle.target}\` (${bundle.kind}), depth=${bundle.depth}.`,
    `- Synthetic demo mode — not live Scry coverage.`,
    `- Signals: ${card.signals.map((s) => s.key).join(", ") || "none"}.`,
    "## Council reading",
    `- (${model}) Interpretation only. No trade instruction.`,
    `- Use this path to validate Telegram formatting before wiring live credentials.`,
    "## What changed the picture",
    "- Demo placeholders for quarantine, lineage, and coverage.",
    "## Open questions",
    "- Confirm live Scry coverage/freshness for this target.",
    "## Confidence & coverage",
    "- Confidence: low (synthetic evidence).",
  ].join("\n");
}

async function runOne(
  cfg: Config,
  model: ModelId,
  user: string,
  bundle: ScryEvidenceBundle,
): Promise<ModelReply> {
  try {
    if (cfg.SCRY_MOCK && configuredModels(cfg).length === 0) {
      return { model, ok: true, text: demoReply(model, bundle) };
    }
    if (model === "claude") {
      if (!cfg.ANTHROPIC_API_KEY) {
        return { model, ok: false, text: "", error: "ANTHROPIC_API_KEY missing" };
      }
      return {
        model,
        ok: true,
        text: await callAnthropic({
          apiKey: cfg.ANTHROPIC_API_KEY,
          model: cfg.ANTHROPIC_MODEL,
          system: COUNCIL_SYSTEM_PROMPT,
          user,
          maxChars: cfg.MAX_MODEL_CHARS,
        }),
      };
    }
    if (model === "gpt") {
      if (!cfg.OPENAI_API_KEY) {
        return { model, ok: false, text: "", error: "OPENAI_API_KEY missing" };
      }
      return {
        model,
        ok: true,
        text: await callOpenAiCompatible({
          apiKey: cfg.OPENAI_API_KEY,
          baseUrl: "https://api.openai.com/v1",
          model: cfg.OPENAI_MODEL,
          system: COUNCIL_SYSTEM_PROMPT,
          user,
          maxChars: cfg.MAX_MODEL_CHARS,
        }),
      };
    }
    if (!cfg.XAI_API_KEY) {
      return { model, ok: false, text: "", error: "XAI_API_KEY missing" };
    }
    return {
      model,
      ok: true,
      text: await callOpenAiCompatible({
        apiKey: cfg.XAI_API_KEY,
        baseUrl: "https://api.x.ai/v1",
        model: cfg.XAI_MODEL,
        system: COUNCIL_SYSTEM_PROMPT,
        user,
        maxChars: cfg.MAX_MODEL_CHARS,
      }),
    };
  } catch (err: any) {
    return { model, ok: false, text: "", error: err?.message ?? String(err) };
  }
}

export function selectModels(cfg: Config, multiModel: boolean): ModelId[] {
  const available = configuredModels(cfg);
  if (cfg.SCRY_MOCK && available.length === 0) {
    return multiModel ? ["claude", "gpt", "grok"] : ["claude"];
  }
  if (!available.length) return [];
  if (!multiModel) return [available[0]];
  return available.slice(0, 3);
}

export async function runCouncil(opts: {
  cfg: Config;
  bundle: ScryEvidenceBundle;
  multiModel: boolean;
}): Promise<CouncilResult> {
  const card = buildEdgeCard(opts.bundle);
  if (!card.usable && !opts.bundle.synthetic) {
    return {
      ok: false,
      reason: "unusable_evidence",
      replies: [],
    };
  }

  const wanted = selectModels(opts.cfg, opts.multiModel);
  if (!wanted.length) {
    return { ok: false, reason: "no_models", replies: [] };
  }

  const user = buildUserPrompt(opts.bundle);
  const replies = await Promise.all(
    wanted.map((model) => runOne(opts.cfg, model, user, opts.bundle)),
  );

  if (!replies.some((r) => r.ok)) {
    if (opts.cfg.SCRY_MOCK) {
      return {
        ok: true,
        replies: [{ model: "claude", ok: true, text: demoReply("claude", opts.bundle) }],
      };
    }
    return { ok: false, reason: "unavailable", replies };
  }
  return { ok: true, replies };
}
