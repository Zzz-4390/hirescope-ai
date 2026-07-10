import { describe, expect, it } from 'vitest';
import { workerConfig } from './config';

const REQUIRED = { DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost:6379' };

describe('workerConfig AI provider', () => {
  it('falls back to deterministic questions when all AI variables are absent', () => {
    expect(workerConfig(REQUIRED).ai).toBeUndefined();
  });

  it('loads a complete OpenAI-compatible provider configuration', () => {
    const config = workerConfig({
      ...REQUIRED,
      AI_BASE_URL: 'https://api.deepseek.com/v1',
      AI_API_KEY: 'test-only-key',
      AI_MODEL: 'deepseek-chat',
    });
    expect(config.ai).toEqual({ baseUrl: 'https://api.deepseek.com/v1', apiKey: 'test-only-key', model: 'deepseek-chat' });
  });

  it('rejects partial AI configuration instead of silently falling back', () => {
    expect(() => workerConfig({ ...REQUIRED, AI_BASE_URL: 'https://api.deepseek.com/v1' })).toThrow(
      'AI_BASE_URL, AI_API_KEY and AI_MODEL must be configured together',
    );
  });
});
