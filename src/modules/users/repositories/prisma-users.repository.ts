import { Injectable } from '@nestjs/common';
import { UserStatus } from '../../../common/domain/enums.js';
import type { UserWhereInput } from '../../../generated/prisma/models/User.js';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service.js';
import type {
  CreateUserData,
  FindUsersOptions,
  FindUsersResult,
  UpdateUserData,
  UserRecord,
} from './users.repository.js';
import { UsersRepository } from './users.repository.js';

@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    return this.prisma.user.create({ data });
  }

  async findMany(options: FindUsersOptions): Promise<FindUsersResult> {
    const where: UserWhereInput = options.search
      ? {
          status: { not: UserStatus.DELETED },
          OR: [
            { email: { contains: options.search, mode: 'insensitive' } },
            { phoneNumber: { contains: options.search } },
            { displayName: { contains: options.search, mode: 'insensitive' } },
            { fullName: { contains: options.search, mode: 'insensitive' } },
          ],
        }
      : { status: { not: UserStatus.DELETED } };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({ where: { id, status: { not: UserStatus.DELETED } } });
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhoneNumber(phoneNumber: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({ where: { phoneNumber } });
  }

  async update(id: string, data: UpdateUserData): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async softDelete(id: string, actorId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.DELETED,
        deleteAt: new Date(),
        deleteBy: actorId,
        updatedBy: actorId,
      },
    });
  }
}
