import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class ReviewActivityDto {
  @IsIn(['matching-select', 'fill-blank', 'multiple-choice', 'drag-drop', 'sort-order', 'reveal', 'flash-card'])
  type!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  sourceHash?: string;

  @IsOptional()
  @IsIn(['AUTO', 'RUFFLE', 'HTML', 'DISABLED'])
  rendererMode?: 'AUTO' | 'RUFFLE' | 'HTML' | 'DISABLED';
}
