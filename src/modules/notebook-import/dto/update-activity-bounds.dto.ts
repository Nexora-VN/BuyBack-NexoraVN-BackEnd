import { IsNumber, Min } from 'class-validator';

export class UpdateActivityBoundsDto {
  @IsNumber() @Min(0) x!: number;
  @IsNumber() @Min(0) y!: number;
  @IsNumber() @Min(1) width!: number;
  @IsNumber() @Min(1) height!: number;
}
