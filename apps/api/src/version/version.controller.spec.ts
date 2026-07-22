import { HEADERS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it } from 'vitest';
import { VersionController } from './version.controller';

const originalCommitSha = process.env.APP_COMMIT_SHA;

afterEach(() => {
  if (originalCommitSha === undefined) delete process.env.APP_COMMIT_SHA;
  else process.env.APP_COMMIT_SHA = originalCommitSha;
});

describe('VersionController', () => {
  it('returns the image commit SHA with caching disabled', () => {
    process.env.APP_COMMIT_SHA = '1234567890abcdef1234567890abcdef12345678';
    const controller = new VersionController();

    expect(controller.getVersion()).toEqual({ commitSha: '1234567890abcdef1234567890abcdef12345678' });
    expect(Reflect.getMetadata(HEADERS_METADATA, controller.getVersion)).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });
});
