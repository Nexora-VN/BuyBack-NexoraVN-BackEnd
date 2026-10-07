import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class PasswordResetStartDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
