import { InterviewDifficulty } from '@prisma/client';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

export class CreateInterviewDto {
  @IsInt() @Min(5) @Max(15) questionCount!: number;
  @IsEnum(InterviewDifficulty) difficulty!: InterviewDifficulty;
}
