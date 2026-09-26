import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { SearchRecipesDto } from './dto/search-recipes.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';
import { Recipe, RecipeStatus, RecipeType } from './entities/recipe.entity';

export interface FindRecipesOptions {
  search?: string;
  category?: string;
  categoryId?: string;
  creatorId?: string;
  status?: RecipeStatus;
  type?: RecipeType;
}

//system search
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// กัน % _ \ ในคำค้นหาไม่ให้กลายเป็น wildcard ของ LIKE
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

@Injectable()
export class RecipesService {
  constructor(
    @InjectRepository(Recipe)
    private readonly recipeRepository: Repository<Recipe>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  findAll(options: FindRecipesOptions = {}): Promise<Recipe[]> {
    const query = this.recipeRepository
      .createQueryBuilder('recipe')
      .leftJoinAndSelect('recipe.creator', 'creator')
      .leftJoinAndSelect('recipe.categories', 'category')
      .orderBy('recipe.createdAt', 'DESC');

    //system search
    this.applyFilters(query, options);

    return query.getMany();
  }

  // ค้นหาตามชื่ออาหาร พร้อมแบ่งหน้าและเรียงตามความใกล้เคียง
  async search(dto: SearchRecipesDto): Promise<PaginatedResult<Recipe>> {
    const { q, page, limit, ...filters } = dto;

    // แยกเป็น 2 ขั้น: หา id ที่ตรงก่อน แล้วค่อยโหลด relation
    // เพราะถ้า limit ตรงๆ บน query ที่ join categories แถวจะถูกนับซ้ำ
    const idQuery = this.recipeRepository.createQueryBuilder('recipe');
    this.applyFilters(idQuery, { ...filters, search: q });

    const total = await idQuery.getCount();
    if (total === 0) {
      return { data: [], total, page, limit, totalPages: 0 };
    }

    const term = escapeLikeTerm(q);
    const rows = await idQuery
      .select('recipe.id', 'id')
      // ชื่อตรงเป๊ะมาก่อน ตามด้วยชื่อที่ขึ้นต้นด้วยคำค้นหา แล้วค่อยที่เหลือ
      .addSelect(
        `CASE
           WHEN recipe.title ILIKE :exactTerm ESCAPE '\\' THEN 0
           WHEN recipe.title ILIKE :prefixTerm ESCAPE '\\' THEN 1
           ELSE 2
         END`,
        'relevance',
      )
      .setParameters({ exactTerm: term, prefixTerm: `${term}%` })
      .orderBy('relevance', 'ASC')
      .addOrderBy('recipe.title', 'ASC')
      .addOrderBy('recipe.createdAt', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: string }>();

    const ids = rows.map((row) => row.id);
    const recipes = await this.recipeRepository.find({
      where: { id: In(ids) },
      relations: { creator: true, categories: true },
    });

    // find() ไม่การันตีลำดับ จึงเรียงกลับตามลำดับความใกล้เคียงที่หามาได้
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((recipe): recipe is Recipe => recipe !== undefined);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private applyFilters(
    query: SelectQueryBuilder<Recipe>,
    options: FindRecipesOptions,
  ): void {
    if (options.search) {
      query.andWhere("recipe.title ILIKE :search ESCAPE '\\'", {
        search: `%${escapeLikeTerm(options.search)}%`,
      });
    }

    if (options.category) {
      // กรองด้วย subquery เพื่อให้ recipe ที่ผ่านการกรองยังโหลด categories มาครบทุกอัน
      // (ถ้าใส่เงื่อนไขลงใน join ตรงๆ จะเหลือแต่ category ที่ตรงกับที่กรอง)
      query.andWhere(
        'recipe.id IN ' +
          query
            .subQuery()
            .select('filtered.id')
            .from(Recipe, 'filtered')
            .innerJoin('filtered.categories', 'filteredCategory')
            .where('filteredCategory.slug = :category')
            .getQuery(),
        { category: options.category },
      );
    }

    // system search
    if (options.categoryId) {
      // ใช้ alias คนละชุดกับ options.category กันชนกันเวลากรองพร้อมกัน
      query.andWhere(
        'recipe.id IN ' +
          query
            .subQuery()
            .select('filteredById.id')
            .from(Recipe, 'filteredById')
            .innerJoin('filteredById.categories', 'filteredCategoryById')
            .where('filteredCategoryById.id = :categoryId')
            .getQuery(),
        { categoryId: options.categoryId },
      );
    }

    if (options.creatorId) {
      query.andWhere('recipe.creator_id = :creatorId', {
        creatorId: options.creatorId,
      });
    }

    if (options.status) {
      query.andWhere('recipe.status = :status', { status: options.status });
    }

    if (options.type) {
      query.andWhere('recipe.type = :type', { type: options.type });
    }
  }

  async findOne(id: string): Promise<Recipe> {
    const recipe = await this.recipeRepository.findOne({
      where: { id },
      relations: {
        creator: true,
        categories: true,
        recipeIngredients: { ingredient: true },
        sections: { contents: true },
      },
    });
    if (!recipe) throw new NotFoundException(`Recipe with id ${id} not found`);

    recipe.sections.sort((left, right) => left.sortOrder - right.sortOrder);
    for (const section of recipe.sections) {
      section.contents.sort((left, right) => left.sortOrder - right.sortOrder);
    }

    return recipe;
  }

  async create(dto: CreateRecipeDto): Promise<Recipe> {
    const { categoryIds, ...recipeData } = dto;
    const recipe = this.recipeRepository.create(recipeData);
    recipe.categories = await this.resolveCategories(categoryIds);
    return this.recipeRepository.save(recipe);
  }

  async update(id: string, dto: UpdateRecipeDto): Promise<Recipe> {
    const { categoryIds, ...recipeData } = dto;
    const recipe = await this.findOne(id);
    Object.assign(recipe, recipeData, { id: recipe.id });
    if (categoryIds) {
      recipe.categories = await this.resolveCategories(categoryIds);
    }
    return this.recipeRepository.save(recipe);
  }

  // แปลง categoryIds -> Category entity จริง และเช็คว่ามีครบทุก id
  private async resolveCategories(categoryIds?: string[]): Promise<Category[]> {
    if (!categoryIds?.length) return [];

    const uniqueIds = [...new Set(categoryIds)];
    const categories = await this.categoryRepository.findBy({
      id: In(uniqueIds),
    });

    if (categories.length !== uniqueIds.length) {
      const found = new Set(categories.map((category) => category.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new NotFoundException(
        `Categories not found: ${missing.join(', ')}`,
      );
    }

    return categories;
  }

  async remove(id: string): Promise<void> {
    const recipe = await this.findOne(id);
    await this.recipeRepository.remove(recipe);
  }
}
