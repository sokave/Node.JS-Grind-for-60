import request from "supertest";
import app from "../src/app";

describe("GET /health без з’єднання з MongoDB", () => {
  it("повертає 503 та версію застосунку", async () => {
    const { version }: { version: string } = require("../package.json");
    const response = await request(app).get("/health").expect(503);

    expect(response.body).toEqual({ status: "unavailable", database: "disconnected", version });
  });
});
