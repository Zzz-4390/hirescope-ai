import { IsUUID } from 'class-validator';

export class InterviewAnswerParamsDto {
  @IsUUID()
  interviewId!: string;

  @IsUUID()
  questionId!: string;
}
