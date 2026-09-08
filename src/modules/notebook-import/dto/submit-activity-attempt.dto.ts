import { IsBoolean, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';

export class SubmitActivityAttemptDto {
  @IsObject()
  result!: Record<string, unknown>;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
