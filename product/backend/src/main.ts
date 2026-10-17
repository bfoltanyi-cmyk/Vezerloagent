import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadConfig } from './shared/config/config';

async function bootstrap(): Promise<void> {
  // All configuration comes from environment variables (no manual server setup).
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule.forRole(config.appRole));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  if (config.appRole === 'api') {
    await app.listen(config.port);
  } else {
    // Worker: no HTTP listener; background processors start via module lifecycle hooks.
    await app.init();
  }
}

void bootstrap();
