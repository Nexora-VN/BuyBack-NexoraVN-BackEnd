import type { UserRole } from '../../../common/domain/enums.js';

export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  email: string;
  role: UserRole;
}
