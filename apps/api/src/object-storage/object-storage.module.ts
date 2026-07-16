import { Module } from '@nestjs/common';
import { AliyunOssStorageService } from './aliyun-oss-storage.service';
import { ObjectStorageService } from './object-storage.service';

@Module({
  providers: [
    {
      provide: ObjectStorageService,
      useFactory: () => new AliyunOssStorageService({
        accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
        bucket: process.env.OSS_BUCKET!,
        region: process.env.OSS_REGION!,
        signedUrlTtlSeconds: Number(process.env.OSS_SIGNED_URL_TTL_SECONDS),
      }),
    },
  ],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
