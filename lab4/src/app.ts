import cors from "cors";
import express from "express";
import { errorHandler, NotFoundError } from "./middleware/error-handler";
import recipesRouter from "./routes/recipes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/recipes", recipesRouter);
app.use(() => {
  throw new NotFoundError("Маршрут не знайдено");
});
app.use(errorHandler);

export default app;
