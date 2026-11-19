import { Router } from "express";
import { NotFoundError } from "../middleware/error-handler";
import { validate } from "../middleware/validate";
import { recipeListQuerySchema } from "../schemas/recipe-list.schema";
import {
  createRecipeSchema,
  updateRecipeSchema,
  type CreateRecipeInput,
  type UpdateRecipeInput,
} from "../schemas/recipe.schema";
import {
  createRecipe, deleteRecipe, getRecipe, listQuickRecipes, listRecipes, updateRecipe,
} from "../storage/recipes";

const router = Router();

router.get("/", async (req, res) => {
  const query = recipeListQuerySchema.parse(req.query);
  res.json(await listRecipes(query));
});

router.get("/quick", async (_req, res) => {
  res.json(await listQuickRecipes());
});

router.get<{ id: string }>("/:id", async (req, res) => {
  const recipe = await getRecipe(req.params.id);
  if (!recipe) {
    throw new NotFoundError("Рецепт не знайдено");
  }
  res.json(recipe);
});

router.post<Record<string, string>, unknown, CreateRecipeInput>(
  "/",
  validate(createRecipeSchema),
  async (req, res) => {
    const recipe = await createRecipe(req.body);
    res.location(`${req.baseUrl}/${recipe.id}`).status(201).json(recipe);
  },
);

router.patch<{ id: string }, unknown, UpdateRecipeInput>(
  "/:id",
  validate(updateRecipeSchema),
  async (req, res) => {
    const recipe = await updateRecipe(req.params.id, req.body);
    if (!recipe) {
      throw new NotFoundError("Рецепт не знайдено");
    }
    res.json(recipe);
  },
);

router.delete<{ id: string }>("/:id", async (req, res) => {
  const recipe = await deleteRecipe(req.params.id);
  if (!recipe) {
    throw new NotFoundError("Рецепт не знайдено");
  }
  res.status(204).end();
});

export default router;
