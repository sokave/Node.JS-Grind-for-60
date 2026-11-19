import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { RecipeModel } from "../src/models/recipe.model";

let mongo: MongoMemoryServer | undefined;
let dataPath: string | undefined;

export async function setupTestDB(): Promise<void> {
  dataPath = await mkdtemp(join(process.cwd(), ".mongo-test-"));
  try {
    mongo = await MongoMemoryServer.create({
      instance: {
        dbPath: dataPath,
        args: process.platform === "win32" ? [] : ["--nounixsocket"],
      },
    });
    // Jest requires the MongoDB driver to receive the OS adapter explicitly.
    await mongoose.connect(mongo.getUri("recipes_test"), { runtimeAdapters: { os } });
    await RecipeModel.init();
  } catch (error) {
    await teardownTestDB();
    throw error;
  }
}

export async function clearTestDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await RecipeModel.deleteMany({});
  }
}

export async function teardownTestDB(): Promise<void> {
  try {
    await mongoose.disconnect();
  } finally {
    try {
      await mongo?.stop();
    } finally {
      mongo = undefined;
      if (dataPath) {
        await rm(dataPath, { recursive: true, force: true });
        dataPath = undefined;
      }
    }
  }
}
