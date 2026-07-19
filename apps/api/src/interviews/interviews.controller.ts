import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator'; import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; import type { AuthenticatedUser } from '../auth/types/authenticated-user'; import { DtoValidationPipe } from '../common/validation/dto-validation.pipe';
import { createTypedValidationPipe } from '../common/validation/global-validation.pipe';
import { CreateInterviewDto } from './dto/create-interview.dto'; import { ListInterviewsDto } from './dto/list-interviews.dto'; import { InterviewsService } from './interviews.service';
import { AnswerContentDto } from './dto/answer-content.dto'; import { InterviewAnswerParamsDto } from './dto/interview-answer-params.dto';
import { InterviewReportsService } from './interview-reports.service';
@Controller() @UseGuards(JwtAuthGuard)
export class InterviewsController {
  constructor(@Inject(InterviewsService) private readonly interviews: InterviewsService, @Inject(InterviewReportsService) private readonly reports: InterviewReportsService) {}
  @Post('projects/:projectId/interviews') @HttpCode(HttpStatus.ACCEPTED) create(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Body(new DtoValidationPipe(CreateInterviewDto)) dto: CreateInterviewDto) { return this.interviews.create(user.userId, projectId, dto); }
  @Get('projects/:projectId/interviews') list(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Query(new DtoValidationPipe(ListInterviewsDto)) query: ListInterviewsDto) { return this.interviews.list(user.userId, projectId, query); }
  @Get('interviews/:interviewId') get(@CurrentUser() user: AuthenticatedUser, @Param('interviewId', new ParseUUIDPipe()) interviewId: string) { return this.interviews.get(user.userId, interviewId); }
  @Post('interviews/:interviewId/start') start(@CurrentUser() user: AuthenticatedUser, @Param('interviewId', new ParseUUIDPipe()) interviewId: string) { return this.interviews.start(user.userId, interviewId); }
  @Put('interviews/:interviewId/answers/:questionId') saveAnswer(@CurrentUser() user: AuthenticatedUser, @Param(createTypedValidationPipe(InterviewAnswerParamsDto)) params: InterviewAnswerParamsDto, @Body(createTypedValidationPipe(AnswerContentDto)) dto: AnswerContentDto) { return this.interviews.saveAnswer(user.userId, params.interviewId, params.questionId, dto.content); }
  @Post('interviews/:interviewId/submit') submit(@CurrentUser() user: AuthenticatedUser, @Param('interviewId', new ParseUUIDPipe()) interviewId: string) { return this.interviews.submit(user.userId, interviewId); }
  @Post('interviews/:interviewId/report') @HttpCode(HttpStatus.ACCEPTED) createReport(@CurrentUser() user: AuthenticatedUser, @Param('interviewId', new ParseUUIDPipe()) interviewId: string) { return this.reports.create(user.userId, interviewId); }
  @Get('interviews/:interviewId/report') getReport(@CurrentUser() user: AuthenticatedUser, @Param('interviewId', new ParseUUIDPipe()) interviewId: string) { return this.reports.get(user.userId, interviewId); }
}
