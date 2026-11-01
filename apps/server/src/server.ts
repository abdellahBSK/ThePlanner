import { join } from "node:path";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { startReminderLoop } from "./reminders";

const config = loadConfig();
// The production build serves the web app from apps/web/dist unless WEB_DIST says otherwise.
config.webDist ??= join(__dirname, "../../web/dist");

const db = openDb(join(config.dataDir, "theplanner.db"));
const { app, repo } = createApp(db, config);
const stopReminders = startReminderLoop(repo, config);

const server = app.listen(config.port, () => {
  console.log(`ThePlanner is running at ${config.publicUrl}`);
});

function shutdown() {
  stopReminders();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
