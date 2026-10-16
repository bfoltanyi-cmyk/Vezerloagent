import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PermissionGuard } from './shared/auth/permission.guard';
import { AppRole } from './shared/config/config';
import { HealthController } from './shared/health/health.controller';
import { PlatformModule } from './modules/platform/platform.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { MasterdataModule } from './modules/masterdata/masterdata.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { NavConnectorModule } from './modules/nav-connector/nav-connector.module';
import { ReportsModule } from './modules/reports/reports.module';

/** Business modules in dependency order (see docs/dev/architecture.md, section 2). */
export const BUSINESS_MODULES = [
  PlatformModule,
  LicensingModule,
  MasterdataModule,
  InventoryModule,
  InvoicingModule,
  NavConnectorModule,
  ReportsModule,
];

@Module({})
export class AppModule {
  /** Same image, two runtime roles: the API exposes HTTP controllers, the worker does not. */
  static forRole(role: AppRole): DynamicModule {
    return {
      module: AppModule,
      imports: BUSINESS_MODULES,
      controllers: role === 'api' ? [HealthController] : [],
      providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
    };
  }
}
