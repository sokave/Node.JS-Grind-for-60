import { model, Schema, type HydratedDocument } from "mongoose";
import type { CreateRecipeInput } from "../schemas/recipe.schema";

export const quickRecipeMinutes = 30;

export interface RecipeRecord extends CreateRecipeInput {
  createdAt: Date;
  updatedAt: Date;
}

export type RecipeDocument = HydratedDocument<RecipeRecord>;

const recipeSchema = new Schema<RecipeRecord>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      unique: true,
    },
    description: { type: String, maxlength: 500 },
    cookingMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 720,
      validate: {
        validator: Number.isInteger,
        message: "Час приготування має бути цілим числом",
      },
    },
    difficulty: {
      type: String,
      required: true,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },
  },
  {
    collection: "recipes",
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_document, { _id: _storageId, ...recipe }) => recipe,
    },
  },
);

recipeSchema.virtual("isQuick").get(function (this: RecipeRecord): boolean {
  return this.cookingMinutes <= quickRecipeMinutes;
});

export const RecipeModel = model<RecipeRecord>("Recipe", recipeSchema);
