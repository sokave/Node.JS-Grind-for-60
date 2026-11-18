import { Router } from "express";
import { NotFoundError } from "../middleware/error-handler";
import { validate } from "../middleware/validate";
import {
  createRecipeSchema,
  recipeFiltersSchema,
  updateRecipeSchema,
  type CreateRecipeInput,
  type Recipe,
  type UpdateRecipeInput,
} from "../schemas/recipe.schema";
import { createRecipe, deleteRecipe, getRecipe, listRecipes, updateRecipe } from "../storage/recipes";

const router = Router();
const quickRecipeMinutes = 30;

router.get("/", (req, res) => {
  const filters = recipeFiltersSchema.parse(req.query);
  res.json(listRecipes(filters));
});

router.get("/quick", (_req, res) => {
  res.json(listRecipes({ maxMinutes: quickRecipeMinutes }));
});

router.get<{ id: string }>("/:id", (req, res) => {
  const recipe = getRecipe(req.params.id);
  if (!recipe) {
    throw new NotFoundError("Рецепт не знайдено");
  }
  res.json(recipe);
});

router.post<Record<string, string>, Recipe, CreateRecipeInput>(
  "/",
  validate(createRecipeSchema),
  (req, res) => {
    const recipe = createRecipe(req.body);
    res.location(`${req.baseUrl}/${recipe.id}`).status(201).json(recipe);
  },
);

router.patch<{ id: string }, Recipe, UpdateRecipeInput>(
  "/:id",
  validate(updateRecipeSchema),
  (req, res) => {
    const recipe = updateRecipe(req.params.id, req.body);
    if (!recipe) {
      throw new NotFoundError("Рецепт не знайдено");
    }
    res.json(recipe);
  },
);

router.delete<{ id: string }>("/:id", (req, res) => {
  if (!deleteRecipe(req.params.id)) {
    throw new NotFoundError("Рецепт не знайдено");
  }
  res.status(204).end();
});

export default router;
