import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { ProjectUploadService } from './project-upload.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({ imports: [TasksModule], controllers: [ProjectsController], providers: [ProjectsService, ProjectUploadService] })
export class ProjectsModule {}
