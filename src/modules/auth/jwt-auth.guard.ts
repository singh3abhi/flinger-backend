import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from '@/common/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { UnauthorizedError } from '@/common/errors/domain-error';
import { AuthService } from './auth.service';
import type { AccessClaims } from './token.service';

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard: every route needs a valid access token unless marked @Public().
 * Besides the signature and expiry, it checks that the device session still exists, so logout and
 * "stolen token" revocations take effect immediately rather than after the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = bearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedError();

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
      throw new UnauthorizedError();
    }

    const user = await this.auth.validateSession(claims.sub, claims.sid);
    if (!user) throw new UnauthorizedError('Your session has ended. Please sign in again.');
    request.user = user;
    return true;
  }
}
