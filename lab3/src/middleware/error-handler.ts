import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class NotFoundError extends Error {}

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "INVALID_INPUT",
      issues: error.issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof NotFoundError) {
    res.status(404).json({ error: "NOT_FOUND", message: error.message });
    return;
  }

  if (error instanceof Error && "type" in error) {
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: "INVALID_JSON", message: "Тіло запиту містить некоректний JSON" });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "PAYLOAD_TOO_LARGE", message: "Тіло запиту завелике" });
      return;
    }
  }

  res.status(500).json({ error: "INTERNAL_ERROR", message: "Внутрішня помилка сервера" });
};
