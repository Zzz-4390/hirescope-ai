import { Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { DtoValidationPipe } from '../common/validation/dto-validation.pipe';
import { CodeReviewsService } from './code-reviews.service';
import { ListCodeReviewsDto } from './dto/list-code-reviews.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CodeReviewsController {
  constructor(@Inject(CodeReviewsService) private readonly reviews: CodeReviewsService) {}
  @Post('projects/:projectId/code-reviews') @HttpCode(HttpStatus.ACCEPTED)
  create(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.reviews.create(user.userId, projectId); }
  @Get('projects/:projectId/code-reviews')
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string, @Query(new DtoValidationPipe(ListCodeReviewsDto)) query: ListCodeReviewsDto) { return this.reviews.list(user.userId, projectId, query); }
  @Get('code-reviews/:codeReviewId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('codeReviewId', new ParseUUIDPipe()) codeReviewId: string) { return this.reviews.get(user.userId, codeReviewId); }
}
