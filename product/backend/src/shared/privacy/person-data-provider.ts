/**
 * Contract every module with personal data implements (requirement R2, ADR-0005).
 * The platform PrivacyRegistry orchestrates providers; providers only touch their own tables.
 * Deadline tracking, erasure-vs-retention decisions and audit logging are done by the platform,
 * not by providers.
 */
import { EntityClassification, PersonIdentifierKind, RetentionCategory } from './classification';

export interface PrivacyContext {
  companyId: string;
  /** Acting user (DSR handler or the retention worker's system user). */
  actorUserId: string;
  /** DSR id or retention run id, for audit correlation. */
  correlationId: string;
  /** Opaque DB transaction handle (TransactionContext). */
  tx?: unknown;
}

export interface PersonIdentifier {
  kind: PersonIdentifierKind;
  value: string;
}

export interface PersonRecordRef {
  module: string;
  recordType: string;
  recordId: string;
}

export interface PersonRecordHit extends PersonRecordRef {
  matchedBy: PersonIdentifierKind[];
  /** i18n key + short label for the DSR handler UI (e.g. invoice number). */
  label: string;
  retentionCategory: RetentionCategory;
  /** Date the retention anchor resolves from (document date, relationship end...); null = still active. */
  anchorDate: Date | null;
  restricted: boolean;
}

export type ExportValue = string | number | boolean | null;

export interface ExportedRecord extends PersonRecordRef {
  /** Only the data subject's own fields; third-party data omitted. Money as decimal string. */
  fields: Record<string, ExportValue>;
}

export type RetentionAnchorKind = 'document_date' | 'relationship_end' | 'employment_end';

export interface RetentionCandidateQuery {
  recordType: string;
  anchor: RetentionAnchorKind;
  /** Records whose anchor date is on or before this instant are candidates. */
  anchorOnOrBefore: Date;
  limit: number;
  cursor?: string;
}

export interface RetentionCandidatePage {
  items: Array<PersonRecordRef & { anchorDate: Date }>;
  nextCursor?: string;
}

export interface PersonDataProvider {
  readonly module: string;
  /** Static field classification (R1); validated at startup. */
  classifications(): readonly EntityClassification[];
  search(ctx: PrivacyContext, identifiers: readonly PersonIdentifier[]): Promise<PersonRecordHit[]>;
  export(ctx: PrivacyContext, refs: readonly PersonRecordRef[]): Promise<ExportedRecord[]>;
  /** Versioned change; the provider rejects fields that are immutable (issued documents). */
  rectify(ctx: PrivacyContext, ref: PersonRecordRef, changes: Record<string, ExportValue>): Promise<void>;
  /** Sets/clears the denormalised `privacy_restricted` flag on the provider's own rows. */
  setRestricted(ctx: PrivacyContext, refs: readonly PersonRecordRef[], restricted: boolean): Promise<void>;
  /** Irreversible. Called only by the platform after the retention check. */
  erase(ctx: PrivacyContext, ref: PersonRecordRef, mode: 'delete' | 'anonymize'): Promise<void>;
  retentionCandidates(ctx: PrivacyContext, query: RetentionCandidateQuery): Promise<RetentionCandidatePage>;
}
