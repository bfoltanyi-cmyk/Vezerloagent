import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthContext, PermissionGuard, PERMISSIONS_KEY, PUBLIC_KEY } from './permission.guard';
import { BUILT_IN_ROLES, Permission, permissionsForRoles } from './permissions';

function contextFor(meta: Record<string, unknown>, auth?: AuthContext): ExecutionContext {
  const handler = () => undefined;
  Reflect.defineMetadata(PERMISSIONS_KEY, meta[PERMISSIONS_KEY], handler);
  Reflect.defineMetadata(PUBLIC_KEY, meta[PUBLIC_KEY], handler);
  return {
    getHandler: () => handler,
    getClass: () => class Dummy {},
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as unknown as ExecutionContext;
}

const authWith = (permissions: Permission[]): AuthContext => ({
  userId: 'u-1',
  companyId: 'c-1',
  permissions: new Set(permissions),
});

describe('PermissionGuard', () => {
  const guard = new PermissionGuard(new Reflector());

  it('denies endpoints without declared permission (deny by default)', () => {
    expect(() => guard.canActivate(contextFor({}, authWith(['reports.read'])))).toThrow(ForbiddenException);
  });

  it('allows public endpoints without auth', () => {
    expect(guard.canActivate(contextFor({ [PUBLIC_KEY]: true }))).toBe(true);
  });

  it('denies unauthenticated requests', () => {
    expect(() => guard.canActivate(contextFor({ [PERMISSIONS_KEY]: ['reports.read'] }))).toThrow(ForbiddenException);
  });

  it('allows when all permissions are present', () => {
    const ctx = contextFor({ [PERMISSIONS_KEY]: ['invoicing.invoice.issue'] }, authWith(['invoicing.invoice.issue']));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when any permission is missing', () => {
    const ctx = contextFor(
      { [PERMISSIONS_KEY]: ['invoicing.invoice.read', 'invoicing.invoice.issue'] },
      authWith(['invoicing.invoice.read']),
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('built-in roles (PRD P-1, AC-19)', () => {
  it('warehouse role cannot invoice or change settings', () => {
    const p = permissionsForRoles(['warehouse']);
    expect(p.has('invoicing.invoice.issue')).toBe(false);
    expect(p.has('invoicing.invoice.read')).toBe(false);
    expect(p.has('platform.settings.manage')).toBe(false);
  });

  it('manager and accountant roles have no write permission', () => {
    for (const role of ['manager', 'accountant'] as const) {
      const writes = BUILT_IN_ROLES[role].filter((p) => !p.endsWith('.read') && p !== 'reports.export');
      expect(writes).toEqual([]);
    }
  });

  it('admin does not see restricted personal data by default', () => {
    expect(permissionsForRoles(['admin']).has('privacy.restricted.read')).toBe(false);
  });
});
