import { CallHandler, ExecutionContext, NestInterceptor, PayloadTooLargeException, Type, mixin } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, MulterError } from 'multer';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function AvatarUploadInterceptor(): Type<NestInterceptor> {
  const MemoryFileInterceptor = FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  });

  class AvatarInterceptor extends MemoryFileInterceptor {
    override async intercept(context: ExecutionContext, next: CallHandler) {
      try {
        return await super.intercept(context, next);
      } catch (error) {
        if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
          throw new PayloadTooLargeException({ code: 'AVATAR_TOO_LARGE', message: '头像文件不能超过 5MB' });
        }
        throw error;
      }
    }
  }

  return mixin(AvatarInterceptor);
}
