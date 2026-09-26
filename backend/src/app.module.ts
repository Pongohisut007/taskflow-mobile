import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from '../config/database.config';
import jwtConfig from '../config/jwt.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { BannerModule } from './banner/banner.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { DatabaseModule } from './database/database.module';
import { FavoritesModule } from './favorites/favorites.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { IapModule } from './iap/iap.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { RecipeAccessModule } from './recipe-access/recipe-access.module';
import { RecipesModule } from './recipes/recipes.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import r2ClientConfig from '../config/r2.client.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.production', '.env', '.env.development.local'],
      load: [databaseConfig, jwtConfig, r2ClientConfig],
    }),
    DatabaseModule,
    UsersModule,
    AuthModule,
    BannerModule,
    CategoriesModule,
    RecipesModule,
    IngredientsModule,
    IapModule,
    OrdersModule,
    PaymentsModule,
    RecipeAccessModule,
    ReviewsModule,
    FavoritesModule,
    CartModule,
    UploadsModule,
    TasksModule,
    // FoodsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
