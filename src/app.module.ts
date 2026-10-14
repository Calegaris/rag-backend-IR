import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import llmConfig from './config/llm.config';
import embeddingConfig from './config/embedding.config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { ScenariosModule } from './modules/scenarios/scenarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, llmConfig, embeddingConfig],
      envFilePath: ['.env', '.env.local'],
    }),
    PrismaModule,
    HealthModule,
    ScenariosModule,
  ],
})
export class AppModule {}
