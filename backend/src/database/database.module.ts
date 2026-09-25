import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Banner } from '../banner/entities/banner.entity';
import { CartItem } from '../cart/entities/cart-item.entity';
import { Cart } from '../cart/entities/cart.entity';
import { Category } from '../categories/entities/category.entity';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Ingredient } from '../ingredients/entities/ingredient.entity';
import { RecipeIngredient } from '../ingredients/entities/recipe-ingredient.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { RecipeAccess } from '../recipe-access/entities/recipe-access.entity';
import { RecipeContent } from '../recipes/entities/recipe-content.entity';
import { RecipeSection } from '../recipes/entities/recipe-section.entity';
import { Recipe } from '../recipes/entities/recipe.entity';
import { Review } from '../reviews/entities/review.entity';
import { Task } from '../tasks/entities/task.entity';
import { User } from '../users/entities/user.entity';

const entities = [
  User,
  Recipe,
  RecipeSection,
  RecipeContent,
  Category,
  Ingredient,
  RecipeIngredient,
  Order,
  OrderItem,
  Payment,
  RecipeAccess,
  Review,
  Favorite,
  Banner,
  Cart,
  CartItem,
  Task,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',

        host: config.getOrThrow<string>('database.host'),
        port: config.getOrThrow<number>('database.port'),
        username: config.getOrThrow<string>('database.username'),
        password: config.getOrThrow<string>('database.password'),
        database: config.getOrThrow<string>('database.name'),

        entities,
        autoLoadEntities: true,

        // เปิดใช้งานเฉพาะตอนพัฒนา
        synchronize: config.get<string>('NODE_ENV') !== 'production',

        migrations: [`${__dirname}/migrations/*{.ts,.js}`],
      }),
    }),
  ],
})
export class DatabaseModule {}
