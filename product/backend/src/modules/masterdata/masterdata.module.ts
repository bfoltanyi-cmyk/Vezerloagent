import { Module } from '@nestjs/common';

/**
 * masterdata: company, partners, items, VAT rates, currencies, import.
 * DB schema: `masterdata`. Public API: PartnerReader, ItemReader, VatRateReader.
 */
@Module({ providers: [], exports: [] })
export class MasterdataModule {}
