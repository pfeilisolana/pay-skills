import type { Config } from "../config.js";
import type { ScryEvidenceBundle } from "../scry/client.js";
import { COUNCIL_SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

export type ModelId = "claude" | "gpt" | "grok";

export type ModelReply = {
  model: ModelId;
  ok: boolean;
  text: string;
  error?: string;
};

async function callOpenAiCompatible(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
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
  return text;
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
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
  return text;
}

function mockReply(model: ModelId, bundle: ScryEvidenceBundle): string {
  return [
    "## Evidence summary",
    `- Target \`${bundle.target}\` (${bundle.kind}), depth=${bundle.depth}.`,
    `- Routes: ${bundle.routes.map((r) => r.route).join(", ") || "none"}.`,
    `- Mock mode: placeholders for local testing.`,
    "## Council reading",
    `- (${model}) Interpretation only. No trade instruction.`,
    `- Treat coverage as partial until live Scry credentials are configured.`,
    "## Open questions",
    "- Confirm live Scry coverage/freshness for this target.",
    "- Check whether deeper lineage/forensics changes the picture.",
    "## Confidence & coverage",
    "- Confidence: low (mock evidence).",
  ].join("\n");
}

export async function runCouncil(opts: {
  cfg: Config;
  bundle: ScryEvidenceBundle;
  multiModel: boolean;
}): Promise<ModelReply[]> {
  const user = buildUserPrompt(opts.bundle);
  const wanted: ModelId[] = opts.multiModel
    ? ["claude", "gpt", "grok"]
    : ["claude"];
  const out: ModelReply[] = [];

  for (const model of wanted) {
    try {
      if (
        opts.cfg.SCRY_MOCK &&
        !opts.cfg.ANTHROPIC_API_KEY &&
        !opts.cfg.OPENAI_API_KEY &&
        !opts.cfg.XAI_API_KEY
      ) {
        out.push({ model, ok: true, text: mockReply(model, opts.bundle) });
        continue;
      }
      if (model === "claude") {
        if (!opts.cfg.ANTHROPIC_API_KEY) {
          out.push({
            model,
            ok: false,
            text: "",
            error: "ANTHROPIC_API_KEY missing",
          });
          continue;
        }
        out.push({
          model,
          ok: true,
          text: await callAnthropic({
            apiKey: opts.cfg.ANTHROPIC_API_KEY,
            model: opts.cfg.ANTHROPIC_MODEL,
            system: COUNCIL_SYSTEM_PROMPT,
            user,
          }),
        });
      } else if (model === "gpt") {
        if (!opts.cfg.OPENAI_API_KEY) {
          out.push({
            model,
            ok: false,
            text: "",
            error: "OPENAI_API_KEY missing",
          });
          continue;
        }
        out.push({
          model,
          ok: true,
          text: await callOpenAiCompatible({
            apiKey: opts.cfg.OPENAI_API_KEY,
            baseUrl: "https://api.openai.com/v1",
            model: opts.cfg.OPENAI_MODEL,
            system: COUNCIL_SYSTEM_PROMPT,
            user,
          }),
        });
      } else {
        if (!opts.cfg.XAI_API_KEY) {
          out.push({
            model,
            ok: false,
            text: "",
            error: "XAI_API_KEY missing",
          });
          continue;
        }
        out.push({
          model,
          ok: true,
          text: await callOpenAiCompatible({
            apiKey: opts.cfg.XAI_API_KEY,
            baseUrl: "https://api.x.ai/v1",
            model: opts.cfg.XAI_MODEL,
            system: COUNCIL_SYSTEM_PROMPT,
            user,
          }),
        });
      }
    } catch (err: any) {
      out.push({
        model,
        ok: false,
        text: "",
        error: err?.message ?? String(err),
      });
    }
  }

  if (!out.some((r) => r.ok)) {
    out.push({
      model: "claude",
      ok: true,
      text: mockReply("claude", opts.bundle),
    });
  }
  return out;
}
