import { createApp } from "./app.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

createApp().listen(PORT, () => {
  console.log(`@games/server listening on :${PORT}`);
});
