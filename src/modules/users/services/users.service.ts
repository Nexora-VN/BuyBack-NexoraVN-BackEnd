import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole, UserStatus } from '../../../common/domain/enums.js';
import type { CreateUserDto } from '../dto/create-user.dto.js';
import type { ListUsersQueryDto } from '../dto/list-users-query.dto.js';
import type { UpdateUserDto } from '../dto/update-user.dto.js';
import type { UserListResponseDto, UserResponseDto } from '../dto/user-response.dto.js';
import type { UserRecord } from '../repositories/users.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(input: CreateUserDto, actorId: string): Promise<UserResponseDto> {
    const email = this.normalizeEmail(input.email);
    await this.ensureEmailAvailable(email);
    await this.ensurePhoneNumberAvailable(input.phoneNumber);
    const user = await this.usersRepository.create({
      email,
      phoneNumber: input.phoneNumber.trim(),
      passwordHash: await argon2.hash(input.password),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
      ...(input.fullName === undefined ? {} : { fullName: input.fullName.trim() }),
      role: input.role ?? UserRole.USER,
      status: input.status ?? UserStatus.ACTIVE,
      createdBy: actorId,
      updatedBy: actorId,
    });

    return this.toResponse(user);
  }

  async findMany(query: ListUsersQueryDto): Promise<UserListResponseDto> {
    const { items, total } = await this.usersRepository.findMany({
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
    });

    return {
      data: items.map((item) => this.toResponse(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findById(id: string): Promise<UserResponseDto> {
    return this.toResponse(await this.getUser(id));
  }

  async update(id: string, input: UpdateUserDto, actorId: string): Promise<UserResponseDto> {
    const currentUser = await this.getUser(id);
    const email = input.email ? this.normalizeEmail(input.email) : undefined;
    const phoneNumber = input.phoneNumber?.trim();

    if (email && email !== currentUser.email) {
      await this.ensureEmailAvailable(email);
    }

    if (phoneNumber && phoneNumber !== currentUser.phoneNumber) {
      await this.ensurePhoneNumberAvailable(phoneNumber);
    }

    const user = await this.usersRepository.update(id, {
      ...(email === undefined ? {} : { email }),
      ...(phoneNumber === undefined ? {} : { phoneNumber }),
      ...(input.password === undefined ? {} : { passwordHash: await argon2.hash(input.password) }),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName.trim() }),
      ...(input.fullName === undefined ? {} : { fullName: input.fullName.trim() }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.status === undefined ? {} : { status: input.status }),
      updatedBy: actorId,
    });

    return this.toResponse(user);
  }

  async delete(id: string, actorId: string): Promise<void> {
    await this.getUser(id);
    await this.usersRepository.softDelete(id, actorId);
  }

  private async getUser(id: string): Promise<UserRecord> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    if (await this.usersRepository.findByEmail(email)) {
      throw new ConflictException('Email is already in use');
    }
  }

  private async ensurePhoneNumberAvailable(phoneNumber: string): Promise<void> {
    if (await this.usersRepository.findByPhoneNumber(phoneNumber)) {
      throw new ConflictException('Phone number is already in use');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toResponse(user: UserRecord): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
