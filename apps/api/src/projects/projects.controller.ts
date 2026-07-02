import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query, UnprocessableEntityException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { DtoValidationPipe } from '../common/validation/dto-validation.pipe';
import { CreateProjectDto, ListProjectsDto } from './dto/project.dto';
import { ProjectFileInterceptor } from './project-upload.interceptor';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(ProjectFileInterceptor())
  create(@CurrentUser() user: AuthenticatedUser, @Body(new DtoValidationPipe(CreateProjectDto)) dto: CreateProjectDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: '必须上传 ZIP 文件' });
    return this.projects.create(user.userId, dto, file);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query(new DtoValidationPipe(ListProjectsDto)) query: ListProjectsDto) { return this.projects.list(user.userId, query); }

  @Get(':projectId')
  get(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.projects.get(user.userId, projectId); }

  @Delete(':projectId')
  @HttpCode(HttpStatus.ACCEPTED)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.projects.remove(user.userId, projectId); }

  @Get(':projectId/analysis')
  analysis(@CurrentUser() user: AuthenticatedUser, @Param('projectId', new ParseUUIDPipe()) projectId: string) { return this.projects.analysis(user.userId, projectId); }
}
