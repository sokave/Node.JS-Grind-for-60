import "dotenv/config";
import { once } from "node:events";
import type { Server } from "node:http";
import { z } from "zod";
import app from "./app";
import { connectDB, disconnectDB } from "./config/database";
import { RecipeModel } from "./models/recipe.model";

async function shutdown(server: Server): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } finally {
    await disconnectDB();
  }
}

async function start(): Promise<void> {
  const port = z.coerce.number().int().min(1).max(65535).default(3000).parse(process.env.PORT);
  await connectDB();
  await RecipeModel.init();

  const server = app.listen(port);
  await once(server, "listening");
  console.log(`API рецептів доступне на http://localhost:${port}/api/recipes`);

  let stopping = false;
  const stop = (): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    void shutdown(server).catch((error: unknown) => {
      process.exitCode = 1;
      console.error("Помилка під час зупинки API", error instanceof Error ? error.name : "");
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void start().catch(async (error: unknown) => {
  process.exitCode = 1;
  const detail = !process.env.MONGODB_URI
    ? "вкажіть MONGODB_URI у файлі .env"
    : error instanceof Error ? error.name : "невідома причина";
  console.error("Не вдалося запустити API", detail);
  try {
    await disconnectDB();
  } catch {
    console.error("Не вдалося закрити з’єднання MongoDB");
  }
});
