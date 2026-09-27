import { RecipeDifficulty, RecipeStatus } from '../entities/recipe.entity';

export class CreateRecipeDto {
  creatorId!: string;
  title!: string;
  slug!: string;
  shortDescription?: string | null;
  coverImageUrl?: string | null;
  price?: string;
  preparationMinutes?: number | null;
  cookingMinutes?: number | null;
  servingCount?: number | null;
  difficulty?: RecipeDifficulty | null;
  status?: RecipeStatus;

  categoryIds?: string[];
}
