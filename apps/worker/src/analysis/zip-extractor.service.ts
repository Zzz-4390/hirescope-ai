import type { ExtractionLimits } from '@hirescope/shared-types';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', '.next']);

export function validateZipEntryPath(name: string, maxDepth: number): string[] {
  if (!name || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || isAbsolute(name)) throw new Error('ZIP_PATH_INVALID');
  const parts = name.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..') || parts.length > maxDepth) throw new Error('ZIP_PATH_INVALID');
  return parts;
}

function isSymlink(entry: Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0xf000) === 0xa000;
}

export class ZipExtractorService {
  constructor(private readonly limits: ExtractionLimits) {}

  async extract(sourceZip: string, targetDirectory: string): Promise<{ extractedFiles: number; extractedBytes: number }> {
    if ((await stat(sourceZip)).size > this.limits.zipMaxBytes) throw new Error('ZIP_SIZE_EXCEEDED');
    const temporary = `${targetDirectory}.extracting-${randomUUID()}`;
    await rm(temporary, { recursive: true, force: true });
    await mkdir(temporary, { recursive: true });
    try {
      const result = await this.extractEntries(sourceZip, temporary);
      await rm(targetDirectory, { recursive: true, force: true });
      await mkdir(dirname(targetDirectory), { recursive: true });
      await rename(temporary, targetDirectory);
      return result;
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  }

  private async extractEntries(sourceZip: string, temporary: string): Promise<{ extractedFiles: number; extractedBytes: number }> {
    const archive = await new Promise<ZipFile>((resolveArchive, reject) => yauzl.open(sourceZip, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (error, zip) => error || !zip ? reject(error ?? new Error('ZIP_OPEN_FAILED')) : resolveArchive(zip)));
    let extractedFiles = 0;
    let extractedBytes = 0;
    return new Promise((resolveResult, reject) => {
      let settled = false;
      const fail = (error: unknown) => { if (!settled) { settled = true; archive.close(); reject(error); } };
      archive.on('error', fail);
      archive.on('end', () => { if (!settled) { settled = true; resolveResult({ extractedFiles, extractedBytes }); } });
      archive.on('entry', (entry: Entry) => {
        void (async () => {
          const parts = validateZipEntryPath(entry.fileName, this.limits.maxDepth);
          if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return archive.readEntry();
          if (isSymlink(entry)) throw new Error('ZIP_SYMLINK_REJECTED');
          if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error('ZIP_ENCRYPTED_REJECTED');
          const directory = entry.fileName.endsWith('/');
          const destination = resolve(temporary, ...parts);
          if (directory) { await mkdir(destination, { recursive: true }); return archive.readEntry(); }
          extractedFiles += 1;
          if (extractedFiles > this.limits.maxFiles) throw new Error('ZIP_FILE_COUNT_EXCEEDED');
          if (entry.uncompressedSize > this.limits.maxSingleFileBytes) throw new Error('ZIP_SINGLE_FILE_SIZE_EXCEEDED');
          if (extractedBytes + entry.uncompressedSize > this.limits.maxExtractedBytes) throw new Error('ZIP_TOTAL_SIZE_EXCEEDED');
          await mkdir(dirname(destination), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((resolveStream, rejectStream) => archive.openReadStream(entry, (error, value) => error || !value ? rejectStream(error ?? new Error('ZIP_STREAM_FAILED')) : resolveStream(value)));
          let entryBytes = 0;
          const limiter = new Transform({ transform: (chunk: Buffer, _encoding, callback) => {
            entryBytes += chunk.length;
            if (entryBytes > this.limits.maxSingleFileBytes || extractedBytes + entryBytes > this.limits.maxExtractedBytes) return callback(new Error('ZIP_STREAM_SIZE_EXCEEDED'));
            callback(null, chunk);
          } });
          await pipeline(stream, limiter, createWriteStream(destination, { flags: 'wx' }));
          extractedBytes += entryBytes;
          archive.readEntry();
        })().catch(fail);
      });
      archive.readEntry();
    });
  }
}
