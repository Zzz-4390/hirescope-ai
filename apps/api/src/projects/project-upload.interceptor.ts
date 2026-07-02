import { CallHandler, ExecutionContext, NestInterceptor, Type, UnsupportedMediaTypeException, mixin } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { diskStorage } from 'multer';
import { catchError, from, mergeMap, throwError } from 'rxjs';

const ZIP_MIME_TYPES = new Set(['application/zip', 'application/x-zip-compressed']);

export function ProjectFileInterceptor(): Type<NestInterceptor> {
  const storageRoot = process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage');
  const DiskFileInterceptor = FileInterceptor('file', {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        const temporaryDirectory = join(storageRoot, 'tmp');
        void mkdir(temporaryDirectory, { recursive: true })
          .then(() => callback(null, temporaryDirectory))
          .catch((error: Error) => callback(error, temporaryDirectory));
      },
      filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
    }),
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (extname(file.originalname).toLowerCase() !== '.zip' || !ZIP_MIME_TYPES.has(file.mimetype)) {
        return callback(new UnsupportedMediaTypeException({ code: 'INVALID_ZIP_FILE', message: '只允许上传 ZIP 文件' }), false);
      }
      callback(null, true);
    },
  });
  class CleanupProjectFileInterceptor extends DiskFileInterceptor {
    override async intercept(context: ExecutionContext, next: CallHandler) {
      const stream = await super.intercept(context, next);
      return stream.pipe(catchError((error) => {
        const file = context.switchToHttp().getRequest<{ file?: Express.Multer.File }>().file;
        if (!file?.path) return throwError(() => error);
        return from(rm(file.path, { force: true })).pipe(mergeMap(() => throwError(() => error)));
      }));
    }
  }
  return mixin(CleanupProjectFileInterceptor);
}
