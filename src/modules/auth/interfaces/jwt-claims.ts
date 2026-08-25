import type { UserRole } from '../../../common/domain/enums.js';

export type JwtTokenType = 'access' | 'refresh';

export interface JwtClaims {
  sub: string;
  sid: string;
  email: string;
  role: UserRole;
  type: JwtTokenType;
  jti: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}
