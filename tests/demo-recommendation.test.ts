import { describe, it, expect } from 'vitest';
import { recommendWorkspace } from '../server/demoRecommendation';
import { summarize } from '../server/recommendation';
describe('optional mood-guided design demonstration', () => {
  const empty = summarize({});
  for (const [mood, ui] of [
    ['positive', 'U02'],
    ['neutral', 'U08'],
    ['stressed', 'U01'],
  ] as const)
    it(mood + ' offers a rendered candidate without inventing evidence', () => {
      const result = recommendWorkspace(empty, mood, 'U01', false, true);
      expect(result).toMatchObject({
        ui_variant: ui,
        state: 'insufficient_evidence',
        method: 'mood-guided-design-demo',
        selection_source: 'design-heuristic',
        sample_size: 0,
      });
      expect(result.candidates).toHaveLength(8);
      expect(result.reason).toContain('not evidence');
      expect(result.alternatives).toHaveLength(7);
    });
  it('keeps opt-out and explicit preference authoritative', () => {
    expect(recommendWorkspace(empty, 'positive', 'U01', false, false).selection_source).toBe(
      'neutral-fallback',
    );
    expect(recommendWorkspace(empty, 'stressed', 'U05', true, true)).toMatchObject({
      selection_source: 'user-preference',
      ui_variant: 'U05',
    });
    expect(recommendWorkspace(empty, 'unclassified', 'U01', false, true).selection_source).toBe(
      'neutral-fallback',
    );
  });
});
