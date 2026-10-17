/**
 * Country pack contract (ADR-0004). The core never branches on country codes;
 * country-specific behaviour lives behind this interface.
 */
export type CountryCode = 'hu' | 'pl' | 'cz';

export interface TaxIdValidationResult {
  valid: boolean;
  /** i18n key of the error message when invalid. */
  errorKey?: string;
}

export interface EInvoiceSubmissionResult {
  status: 'accepted' | 'pending' | 'rejected' | 'retryable_error';
  externalId?: string;
  /** Stable error code from the authority, mapped to a localized hint. */
  errorCode?: string;
}

/** Implemented by nav-connector (HU), later KSeF (PL) and the CZ connector. */
export interface EInvoiceConnector {
  submit(companyId: string, invoiceId: string): Promise<EInvoiceSubmissionResult>;
  queryStatus(companyId: string, externalId: string): Promise<EInvoiceSubmissionResult>;
}

export interface CountryPack {
  code: CountryCode;
  currency: string;
  locale: string;
  timezone: string;
  validateTaxId(taxId: string): TaxIdValidationResult;
  /** Retention profile key, resolved by shared/privacy/retention-profiles. */
  retentionProfile: string;
  /** Smallest cash rounding step in minor units (HU: 500 = 5 Ft), or null if none. */
  cashRoundingStepMinor: bigint | null;
  eInvoiceConnector?: EInvoiceConnector;
}

export class CountryPackRegistry {
  private readonly packs = new Map<CountryCode, CountryPack>();

  register(pack: CountryPack): void {
    if (this.packs.has(pack.code)) {
      throw new Error(`Country pack already registered: ${pack.code}`);
    }
    this.packs.set(pack.code, pack);
  }

  get(code: string): CountryPack {
    const pack = this.packs.get(code as CountryCode);
    if (!pack) {
      throw new Error(`Country pack not available: ${code}`);
    }
    return pack;
  }
}
