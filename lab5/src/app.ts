import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { errorHandler, NotFoundError } from "./middleware/error-handler";
import recipesRouter from "./routes/recipes";

const app = express();
const { version }: { version: string } = require("../package.json");

app.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
    version,
  });
});
app.use(cors());
app.use(express.json());
app.use("/api/recipes", recipesRouter);
app.use(() => {
  throw new NotFoundError("Маршрут не знайдено");
});
app.use(errorHandler);

export default app;
