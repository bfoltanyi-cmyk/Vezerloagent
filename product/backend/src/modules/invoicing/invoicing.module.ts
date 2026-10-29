import { Module } from '@nestjs/common';

/**
 * invoicing: invoices, storno, modification, proforma, number sequences, PDF, e-mail, payments.
 * DB schema: `invoicing`. Public API: InvoiceReader; events InvoiceIssued, InvoiceCorrected.
 */
@Module({ providers: [], exports: [] })
export class InvoicingModule {}
