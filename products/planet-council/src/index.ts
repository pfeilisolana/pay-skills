import { loadConfig } from "./config.js";
import { JsonStore } from "./billing/store.js";
import { createBot } from "./telegram/bot.js";

async function main() {
  const cfg = loadConfig();
  const store = new JsonStore(cfg.DATABASE_PATH);
  if (!cfg.TELEGRAM_BOT_TOKEN) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "noop",
          message:
            "TELEGRAM_BOT_TOKEN not set. Package is ready for review; export token to run the bot.",
          scryBaseUrl: cfg.SCRY_BASE_URL,
          mock: cfg.SCRY_MOCK,
          note: cfg.SCRY_MOCK
            ? "SCRY_MOCK=1 → synthetic demo evidence (explicit)."
            : "Fail-closed live mode: missing SCRY_INTERNAL_TOKEN will not silently mock.",
        },
        null,
        2,
      ),
    );
    return;
  }
  const bot = createBot(cfg, store);
  console.log(
    `Planet Council bot starting… mock=${cfg.SCRY_MOCK} scry=${cfg.SCRY_BASE_URL}`,
  );
  await bot.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
