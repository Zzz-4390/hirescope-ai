import { isAbsolute, relative, resolve } from 'node:path';

export class StoragePathService {
  readonly root: string;
  constructor(storageRoot: string) { this.root = resolve(storageRoot); }

  resolveStoredPath(storedPath: string): string {
    if (!storedPath || isAbsolute(storedPath)) throw new Error('STORAGE_PATH_INVALID');
    const absolute = resolve(this.root, storedPath);
    this.assertContained(absolute);
    return absolute;
  }

  assertDeletable(path: string): string {
    const absolute = resolve(path);
    this.assertContained(absolute);
    if (absolute === this.root) throw new Error('STORAGE_PATH_INVALID');
    return absolute;
  }

  private assertContained(absolute: string): void {
    const child = relative(this.root, absolute);
    if (!child || child === '..' || child.startsWith(`..\\`) || child.startsWith('../') || isAbsolute(child)) throw new Error('STORAGE_PATH_INVALID');
  }
}
