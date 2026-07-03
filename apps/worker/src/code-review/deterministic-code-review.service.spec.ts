import { describe, expect, it } from 'vitest';
import { DeterministicCodeReviewService } from './deterministic-code-review.service';

describe('DeterministicCodeReviewService', () => {
  it('generates stable structured output from project analysis only', () => {
    const analysis = { techStack: [{ name: 'TypeScript', category: 'language' }], coreModules: [{ name: 'API', path: 'src/api', description: 'HTTP API' }], statistics: { totalFiles: 12, totalLines: 400, languages: { TypeScript: 400 } } };
    const first = new DeterministicCodeReviewService().review(analysis);
    const second = new DeterministicCodeReviewService().review(analysis);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ model: 'deterministic-code-review-v1', score: expect.any(Number), result: { overview: expect.any(String), strengths: expect.any(Array), risks: expect.any(Array), suggestions: expect.any(Array), maintainability: expect.any(Object), security: expect.any(Object), performance: expect.any(Object) } });
    expect(first.score).toBeGreaterThanOrEqual(0); expect(first.score).toBeLessThanOrEqual(100);
  });
});
