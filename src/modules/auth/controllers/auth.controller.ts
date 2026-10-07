import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { RATE_LIMITS } from '../../../common/throttling/rate-limits.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { AuthTokensResponseDto, AuthUserDto } from '../dto/auth-response.dto.js';
import { ClerkLoginDto } from '../dto/clerk-login.dto.js';
import { GoogleLoginDto } from '../dto/google-login.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { RefreshTokenDto } from '../dto/refresh-token.dto.js';
import { RegisterStartDto } from '../dto/register-start.dto.js';
import { RegisterVerifyDto } from '../dto/register-verify.dto.js';
import { RegisterResendDto } from '../dto/register-resend.dto.js';
import { PasswordResetStartDto } from '../dto/password-reset-start.dto.js';
import { PasswordResetConfirmDto } from '../dto/password-reset-confirm.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';
import { AuthService } from '../services/auth.service.js';
import { RegistrationService } from '../services/registration.service.js';
import { PasswordResetService } from '../services/password-reset.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly registration: RegistrationService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register/start')
  @Throttle({ default: RATE_LIMITS.registrationStart })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a registration verification code' })
  startRegistration(@Body() input: RegisterStartDto) {
    return this.registration.start(input);
  }

  @Post('register/resend')
  @Throttle({ default: RATE_LIMITS.registrationResend })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the registration verification code' })
  resendRegistration(@Body() input: RegisterResendDto) {
    return this.registration.resend(input.email);
  }

  @Post('register/verify')
  @Throttle({ default: RATE_LIMITS.registrationVerify })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify email and create a USER account' })
  @ApiNoContentResponse()
  verifyRegistration(@Body() input: RegisterVerifyDto): Promise<void> {
    return this.registration.verify(input.email, input.code);
  }

  @Post('password-reset/start')
  @Throttle({ default: RATE_LIMITS.passwordResetStart })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a password reset code when an active account exists' })
  startPasswordReset(@Body() input: PasswordResetStartDto) {
    return this.passwordReset.start(input.email);
  }

  @Post('password-reset/confirm')
  @Throttle({ default: RATE_LIMITS.passwordResetConfirm })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using the email code and revoke sessions' })
  @ApiNoContentResponse()
  confirmPasswordReset(@Body() input: PasswordResetConfirmDto): Promise<void> {
    return this.passwordReset.confirm(input);
  }

  @Post('login')
  @Throttle({ default: RATE_LIMITS.login })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or disabled account' })
  login(@Body() input: LoginDto, @Req() request: FastifyRequest): Promise<AuthTokensResponseDto> {
    return this.authService.login(input, {
      ipAddress: request.ip,
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    });
  }

  @Post('clerk')
  @Throttle({ default: RATE_LIMITS.authSession })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or sync user authenticated via Clerk' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Disabled account' })
  loginClerk(
    @Body() input: ClerkLoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthTokensResponseDto> {
    // Only the trusted Next.js server may exchange an authenticated Clerk identity.
    const secret = this.config.get<string>('CLERK_SYNC_SECRET');
    if (!secret) throw new ServiceUnavailableException('CLERK_SYNC_NOT_CONFIGURED');
    const supplied = request.headers['x-clerk-sync-secret'];
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
    )
      throw new UnauthorizedException('UNAUTHORIZED');
    return this.authService.loginWithClerk(input, {
      ipAddress: request.ip,
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    });
  }

  @Post('google')
  @Throttle({ default: RATE_LIMITS.authSession })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or sync user authenticated via Google' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Google token or disabled account' })
  loginGoogle(
    @Body() input: GoogleLoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthTokensResponseDto> {
    return this.authService.loginWithGoogle(input, {
      ipAddress: request.ip,
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    });
  }

  @Post('refresh')
  @Throttle({ default: RATE_LIMITS.authSession })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new token pair' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, revoked or reused refresh token' })
  refresh(@Body() input: RefreshTokenDto): Promise<AuthTokensResponseDto> {
    return this.authService.refresh(input.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the authenticated identity' })
  @ApiOkResponse({ type: AuthUserDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: AuthenticatedUser): AuthUserDto {
    return { id: user.id, email: user.email, role: user.role };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke the current refresh-token session' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse()
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.authService.logout(user.sessionId);
  }
}
