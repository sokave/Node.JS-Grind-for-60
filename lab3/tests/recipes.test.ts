import request, { type Response } from "supertest";
import app from "../src/app";
import type { CreateRecipeInput, Recipe } from "../src/schemas/recipe.schema";
import * as storage from "../src/storage/recipes";

const api = "/api/recipes";
const missingId = "301cb2ea-1fd2-4850-9e7c-f581f871a5a2";
const recipeInput: CreateRecipeInput = {
  name: "Омлет із зеленню",
  description: "Яйця, зелена цибуля та кріп",
  cookingMinutes: 12,
  difficulty: "easy",
};

type RecipeResponse = Omit<Recipe, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function expectInvalidField(response: Response, field: string): void {
  expect(response.body).toMatchObject({
    error: "INVALID_INPUT",
    issues: expect.arrayContaining([
      expect.objectContaining({ path: [field], message: expect.any(String) }),
    ]),
  });
}

beforeEach(() => {
  storage.resetRecipes();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/recipes", () => {
  it("повертає порожній список із JSON-заголовком", async () => {
    const res = await request(app).get(api).expect("Content-Type", /json/).expect(200);

    expect(res.body).toEqual([]);
  });

  it("повертає всі рецепти та заголовок CORS", async () => {
    const first = storage.createRecipe(recipeInput);
    const second = storage.createRecipe({ ...recipeInput, name: "Сирники" });

    const res = await request(app)
      .get(api)
      .set("Origin", "https://example.test")
      .expect("Access-Control-Allow-Origin", "*")
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, name: first.name }),
      expect.objectContaining({ id: second.id, name: second.name }),
    ]));
  });
});

describe("GET /api/recipes/:id", () => {
  it("повертає рецепт та його часові мітки", async () => {
    const recipe = storage.createRecipe(recipeInput);

    const res = await request(app).get(`${api}/${recipe.id}`).expect(200);

    expect(res.body).toEqual({
      ...recipe,
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: recipe.updatedAt.toISOString(),
    });
  });

  it("повертає 404 для невідомого ідентифікатора", async () => {
    const res = await request(app).get(`${api}/${missingId}`).expect(404);

    expect(res.body).toMatchObject({ error: "NOT_FOUND" });
  });
});

