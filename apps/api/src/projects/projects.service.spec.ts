import { describe, expect, it, vi } from 'vitest';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  it('returns PROJECT_ANALYSIS_NOT_READY only after proving project ownership', async () => {
    const prisma = { project: { findFirst: vi.fn().mockResolvedValue({ id: 'project' }) }, projectAnalysis: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new ProjectsService(prisma as never, {} as never, {} as never);
    await expect(service.analysis('user', 'project')).rejects.toMatchObject({ status: 409 });
    expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project', userId: 'user', status: { not: 'DELETED' } } }));
  });

  it('removes the accepted target file when the database transaction fails', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const uploads = { accept: vi.fn().mockResolvedValue({ absolutePath: 'target.zip', storagePath: 'projects/u/p/source.zip', fileHash: 'a'.repeat(64), fileSize: 4 }), remove };
    const prisma = { $transaction: vi.fn().mockRejectedValue(new Error('database unavailable')) };
    const service = new ProjectsService(prisma as never, uploads as never, {} as never);
    await expect(service.create('user', { name: 'Demo' }, { path: 'temp', originalname: 'demo.zip', mimetype: 'application/zip', size: 4 })).rejects.toThrow('database unavailable');
    expect(remove).toHaveBeenCalledWith('target.zip');
  });

  it('does not start a database transaction when writing the file fails', async () => {
    const prisma = { $transaction: vi.fn() };
    const uploads = { accept: vi.fn().mockRejectedValue(new Error('disk full')) };
    const service = new ProjectsService(prisma as never, uploads as never, {} as never);
    await expect(service.create('user', { name: 'Demo' }, { path: 'temp', originalname: 'demo.zip', mimetype: 'application/zip', size: 4 })).rejects.toThrow('disk full');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
