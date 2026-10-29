import { Module } from '@nestjs/common';

/**
 * licensing: offline Ed25519 license verification, feature flags, user/warehouse limits.
 * No DB schema (license file). See product/licensing/README.md.
 */
@Module({ providers: [], exports: [] })
export class LicensingModule {}
