import type { UserRole, UserStatus } from '../../../common/domain/enums.js';

export interface UserRecord {
  id: string;
  email: string;
  phoneNumber: string;
  passwordHash: string;
  displayName: string | null;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  deleteAt: Date | null;
  deleteBy: string | null;
}

export interface CreateUserData {
  email: string;
  phoneNumber: string;
  passwordHash: string;
  displayName?: string;
  fullName?: string;
  role: UserRole;
  status: UserStatus;
  createdBy?: string;
  updatedBy?: string;
}

export interface UpdateUserData {
  email?: string;
  phoneNumber?: string;
  passwordHash?: string;
  displayName?: string;
  fullName?: string;
  role?: UserRole;
  status?: UserStatus;
  updatedBy?: string;
}

export interface FindUsersOptions {
  skip: number;
  take: number;
  search?: string;
}

export interface FindUsersResult {
  items: UserRecord[];
  total: number;
}

export abstract class UsersRepository {
  abstract create(data: CreateUserData): Promise<UserRecord>;
  abstract findMany(options: FindUsersOptions): Promise<FindUsersResult>;
  abstract findById(id: string): Promise<UserRecord | null>;
  abstract findByEmail(email: string): Promise<UserRecord | null>;
  abstract findByPhoneNumber(phoneNumber: string): Promise<UserRecord | null>;
  abstract update(id: string, data: UpdateUserData): Promise<UserRecord>;
  abstract softDelete(id: string, actorId: string): Promise<void>;
}
