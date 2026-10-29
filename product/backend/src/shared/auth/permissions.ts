/**
 * Permission catalogue: "<module>.<resource>.<action>".
 * Built-in roles follow PRD P-1. Least privilege by default.
 */
export const PERMISSIONS = [
  'platform.user.manage',
  'platform.role.manage',
  'platform.settings.manage',
  'platform.secret.manage',
  'platform.audit.read',
  'platform.backup.manage',
  'privacy.dsr.manage',
  'privacy.restricted.read',
  'masterdata.partner.read',
  'masterdata.partner.write',
  'masterdata.item.read',
  'masterdata.item.write',
  'masterdata.import.run',
  'invoicing.invoice.read',
  'invoicing.invoice.write',
  'invoicing.invoice.issue',
  'invoicing.invoice.correct',
  'invoicing.payment.write',
  'inventory.stock.read',
  'inventory.document.write',
  'inventory.stocktake.approve',
  'nav.submission.read',
  'nav.submission.retry',
  'reports.read',
  'reports.export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type BuiltInRole = 'admin' | 'invoicer' | 'warehouse' | 'manager' | 'accountant';

const READ_ALL: Permission[] = [
  'masterdata.partner.read',
  'masterdata.item.read',
  'invoicing.invoice.read',
  'inventory.stock.read',
  'nav.submission.read',
  'reports.read',
];

export const BUILT_IN_ROLES: Record<BuiltInRole, readonly Permission[]> = {
  // Admin manages the system; restricted personal data needs an explicit grant.
  admin: PERMISSIONS.filter((p) => p !== 'privacy.restricted.read'),
  invoicer: [
    'masterdata.partner.read',
    'masterdata.partner.write',
    'masterdata.item.read',
    'invoicing.invoice.read',
    'invoicing.invoice.write',
    'invoicing.invoice.issue',
    'invoicing.invoice.correct',
    'invoicing.payment.write',
    'inventory.stock.read',
    'nav.submission.read',
    'nav.submission.retry',
  ],
  warehouse: [
    'masterdata.item.read',
    'inventory.stock.read',
    'inventory.document.write',
    'inventory.stocktake.approve',
  ],
  manager: READ_ALL,
  accountant: [...READ_ALL, 'reports.export'],
};

export function permissionsForRoles(roles: readonly BuiltInRole[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const p of BUILT_IN_ROLES[role]) result.add(p);
  }
  return result;
}
