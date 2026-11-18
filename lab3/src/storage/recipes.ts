import { randomUUID } from "node:crypto";
import type {
  CreateRecipeInput,
  Recipe,
  RecipeFilters,
  UpdateRecipeInput,
} from "../schemas/recipe.schema";

const recipes = new Map<string, Recipe>();

export function listRecipes(filters: RecipeFilters = {}): Recipe[] {
  const { difficulty, maxMinutes } = filters;

  return Array.from(recipes.values()).filter((recipe) => {
    const matchesDifficulty = difficulty === undefined || recipe.difficulty === difficulty;
    const matchesTime = maxMinutes === undefined || recipe.cookingMinutes <= maxMinutes;
    return matchesDifficulty && matchesTime;
  });
}

export function getRecipe(id: string): Recipe | undefined {
  return recipes.get(id);
}

export function createRecipe(input: CreateRecipeInput): Recipe {
  const now = new Date(Date.now());
  const recipe: Recipe = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  recipes.set(recipe.id, recipe);
  return recipe;
}

export function updateRecipe(id: string, input: UpdateRecipeInput): Recipe | undefined {
  const previous = recipes.get(id);
  if (!previous) {
    return undefined;
  }

  const recipe: Recipe = { ...previous, ...input, updatedAt: new Date(Date.now()) };
  recipes.set(id, recipe);
  return recipe;
}

export function deleteRecipe(id: string): boolean {
  return recipes.delete(id);
}

export function resetRecipes(): void {
  recipes.clear();
}
