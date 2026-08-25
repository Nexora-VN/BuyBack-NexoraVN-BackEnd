import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaUsersRepository } from './repositories/prisma-users.repository.js';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersController } from './controllers/users.controller.js';
import { UsersService } from './services/users.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    PrismaUsersRepository,
    {
      provide: UsersRepository,
      useExisting: PrismaUsersRepository,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
