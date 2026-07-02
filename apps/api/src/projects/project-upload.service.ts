import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

export interface DiskUpload { path: string; originalname: string; mimetype: string; size: number }

@Injectable()
export class ProjectUploadService {
  constructor(private readonly storageRoot = process.env.STORAGE_ROOT ?? join(process.cwd(), 'storage')) {}

  async accept(file: DiskUpload, userId: string, projectId: string) {
    try {
      const handle = await open(file.path, 'r');
      const signature = Buffer.alloc(4);
      await handle.read(signature, 0, 4, 0);
      await handle.close();
      if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
        throw new UnprocessableEntityException({ code: 'INVALID_ZIP_FILE', message: 'ZIP 文件签名无效' });
      }
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file.path)) hash.update(chunk as Buffer);
      const absolutePath = join(this.storageRoot, 'projects', userId, projectId, 'source.zip');
      await mkdir(dirname(absolutePath), { recursive: true });
      await rename(file.path, absolutePath);
      return {
        absolutePath,
        storagePath: relative(this.storageRoot, absolutePath).replaceAll('\\', '/'),
        fileHash: hash.digest('hex'),
        fileSize: file.size,
      };
    } catch (error) {
      await this.remove(file.path);
      throw error;
    }
  }

  async remove(path: string): Promise<void> { await rm(path, { force: true }); }
}
