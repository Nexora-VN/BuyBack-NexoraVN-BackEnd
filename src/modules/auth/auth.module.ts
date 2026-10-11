import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { AuthRepository } from './repositories/auth.repository.js';
import { PrismaAuthRepository } from './repositories/prisma-auth.repository.js';
import { AuthService } from './services/auth.service.js';
import { RegistrationMailService } from './services/registration-mail.service.js';
import { RegistrationService } from './services/registration.service.js';
import { PasswordResetService } from './services/password-reset.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    PasswordResetService,
    RegistrationMailService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PrismaAuthRepository,
    {
      provide: AuthRepository,
      useExisting: PrismaAuthRepository,
    },
  ],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
