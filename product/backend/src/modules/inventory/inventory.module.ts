import { Module } from '@nestjs/common';

/**
 * inventory: warehouses, stock documents, moving average cost, stocktake, minimum stock.
 * DB schema: `inventory`. Public API: StockService, StockReader.
 */
@Module({ providers: [], exports: [] })
export class InventoryModule {}
