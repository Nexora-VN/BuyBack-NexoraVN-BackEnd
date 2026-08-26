export const UserRole = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  DELETED: 'DELETED',
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ConvertOrigin = {
  SYSTEM: 'SYSTEM',
  PARTY: 'PARTY',
} as const;

export type ConvertOrigin = (typeof ConvertOrigin)[keyof typeof ConvertOrigin];

export const AffiliateLinkStatus = {
  WORKING: 'WORKING',
  DELETED: 'DELETED',
  EXPIRED: 'EXPIRED',
} as const;

export type AffiliateLinkStatus = (typeof AffiliateLinkStatus)[keyof typeof AffiliateLinkStatus];
