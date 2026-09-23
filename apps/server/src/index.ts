import { createApp } from "./app.js";
import { resolveDefaultDbPath } from "./progress/db.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const dbPath = process.env.QUEST_DB_PATH ?? resolveDefaultDbPath();

createApp({ dbPath }).listen(PORT, () => {
  console.log(`@games/server listening on :${PORT} (db: ${dbPath})`);
});
