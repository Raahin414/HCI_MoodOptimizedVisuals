import { describe, expect, it } from 'vitest';
import { expressionMood } from '../src/faceMood';
describe('expression demo mapping', () => {
  it('maps confident expression groups to exactly three modes', () => {
    expect(expressionMood({ happy: 0.8, neutral: 0.1 })).toBe('positive');
    expect(expressionMood({ neutral: 0.85, happy: 0.1 })).toBe('neutral');
    expect(expressionMood({ fearful: 0.35, sad: 0.3, neutral: 0.2 })).toBe('stressed');
  });
  it('abstains on surprise, empty, weak or ambiguous expressions', () => {
    for (const scores of [
      { surprised: 0.9 },
      {},
      { happy: 0.4, neutral: 0.3 },
      { happy: 0.51, neutral: 0.49 },
    ])
      expect(expressionMood(scores)).toBeNull();
  });
});
