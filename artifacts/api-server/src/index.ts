import app from "./app";
import { logger } from "./lib/logger";
import { startBot } from "./bot/index";

// Start Telegram bot (non-blocking)
startBot().catch((err) => logger.error({ err }, "Bot failed to start"));

// Port 3000 is required by the reverse proxy infrastructure
const port = 3000;

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, `Server listening on http://0.0.0.0:${port}`);
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
