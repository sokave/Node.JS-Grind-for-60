import type { Request, Response as ExpressResponse } from "express";
import mongoose, { mongo, Types } from "mongoose";
import request, { type Response } from "supertest";
import app from "../src/app";
import { errorHandler } from "../src/middleware/error-handler";
import { RecipeModel } from "../src/models/recipe.model";
import type { CreateRecipeInput } from "../src/schemas/recipe.schema";
import * as storage from "../src/storage/recipes";
import { clearTestDB, setupTestDB, teardownTestDB } from "./setup";

const api = "/api/recipes";
const recipeInput: CreateRecipeInput = {
  name: "Омлет із зеленню",
  description: "Яйця, зелена цибуля та кріп",
  cookingMinutes: 12,
  difficulty: "easy",
};

type RecipeResponse = CreateRecipeInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  isQuick: boolean;
};

function getMissingRecipeUrl(): string {
  return `${api}/${new Types.ObjectId().toHexString()}`;
}

function expectInputError(response: Response, field: string): void {
  expect(response.body).toMatchObject({
    error: "INVALID_INPUT",
    issues: expect.arrayContaining([
      expect.objectContaining({ path: [field], message: expect.any(String) }),
    ]),
  });
}

beforeAll(setupTestDB, 120_000);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDB();
});
afterAll(teardownTestDB);

describe("GET /health", () => {
  const { version }: { version: string } = require("../package.json");

  it("повертає 200 коли MongoDB підключена", async () => {
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "connected", version });
  });

});

describe("Модель Recipe", () => {
  it("задає дефолтну складність, ObjectId і часові мітки", async () => {
    const record = await RecipeModel.create({ name: "  Вівсянка  ", cookingMinutes: 10 });

    expect(record._id).toBeInstanceOf(Types.ObjectId);
    expect(record.name).toBe("Вівсянка");
    expect(record.difficulty).toBe("easy");
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.updatedAt).toEqual(record.createdAt);
  });

  it.each([
    { field: "name", changes: { name: "" } },
    { field: "name", changes: { name: "а".repeat(101) } },
    { field: "description", changes: { description: "а".repeat(501) } },
    { field: "cookingMinutes", changes: { cookingMinutes: 0 } },
    { field: "cookingMinutes", changes: { cookingMinutes: 721 } },
    { field: "difficulty", changes: { difficulty: "unknown" } },
  ])("перевіряє обмеження поля $field під час збереження", async ({ field, changes }) => {
    const recipe = new RecipeModel({ ...recipeInput, ...changes });
    await expect(recipe.save()).rejects.toMatchObject({
      name: "ValidationError",
      errors: { [field]: expect.objectContaining({ path: field }) },
    });
  });

  it("запускає кастомний валідатор під час оновлення", async () => {
    const recipe = await RecipeModel.create(recipeInput);

    await expect(storage.updateRecipe(recipe.id, { cookingMinutes: 12.5 }))
      .rejects.toThrow("Час приготування має бути цілим числом");
    const stored = await RecipeModel.findById(recipe.id).orFail();
    expect(stored.cookingMinutes).toBe(recipeInput.cookingMinutes);
  });

  it.each([
    { minutes: 30, expected: true },
    { minutes: 31, expected: false },
  ])("серіалізує isQuick для $minutes хвилин", async ({ minutes, expected }) => {
    const recipe = await RecipeModel.create({ ...recipeInput, cookingMinutes: minutes });

    expect(recipe.toJSON()).toMatchObject({ id: recipe._id.toHexString(), isQuick: expected });
  });
});

describe("GET /api/recipes", () => {
  it("повертає порожню сторінку зі значеннями за замовчуванням", async () => {
    const res = await request(app).get(api).expect("Content-Type", /json/).expect(200);

    expect(res.body).toEqual({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  });

  it("повертає рецепти з MongoDB та заголовок CORS", async () => {
    const first = await RecipeModel.create(recipeInput);
    const second = await RecipeModel.create({ ...recipeInput, name: "Сирники" });
    const res = await request(app)
      .get(api)
      .set("Origin", "https://example.test")
      .expect("Access-Control-Allow-Origin", "*")
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id }),
      expect.objectContaining({ id: second.id }),
    ]));
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 2, totalPages: 1 });
  });
});

