import { z } from "zod";

const difficultySchema = z.enum(["easy", "medium", "hard"]);
const minutesSchema = z.number().int().min(1).max(720);

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  cookingMinutes: minutesSchema,
  difficulty: difficultySchema,
});

export const updateRecipeSchema = createRecipeSchema.partial();

export const recipeFiltersSchema = z.object({
  difficulty: difficultySchema.optional(),
  maxMinutes: z.string().regex(/^\d+$/).transform(Number).pipe(minutesSchema).optional(),
});

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type RecipeFilters = z.infer<typeof recipeFiltersSchema>;

export type Recipe = CreateRecipeInput & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};
