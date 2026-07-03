import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import { describe, expect, it } from 'vitest';
import { ZipExtractorService, validateZipEntryPath } from './zip-extractor.service';

async function zip(path: string, entries: Record<string, string>): Promise<void> {
  const archive = new ZipFile();
  for (const [name, content] of Object.entries(entries)) archive.addBuffer(Buffer.from(content), name);
  archive.end();
  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) chunks.push(chunk as Buffer);
  await writeFile(path, Buffer.concat(chunks));
}

const limits = { zipMaxBytes: 50 * 1024 * 1024, maxFiles: 5000, maxSingleFileBytes: 2 * 1024 * 1024, maxExtractedBytes: 200 * 1024 * 1024, maxDepth: 30, maxTextReadBytes: 1024 * 1024 };

describe('ZipExtractorService', () => {
  it('rejects traversal, absolute, drive, and overly deep entry paths', () => {
    for (const name of ['../x', '/x', 'C:/x', 'a\\b']) expect(() => validateZipEntryPath(name, 30)).toThrow();
    expect(() => validateZipEntryPath('a/b/c.txt', 2)).toThrow();
  });

  it('extracts through a temporary directory and skips ignored dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-extract-'));
    const source = join(root, 'source.zip');
    const target = join(root, 'extract');
    await zip(source, { 'src/index.ts': 'export {}', 'node_modules/pkg/index.js': 'ignored' });
    const result = await new ZipExtractorService(limits).extract(source, target);
    expect(await readFile(join(target, 'src/index.ts'), 'utf8')).toBe('export {}');
    expect(result.extractedFiles).toBe(1);
    expect(await readdir(root)).not.toContain(expect.stringContaining('.extracting-'));
  });

  it('removes the temporary directory when limits fail', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hirescope-extract-'));
    const source = join(root, 'source.zip');
    await zip(source, { 'a.txt': 'a', 'b.txt': 'b' });
    await expect(new ZipExtractorService({ ...limits, maxFiles: 1 }).extract(source, join(root, 'extract'))).rejects.toThrow('ZIP_FILE_COUNT_EXCEEDED');
    expect((await readdir(root)).filter((name) => name.includes('.extracting-'))).toHaveLength(0);
  });
});
