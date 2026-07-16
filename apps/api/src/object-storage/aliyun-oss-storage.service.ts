import OSS from 'ali-oss';
import { ObjectStorageService, type ObjectUpload } from './object-storage.service';

export interface AliyunOssOptions {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  signedUrlTtlSeconds: number;
}

export class AliyunOssStorageService extends ObjectStorageService {
  private readonly client: OSS;

  constructor(private readonly options: AliyunOssOptions) {
    super();
    this.client = new OSS({
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      bucket: options.bucket,
      region: options.region,
      authorizationV4: true,
    });
  }

  async upload(input: ObjectUpload): Promise<void> {
    await this.client.put(input.objectKey, input.content, {
      headers: {
        'Content-Type': input.contentType,
        'x-oss-object-acl': 'private',
      },
    });
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.delete(objectKey);
  }

  createSignedReadUrl(objectKey: string): Promise<string> {
    return this.client.signatureUrlV4('GET', this.options.signedUrlTtlSeconds, { headers: {} }, objectKey);
  }
}
