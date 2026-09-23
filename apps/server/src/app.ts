import express, { type Express } from "express";
import { dialogueRouter } from "./routes/dialogue.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", dialogueRouter);
  return app;
}
