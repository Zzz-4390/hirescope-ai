import { Controller, Get, Header } from '@nestjs/common';

export interface VersionResponse {
  commitSha: string;
}

@Controller('version')
export class VersionController {
  @Get()
  @Header('Cache-Control', 'no-store')
  getVersion(): VersionResponse {
    return { commitSha: process.env.APP_COMMIT_SHA ?? 'development' };
  }
}