describe("POST /api/recipes", () => {
  it("створює рецепт з UUID, часовими мітками та заголовком Location", async () => {
    const res = await request(app).post(api).send(recipeInput).expect(201);
    const recipe: RecipeResponse = res.body;

    expect(recipe).toMatchObject(recipeInput);
    expect(recipe.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
    expect(Number.isFinite(Date.parse(recipe.createdAt))).toBe(true);
    expect(recipe.updatedAt).toBe(recipe.createdAt);
    expect(res.headers.location).toBe(`${api}/${recipe.id}`);
    await request(app).get(res.headers.location).expect(200, recipe);
  });

  it("дозволяє створити рецепт без опису", async () => {
    const { name, cookingMinutes, difficulty } = recipeInput;
    const res = await request(app).post(api).send({ name, cookingMinutes, difficulty }).expect(201);

    expect(res.body).toMatchObject({ name, cookingMinutes, difficulty });
    expect(res.body).not.toHaveProperty("description");
  });

  it.each([
    { label: "порожню назву", changes: { name: "   " }, field: "name" },
    { label: "назву понад 100 символів", changes: { name: "а".repeat(101) }, field: "name" },
    { label: "опис понад 500 символів", changes: { description: "а".repeat(501) }, field: "description" },
    { label: "нульовий час", changes: { cookingMinutes: 0 }, field: "cookingMinutes" },
    { label: "невідомий рівень складності", changes: { difficulty: "unknown" }, field: "difficulty" },
  ])("відхиляє $label", async ({ changes, field }) => {
    const res = await request(app).post(api).send({ ...recipeInput, ...changes }).expect(400);

    expectInvalidField(res, field);
    await request(app).get(api).expect(200, []);
  });

  it("повертає 400 для синтаксично некоректного JSON", async () => {
    const res = await request(app)
      .post(api)
      .type("json")
      .send('{"name":')
      .expect(400);

    expect(res.body).toMatchObject({ error: "INVALID_JSON" });
  });
});

describe("PATCH /api/recipes/:id", () => {
  it("частково оновлює рецепт і змінює updatedAt", async () => {
    const recipe = storage.createRecipe(recipeInput);
    const nextTime = new Date(recipe.createdAt.getTime() + 1000);
    jest.spyOn(Date, "now").mockReturnValue(nextTime.getTime());
    const url = `${api}/${recipe.id}`;

    const res = await request(app).patch(url).send({ difficulty: "medium" }).expect(200);

    expect(res.body).toEqual({
      ...recipe,
      difficulty: "medium",
      createdAt: recipe.createdAt.toISOString(),
      updatedAt: nextTime.toISOString(),
    });
    await request(app).get(url).expect(200, res.body);
  });

  it("відхиляє некоректне оновлення і зберігає початкові дані", async () => {
    const recipe = storage.createRecipe(recipeInput);
    const url = `${api}/${recipe.id}`;
    const res = await request(app).patch(url).send({ cookingMinutes: 12.5 }).expect(400);

    expectInvalidField(res, "cookingMinutes");
    const stored = await request(app).get(url).expect(200);
    expect(stored.body.cookingMinutes).toBe(recipeInput.cookingMinutes);
    expect(stored.body.updatedAt).toBe(recipe.updatedAt.toISOString());
  });

  it("повертає 404 при оновленні відсутнього рецепта", async () => {
    const res = await request(app)
      .patch(`${api}/${missingId}`)
      .send({ name: "Нова назва" })
      .expect(404);

    expect(res.body).toMatchObject({ error: "NOT_FOUND" });
  });
});

describe("DELETE /api/recipes/:id", () => {
  it("видаляє рецепт і повертає 204 з порожнім тілом", async () => {
    const recipe = storage.createRecipe(recipeInput);
    const url = `${api}/${recipe.id}`;

    const res = await request(app).delete(url).expect(204);

    expect(res.text).toBe("");
    await request(app).get(url).expect(404);
  });

  it("повертає 404 при видаленні відсутнього рецепта", async () => {
    const res = await request(app).delete(`${api}/${missingId}`).expect(404);

    expect(res.body).toMatchObject({ error: "NOT_FOUND" });
  });
});

describe("Фільтрація рецептів і швидкі рецепти", () => {
  beforeEach(() => {
    storage.createRecipe(recipeInput);
    storage.createRecipe({ name: "Запечена картопля", difficulty: "easy", cookingMinutes: 50 });
    storage.createRecipe({ name: "Грибний суп", difficulty: "medium", cookingMinutes: 30 });
    storage.createRecipe({ name: "Домашнє різото", difficulty: "hard", cookingMinutes: 35 });
  });

  it.each([
    { label: "складністю", query: { difficulty: "easy" }, names: ["Омлет із зеленню", "Запечена картопля"] },
    { label: "часом", query: { maxMinutes: 30 }, names: ["Омлет із зеленню", "Грибний суп"] },
    { label: "двома умовами", query: { difficulty: "easy", maxMinutes: 30 }, names: ["Омлет із зеленню"] },
  ])("фільтрує за $label", async ({ query, names }) => {
    const res = await request(app).get(api).query(query).expect(200);

    expect(res.body.map((recipe: RecipeResponse) => recipe.name)).toEqual(names);
  });

  it.each([
    { query: { difficulty: "unknown" }, field: "difficulty" },
    { query: { maxMinutes: 0 }, field: "maxMinutes" },
    { query: { maxMinutes: "1.5" }, field: "maxMinutes" },
  ])("відхиляє некоректний параметр $field", async ({ query, field }) => {
    const res = await request(app).get(api).query(query).expect(400);

    expectInvalidField(res, field);
  });

  it("GET /quick повертає рецепти з часом до 30 хвилин включно", async () => {
    const res = await request(app).get(`${api}/quick`).expect(200);

    expect(res.body.map((recipe: RecipeResponse) => recipe.cookingMinutes)).toEqual([12, 30]);
  });
});

describe("Централізована обробка помилок", () => {
  it("повертає JSON-помилку 404 для невідомого маршруту", async () => {
    const res = await request(app).get("/unknown-route").expect(404);

    expect(res.body).toMatchObject({ error: "NOT_FOUND" });
  });

  it("перетворює помилку сховища на стандартну відповідь 500", async () => {
    jest.spyOn(storage, "listRecipes").mockImplementationOnce(() => {
      throw new Error("Тестова помилка сховища");
    });

    const res = await request(app).get(api).expect(500);

    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "Внутрішня помилка сервера" });
  });
});
