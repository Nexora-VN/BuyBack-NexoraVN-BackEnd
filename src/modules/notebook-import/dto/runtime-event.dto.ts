import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RuntimeEventDto {
  @IsUUID()
  sessionId!: string;

  @IsIn(['OPENED', 'LOADED', 'ERROR', 'HEARTBEAT'])
  event!: 'OPENED' | 'LOADED' | 'ERROR' | 'HEARTBEAT';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  error?: string;
}
