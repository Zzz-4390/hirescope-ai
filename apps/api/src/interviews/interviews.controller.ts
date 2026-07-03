import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator'; import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; import type { AuthenticatedUser } from '../auth/types/authenticated-user'; import { DtoValidationPipe } from '../common/validation/dto-validation.pipe';
import { CreateInterviewDto } from './dto/create-interview.dto'; import { ListInterviewsDto } from './dto/list-interviews.dto'; import { InterviewsService } from './interviews.service';
@Controller() @UseGuards(JwtAuthGuard)
export class InterviewsController {
  constructor(@Inject(InterviewsService) private readonly interviews: InterviewsService) {}
  @Post('projects/:projectId/interviews') @HttpCode(HttpStatus.ACCEPTED) create(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Body(new DtoValidationPipe(CreateInterviewDto)) dto: CreateInterviewDto) { return this.interviews.create(user.userId, projectId, dto); }
  @Get('projects/:projectId/interviews') list(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Query(new DtoValidationPipe(ListInterviewsDto)) query: ListInterviewsDto) { return this.interviews.list(user.userId, projectId, query); }
  @Get('interviews/:interviewId') get(@CurrentUser() user: AuthenticatedUser, @Param('interviewId', new ParseUUIDPipe()) interviewId: string) { return this.interviews.get(user.userId, interviewId); }
}
