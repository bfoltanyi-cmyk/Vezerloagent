import { Module } from '@nestjs/common';

/**
 * nav-connector: Hungarian e-invoice connector (NAV Online Számla 3.0), implements EInvoiceConnector.
 * DB schema: `nav`. Fed only via outbox events (ADR-0003).
 */
@Module({ providers: [], exports: [] })
export class NavConnectorModule {}
