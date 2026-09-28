import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiPropertyOptional({ description: 'Google ID token (JWT) from client' })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional({ description: 'Google OAuth access token' })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Display name from Google profile' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ description: 'Full name from Google profile' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({ description: 'Email from Google profile' })
  @IsOptional()
  @IsString()
  email?: string;
}