describe("GET /api/recipes/:id", () => {
  it("повертає дані рецепта, часові мітки та isQuick", async () => {
    const recipe = await RecipeModel.create(recipeInput);
    const res = await request(app).get(`${api}/${recipe.id}`).expect(200);

    expect(res.body).toEqual({
      ...recipeInput,
      id: recipe._id.toHexString(),
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
      isQuick: true,
    });
  });

  it("повертає 404 для відсутнього коректного ObjectId", async () => {
    const res = await request(app).get(getMissingRecipeUrl()).expect(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it("повертає 400 для ID неправильного формату", async () => {
    const res = await request(app).get(`${api}/recipe-123`).expect(400);
    expect(res.body.error).toBe("INVALID_ID");
  });
});

describe("POST /api/recipes", () => {
  it("створює документ і повертає заголовок Location", async () => {
    const res = await request(app).post(api).send(recipeInput).expect(201);
    const recipe: RecipeResponse = res.body;

    expect(recipe).toMatchObject({ ...recipeInput, isQuick: true });
    expect(recipe.id).toMatch(/^[a-f0-9]{24}$/);
    expect(recipe.updatedAt).toBe(recipe.createdAt);
    expect(Number.isFinite(Date.parse(recipe.createdAt))).toBe(true);
    expect(res.headers.location).toBe(`${api}/${recipe.id}`);
    await request(app).get(res.headers.location).expect(200, recipe);
  });

  it("зберігає рецепт без опису", async () => {
    const { name, cookingMinutes, difficulty } = recipeInput;
    const res = await request(app).post(api).send({ name, cookingMinutes, difficulty }).expect(201);
    expect(res.body).toMatchObject({ name, cookingMinutes, difficulty });
    expect(res.body).not.toHaveProperty("description");
  });

  it("повертає 409 для дубліката назви", async () => {
    await RecipeModel.create(recipeInput);
    const res = await request(app).post(api).send(recipeInput).expect(409);

    expect(res.body.error).toBe("DUPLICATE_RECIPE");
    await expect(RecipeModel.countDocuments()).resolves.toBe(1);
  });

  it.each([
    { field: "name", changes: { name: "   " } },
    { field: "name", changes: { name: "а".repeat(101) } },
    { field: "description", changes: { description: "а".repeat(501) } },
    { field: "cookingMinutes", changes: { cookingMinutes: 0 } },
    { field: "difficulty", changes: { difficulty: "unknown" } },
  ])("перевіряє вхідне поле $field через Zod", async ({ field, changes }) => {
    const res = await request(app).post(api).send({ ...recipeInput, ...changes }).expect(400);

    expectInputError(res, field);
    await expect(RecipeModel.countDocuments()).resolves.toBe(0);
  });

  it("форматує помилку некоректного JSON", async () => {
    const res = await request(app).post(api).type("json").send('{"name":').expect(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it("повертає 413 при перевищенні ліміту JSON-парсера", async () => {
    const res = await request(app).post(api).send({ description: "a".repeat(110_000) }).expect(413);
    expect(res.body.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("перетворює помилку валідації Mongoose на 400", async () => {
    jest.spyOn(storage, "createRecipe").mockImplementationOnce((input) =>
      RecipeModel.create({ ...input, cookingMinutes: 12.5 }),
    );
    const res = await request(app).post(api).send(recipeInput).expect(400);

    expect(res.body).toMatchObject({
      error: "DATABASE_VALIDATION",
      issues: [{ path: ["cookingMinutes"], message: "Час приготування має бути цілим числом" }],
    });
  });
});

describe("PATCH /api/recipes/:id", () => {
  it("частково оновлює документ, updatedAt та isQuick", async () => {
    const clock = jest.spyOn(mongoose, "now").mockReturnValue(new Date("2026-01-10T12:00:00Z"));
    const recipe = await RecipeModel.create(recipeInput);
    const url = `${api}/${recipe.id}`;
    const updatedAt = new Date("2026-01-10T12:01:00Z");
    clock.mockReturnValue(updatedAt);

    const res = await request(app).patch(url).send({ cookingMinutes: 35 }).expect(200);

    expect(res.body).toMatchObject({
      ...recipeInput,
      id: recipe.id,
      cookingMinutes: 35,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      isQuick: false,
    });
    await request(app).get(url).expect(200, res.body);
  });

  it("відхиляє невалідну зміну й зберігає попередні дані", async () => {
    const recipe = await RecipeModel.create(recipeInput);
    const res = await request(app)
      .patch(`${api}/${recipe.id}`)
      .send({ cookingMinutes: 12.5 })
      .expect(400);

    expectInputError(res, "cookingMinutes");
    const stored = await RecipeModel.findById(recipe.id).orFail();
    expect(stored.cookingMinutes).toBe(recipeInput.cookingMinutes);
  });

  it("повертає 404 для відсутнього рецепта", async () => {
    const res = await request(app)
      .patch(getMissingRecipeUrl()).send({ name: "Млинці" }).expect(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it("повертає 409 при заміні на зайняту назву", async () => {
    await RecipeModel.create(recipeInput);
    const other = await RecipeModel.create({ ...recipeInput, name: "Сирники" });

    const res = await request(app)
      .patch(`${api}/${other.id}`).send({ name: recipeInput.name }).expect(409);
    expect(res.body.error).toBe("DUPLICATE_RECIPE");
    expect((await RecipeModel.findById(other.id).orFail()).name).toBe("Сирники");
  });
});

describe("DELETE /api/recipes/:id", () => {
  it("видаляє документ і повертає 204 без тіла", async () => {
    const recipe = await RecipeModel.create(recipeInput);
    const url = `${api}/${recipe.id}`;
    const res = await request(app).delete(url).expect(204);

    expect(res.text).toBe("");
    await request(app).get(url).expect(404);
  });

  it("повертає 404 для відсутнього документа", async () => {
    const res = await request(app).delete(getMissingRecipeUrl()).expect(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });
});

describe("Фільтри, сортування та пагінація", () => {
  beforeEach(async () => {
    await RecipeModel.create([
      recipeInput,
      { name: "Тости", difficulty: "easy", cookingMinutes: 12 },
      { name: "Запечена картопля", difficulty: "easy", cookingMinutes: 50 },
      { name: "Грибний суп", difficulty: "medium", cookingMinutes: 30 },
      { name: "Домашнє різото", difficulty: "hard", cookingMinutes: 35 },
    ]);
  });

  it.each([
    { query: { difficulty: "easy" }, names: ["Омлет із зеленню", "Тости", "Запечена картопля"] },
    { query: { maxMinutes: 30 }, names: ["Омлет із зеленню", "Тости", "Грибний суп"] },
    { query: { maxMinutes: 30, difficulty: "easy" }, names: ["Омлет із зеленню", "Тости"] },
  ])("застосовує фільтр $query у MongoDB", async ({ query, names }) => {
    const res = await request(app).get(api).query({ ...query, sort: "cookingMinutes" }).expect(200);

    expect(res.body.data.map((item: RecipeResponse) => item.name)).toEqual(names);
    expect(res.body.pagination.total).toBe(names.length);
  });

  it("сортує за часом у спадному напрямку", async () => {
    const res = await request(app).get(api).query({ sort: "-cookingMinutes" }).expect(200);

    expect(res.body.data.map((item: RecipeResponse) => item.cookingMinutes))
      .toEqual([50, 35, 30, 12, 12]);
  });

  it("сортує за назвою у спадному напрямку", async () => {
    const res = await request(app).get(api).query({ sort: "-name" }).expect(200);

    expect(res.body.data.map((item: RecipeResponse) => item.name))
      .toEqual(["Тости", "Омлет із зеленню", "Запечена картопля", "Домашнє різото", "Грибний суп"]);
  });

  it("пагінує відфільтровану вибірку та повертає її загальну кількість", async () => {
    const res = await request(app).get(api)
      .query({ difficulty: "easy", sort: "cookingMinutes", page: 2, limit: 2 })
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Запечена картопля");
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("підтримує послідовні сторінки для однакового часу приготування", async () => {
    const query = { sort: "cookingMinutes", maxMinutes: 12, limit: 1 };
    const first = await request(app).get(api).query({ ...query, page: 1 }).expect(200);
    const second = await request(app).get(api).query({ ...query, page: 2 }).expect(200);

    expect(first.body.data[0].name).toBe("Омлет із зеленню");
    expect(second.body.data[0].name).toBe("Тости");
  });

  it("повертає порожні дані після останньої сторінки", async () => {
    const res = await request(app).get(api).query({ page: 4, limit: 2 }).expect(200);

    expect(res.body).toEqual({
      data: [],
      pagination: { page: 4, limit: 2, total: 5, totalPages: 3 },
    });
  });

  it.each([
    { query: { difficulty: "unknown" }, field: "difficulty" },
    { query: { maxMinutes: 0 }, field: "maxMinutes" },
    { query: { maxMinutes: "1.5" }, field: "maxMinutes" },
    { query: { page: 0 }, field: "page" },
    { query: { limit: 101 }, field: "limit" },
    { query: { sort: "unknown" }, field: "sort" },
  ])("повертає 400 для некоректного параметра $field", async ({ query, field }) => {
    const res = await request(app).get(api).query(query).expect(400);
    expectInputError(res, field);
  });

  it("GET /quick повертає рецепти до 30 хвилин включно", async () => {
    const res = await request(app).get(`${api}/quick`).expect(200);

    const minutes = res.body.map((item: RecipeResponse) => item.cookingMinutes);
    expect(minutes.sort((a: number, b: number) => a - b)).toEqual([12, 12, 30]);
  });
});

describe("Граничні сценарії обробника помилок", () => {
  it("повертає JSON для невідомого маршруту", async () => {
    const res = await request(app).get("/unknown-route").expect(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });

  it.each([
    { label: "звичайну", failure: new Error("Тестова помилка") },
    { label: "драйвера MongoDB", failure: new mongo.MongoServerError({ code: 91, message: "Тест" }) },
    { label: "з невідомим типом", failure: Object.assign(new Error("Тест"), { type: "other" }) },
  ])("форматує несподівану помилку $label як 500", async ({ failure }) => {
    jest.spyOn(storage, "listRecipes").mockRejectedValueOnce(failure);

    const res = await request(app).get(api).expect(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "Внутрішня помилка сервера" });
  });

  it("передає помилку далі після надсилання заголовків", () => {
    const failure = new Error("Помилка після початку відповіді");
    const next = jest.fn();

    errorHandler(failure, {} as Request, { headersSent: true } as ExpressResponse, next);

    expect(next).toHaveBeenCalledWith(failure);
  });
});
