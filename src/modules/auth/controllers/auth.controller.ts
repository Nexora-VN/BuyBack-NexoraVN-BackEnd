import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException, Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { AuthTokensResponseDto, AuthUserDto } from '../dto/auth-response.dto.js';
import { ClerkLoginDto } from '../dto/clerk-login.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { RefreshTokenDto } from '../dto/refresh-token.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';
import { AuthService } from '../services/auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly config: ConfigService) {}

  @Post('login')
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
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) throw new UnauthorizedException('UNAUTHORIZED');
    return this.authService.loginWithClerk(input, {
      ipAddress: request.ip,
      ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    });
  }

  @Post('refresh')
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
