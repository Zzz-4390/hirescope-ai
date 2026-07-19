import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export const ANSWER_CONTENT_MIN_LENGTH = 1;
export const ANSWER_CONTENT_MAX_LENGTH = 5000;

export class AnswerContentDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(ANSWER_CONTENT_MIN_LENGTH)
  @MaxLength(ANSWER_CONTENT_MAX_LENGTH)
  content!: string;
}
