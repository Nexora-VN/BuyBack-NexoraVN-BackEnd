import { ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole, UserStatus } from '../../../common/domain/enums.js';
import type {
  CreateUserData,
  FindUsersResult,
  UpdateUserData,
  UserRecord,
} from '../repositories/users.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { UsersService } from './users.service.js';

const now = new Date('2026-08-25T00:00:00.000Z');
const actorId = '00000000-0000-4000-8000-000000000001';

class InMemoryUsersRepository extends UsersRepository {
  private readonly users = new Map<string, UserRecord>();

  create(data: CreateUserData): Promise<UserRecord> {
    const user: UserRecord = {
      id: crypto.randomUUID(),
      displayName: null,
      fullName: null,
      deleteAt: null,
      deleteBy: null,
      createdBy: data.createdBy ?? null,
      updatedBy: data.updatedBy ?? null,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  findMany(): Promise<FindUsersResult> {
    const items = [...this.users.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }

  findByPhoneNumber(phoneNumber: string): Promise<UserRecord | null> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.phoneNumber === phoneNumber) ?? null,
    );
  }

  update(id: string, data: UpdateUserData): Promise<UserRecord> {
    const current = this.users.get(id);
    if (!current) throw new Error('Test repository invariant failed');
    const updated = { ...current, ...data, updatedAt: now };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }

  softDelete(id: string, deletedBy: string): Promise<void> {
    const current = this.users.get(id);
    if (!current) throw new Error('Test repository invariant failed');
    this.users.set(id, {
      ...current,
      status: UserStatus.DELETED,
      deleteAt: now,
      deleteBy: deletedBy,
      updatedBy: deletedBy,
    });
    return Promise.resolve();
  }
}

describe('UsersService', () => {
  let repository: InMemoryUsersRepository;
  let service: UsersService;

  beforeEach(() => {
    repository = new InMemoryUsersRepository();
    service = new UsersService(repository);
  });

  it('creates a user with normalized email and hashed password', async () => {
    const response = await service.create(
      {
        email: '  USER@Example.com ',
        phoneNumber: '+84901234567',
        password: 'password123',
      },
      actorId,
    );
    const stored = await repository.findById(response.id);

    expect(response).toMatchObject({
      email: 'user@example.com',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });
    expect(response).not.toHaveProperty('passwordHash');
    expect(stored).not.toBeNull();
    await expect(argon2.verify(stored!.passwordHash, 'password123')).resolves.toBe(true);
  });

  it('rejects a duplicated email', async () => {
    await service.create(
      { email: 'user@example.com', phoneNumber: '+84901234567', password: 'password123' },
      actorId,
    );
    await expect(
      service.create(
        { email: 'USER@example.com', phoneNumber: '+84907654321', password: 'password123' },
        actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns not found for an unknown user', async () => {
    await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
