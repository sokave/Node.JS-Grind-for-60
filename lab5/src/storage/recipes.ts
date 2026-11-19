import type { QueryFilter } from "mongoose";
import {
  RecipeModel,
  quickRecipeMinutes,
  type RecipeDocument,
  type RecipeRecord,
} from "../models/recipe.model";
import type { RecipeListQuery } from "../schemas/recipe-list.schema";
import type { CreateRecipeInput, UpdateRecipeInput } from "../schemas/recipe.schema";

export interface RecipePage {
  data: RecipeDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listRecipes(query: RecipeListQuery): Promise<RecipePage> {
  const { difficulty, maxMinutes, page, limit, sort } = query;
  const filter: QueryFilter<RecipeRecord> = {};
  if (difficulty !== undefined) {
    filter.difficulty = difficulty;
  }
  if (maxMinutes !== undefined) {
    filter.cookingMinutes = { $lte: maxMinutes };
  }

  const direction = sort.startsWith("-") ? -1 : 1;
  const field = direction === -1 ? sort.slice(1) : sort;
  const order: Record<string, 1 | -1> = { [field]: direction };
  if (field !== "name") {
    order.name = 1;
  }

  const [data, total] = await Promise.all([
    RecipeModel.find(filter).sort(order).skip((page - 1) * limit).limit(limit).exec(),
    RecipeModel.countDocuments(filter).exec(),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function listQuickRecipes(): Promise<RecipeDocument[]> {
  return RecipeModel.find({ cookingMinutes: { $lte: quickRecipeMinutes } }).exec();
}

export function getRecipe(id: string): Promise<RecipeDocument | null> {
  return RecipeModel.findById(id).exec();
}

export function createRecipe(input: CreateRecipeInput): Promise<RecipeDocument> {
  return RecipeModel.create(input);
}

export function updateRecipe(id: string, input: UpdateRecipeInput): Promise<RecipeDocument | null> {
  return RecipeModel.findByIdAndUpdate(
    id,
    { $set: input },
    { returnDocument: "after", runValidators: true },
  ).exec();
}

export function deleteRecipe(id: string): Promise<RecipeDocument | null> {
  return RecipeModel.findByIdAndDelete(id).exec();
}
