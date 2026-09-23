import type { Config } from "../config.js";

export type IntakeOfferId =
  | "planet-plus-monthly"
  | "planet-pro-monthly"
  | "planet-founder"
  | "scry-dossier-standard"
  | "scry-case-priority";

export type IntakeRequest = {
  offerId: IntakeOfferId;
  telegramUserId: string;
  telegramUsername?: string;
  objectType?: "wallet" | "token_or_mint" | "operator_cluster" | "watchlist" | "other";
  object?: string;
  useCase?: string;
  urgency?: "standard" | "priority" | "exploring" | "this_week" | "urgent" | "not_sure";
  notes?: string;
};

export type IntakeResult =
  | {
      ok: true;
      intakeId: string;
      offerId: string;
      nextStep?: string;
      synthetic: boolean;
      raw?: unknown;
    }
  | { ok: false; reason: string; synthetic: boolean; raw?: unknown };

const OFFER_ALIASES: Record<string, IntakeOfferId> = {
  plus: "planet-plus-monthly",
  "planet-plus": "planet-plus-monthly",
  "planet-plus-monthly": "planet-plus-monthly",
  pro: "planet-pro-monthly",
  "planet-pro": "planet-pro-monthly",
  "planet-pro-monthly": "planet-pro-monthly",
  founder: "planet-founder",
  "planet-founder": "planet-founder",
  dossier: "scry-dossier-standard",
  "scry-dossier": "scry-dossier-standard",
  "scry-dossier-standard": "scry-dossier-standard",
  case: "scry-case-priority",
  priority: "scry-case-priority",
  "scry-case-priority": "scry-case-priority",
};

export function resolveOfferId(raw: string): IntakeOfferId | null {
  return OFFER_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function offerLabel(id: IntakeOfferId): string {
  switch (id) {
    case "planet-plus-monthly":
      return "Planet Plus ($9.99/mo)";
    case "planet-pro-monthly":
      return "Planet Pro ($29.99/mo)";
    case "planet-founder":
      return "Planet Founder ($99)";
    case "scry-dossier-standard":
      return "Scry Forensics Dossier (~$249)";
    case "scry-case-priority":
      return "Scry Priority Case (from ~$799)";
  }
}

export async function submitPlanetIntake(
  cfg: Config,
  req: IntakeRequest,
): Promise<IntakeResult> {
  const contact = req.telegramUsername
    ? `tg:@${req.telegramUsername.replace(/^@/, "")}`
    : `tg:${req.telegramUserId}`;

  const payload = {
    offer_id: req.offerId,
    package: req.offerId,
    contact,
    contact_value: contact,
    contact_channel: "telegram",
    consent_to_contact: true,
    consent: true,
    object_type: req.objectType ?? "other",
    object: req.object?.slice(0, 160),
    use_case: (req.useCase ?? "Telegram Planet Council request").slice(0, 800),
    urgency: req.urgency ?? "standard",
    notes: (req.notes ?? "").slice(0, 1200),
    source_channel: "telegram_planet_council",
    source_campaign: "scry_lane",
    source_medium: "bot",
    preferred_output: "telegram_reply",
  };

  if (cfg.SCRY_MOCK) {
    return {
      ok: true,
      intakeId: `intake_mock_${Date.now().toString(36)}`,
      offerId: req.offerId,
      nextStep: "manual_review_then_reply",
      synthetic: true,
      raw: { ok: true, mock: true, payload },
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.SCRY_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.SCRY_BASE_URL}/api/planet/intake`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep */
    }
    const rec = body && typeof body === "object" ? (body as any) : {};
    if (!res.ok || rec.ok === false || rec.error) {
      return {
        ok: false,
        reason:
          typeof rec.error === "string"
            ? rec.error
            : `Intake HTTP ${res.status}`,
        synthetic: false,
        raw: body,
      };
    }
    return {
      ok: true,
      intakeId: String(rec.intake_id ?? "unknown"),
      offerId: String(rec.offer_id ?? req.offerId),
      nextStep:
        typeof rec.next_step === "string" ? rec.next_step : undefined,
      synthetic: false,
      raw: body,
    };
  } catch (err: any) {
    return {
      ok: false,
      reason: err?.message ?? String(err),
      synthetic: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
