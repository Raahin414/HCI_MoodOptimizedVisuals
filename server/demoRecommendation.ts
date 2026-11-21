import type { Mood, VariantId } from '../src/domain.js';
import { recommend, type summarize } from './recommendation.js';
/** Optional design demonstration. Never used to assign experimental trials. */
export function recommendWorkspace(
  summary: ReturnType<typeof summarize>,
  mood: Mood,
  preferred: VariantId,
  explicitPreference: boolean,
  moodGuidedDemo = false,
) {
  const evidence = recommend(summary, mood, preferred, explicitPreference);
  if (
    !moodGuidedDemo ||
    evidence.state !== 'insufficient_evidence' ||
    explicitPreference ||
    mood === 'unclassified'
  )
    return evidence;
  const rules = {
    positive: {
      id: 'U02',
      reason:
        'Kanban Flow makes the movement between task states visible when you want an active planning view.',
    },
    neutral: {
      id: 'U08',
      reason: 'Daily Brief offers a balanced text overview when you want to scan and decide.',
    },
    stressed: {
      id: 'U01',
      reason: 'Quiet Focus reduces simultaneous choices when you want to work through one item.',
    },
  } as const;
  const selected = rules[mood];
  return {
    ...evidence,
    method: 'mood-guided-design-demo',
    version: 'design-demo-v1',
    selection_source: 'design-heuristic',
    ui_variant: selected.id,
    alternatives: evidence.candidates.map((c) => c.ui_variant).filter((id) => id !== selected.id),
    reason:
      'You opted into a design-rule demonstration. ' +
      selected.reason +
      ' This is a design rationale, not evidence that this UI is best for your mood. All eight layouts remain available.',
    empirical: false,
  };
}
