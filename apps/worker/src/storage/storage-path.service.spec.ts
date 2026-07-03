import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StoragePathService } from './storage-path.service';

describe('StoragePathService', () => {
  const root = resolve('storage-test-root');
  const service = new StoragePathService(root);

  it('resolves contained relative database paths', () => {
    expect(service.resolveStoredPath('projects/u/p/source.zip')).toBe(resolve(root, 'projects/u/p/source.zip'));
  });

  it('rejects traversal, absolute paths, and the storage root itself', () => {
    expect(() => service.resolveStoredPath('../outside')).toThrow();
    expect(() => service.resolveStoredPath(resolve('outside'))).toThrow();
    expect(() => service.assertDeletable(root)).toThrow();
  });
});
