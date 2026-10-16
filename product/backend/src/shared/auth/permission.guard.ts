import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from './permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const PUBLIC_KEY = 'isPublic';

/** Marks an endpoint as requiring all listed permissions. */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Only for login and health endpoints. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Request-scoped identity, set by the authentication middleware (platform module). */
export interface AuthContext {
  userId: string;
  companyId: string;
  permissions: ReadonlySet<Permission>;
}

/**
 * Global guard: deny by default. An endpoint without @RequirePermission or @Public is forbidden.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    if (!required || required.length === 0) {
      throw new ForbiddenException({ code: 'PERMISSION_NOT_DECLARED' });
    }
    const auth = context.switchToHttp().getRequest<{ auth?: AuthContext }>().auth;
    if (!auth) {
      throw new ForbiddenException({ code: 'NOT_AUTHENTICATED' });
    }
    const missing = required.filter((p) => !auth.permissions.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
    }
    return true;
  }
}
