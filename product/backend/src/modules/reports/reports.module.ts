import { Module } from '@nestjs/common';

/**
 * reports: read-only reports and accountant export. No own schema;
 * uses only the *Reader services exported by other modules.
 */
@Module({ providers: [], exports: [] })
export class ReportsModule {}
