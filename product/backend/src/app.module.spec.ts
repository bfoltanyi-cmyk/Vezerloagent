import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { AppModule } from './app.module';
import { HealthController } from './shared/health/health.controller';
import { PermissionGuard } from './shared/auth/permission.guard';

describe('AppModule', () => {
  it('api role exposes the health endpoint and registers the global deny-by-default guard', async () => {
    const def = AppModule.forRole('api');
    expect(def.controllers).toContain(HealthController);
    expect(def.providers).toContainEqual({ provide: APP_GUARD, useClass: PermissionGuard });

    const moduleRef = await Test.createTestingModule({ imports: [def] }).compile();
    expect(moduleRef.get(HealthController).check()).toEqual({ status: 'ok' });
  });

  it('worker role exposes no HTTP controllers', () => {
    expect(AppModule.forRole('worker').controllers).toEqual([]);
  });
});
