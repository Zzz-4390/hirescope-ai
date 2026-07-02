import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectUploadService } from './project-upload.service';

describe('ProjectUploadService', () => {
  it('validates a ZIP signature, hashes it, and moves it to a fixed project path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-upload-'));
    const temporaryPath = join(root, 'upload.tmp');
    await writeFile(temporaryPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]));
    const service = new ProjectUploadService(root);

    const result = await service.accept({ path: temporaryPath, originalname: 'demo.ZIP', mimetype: 'application/zip', size: 7 }, 'user-id', 'project-id');

    expect(result.storagePath).toBe('projects/user-id/project-id/source.zip');
    expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(result.absolutePath)).toHaveLength(7);
  });

  it('rejects an invalid ZIP signature and removes the temporary file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-upload-'));
    const temporaryPath = join(root, 'upload.tmp');
    await writeFile(temporaryPath, 'not-a-zip');
    const service = new ProjectUploadService(root);

    await expect(service.accept({ path: temporaryPath, originalname: 'demo.zip', mimetype: 'application/zip', size: 9 }, 'user-id', 'project-id')).rejects.toMatchObject({ status: 422 });
    await expect(readFile(temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
