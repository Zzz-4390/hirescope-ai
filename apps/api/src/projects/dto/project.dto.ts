import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ProjectStatus } from '@prisma/client';

export class CreateProjectDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 120)
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;
}

export class ListProjectsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional() @IsString() @Length(1, 120) keyword?: string;
}
