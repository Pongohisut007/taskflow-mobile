import { CreateRecipeDto } from './create-recipe.dto';

export class UpdateRecipeDto implements Partial<CreateRecipeDto> {
  title?: string;
  slug?: string;
  shortDescription?: string | null;
  coverImageUrl?: string | null;
  price?: string;
  preparationMinutes?: number | null;
  cookingMinutes?: number | null;
  servingCount?: number | null;
  difficulty?: CreateRecipeDto['difficulty'];
  status?: CreateRecipeDto['status'];

  categoryIds?: string[];
}
