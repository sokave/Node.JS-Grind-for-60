import { z } from "zod";
import { recipeFiltersSchema } from "./recipe.schema";

const integerQueryValue = z.string().regex(/^\d+$/).transform(Number);

export const recipeListQuerySchema = recipeFiltersSchema.extend({
  page: integerQueryValue.pipe(z.number().int().min(1).max(1_000_000)).default(1),
  limit: integerQueryValue.pipe(z.number().int().min(1).max(100)).default(10),
  sort: z.enum([
    "name", "-name", "cookingMinutes", "-cookingMinutes", "createdAt", "-createdAt",
  ]).default("-createdAt"),
});

export type RecipeListQuery = z.infer<typeof recipeListQuerySchema>;
