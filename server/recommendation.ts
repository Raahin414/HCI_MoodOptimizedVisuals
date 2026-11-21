import { variantIds, MOODS, type VariantId, type Mood } from '../src/domain.js';
export const median = (values: number[]) => {
  const a = values.filter(Number.isFinite).sort((a, b) => a - b);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : null;
};
const mean = (a: number[]) => (a.length ? a.reduce((n, v) => n + v, 0) / a.length : null);
export function summarize(data: Record<string, any[]>, includeSynthetic = false) {
  const people = new Set(
    (data.participants || [])
      .filter((p) => includeSynthetic || p.source_type === 'real')
      .map((p) => p.id),
  );
  const sessions = (data.sessions || []).filter(
    (s) =>
      people.has(s.participant_id) &&
      s.consented_at &&
      s.consent_version &&
      (s.mode || 'study') === 'study' &&
      (includeSynthetic || s.source_type === 'real'),
  );
  const ids = new Set(sessions.map((s) => s.id));
  const eligible = (r: any) =>
    ids.has(r.session_id) &&
    sessions.find((s) => s.id === r.session_id)?.participant_id === r.participant_id &&
    (includeSynthetic || r.source_type === 'real');
  const trials = (data.trials || []).filter((t) => eligible(t) && t.status !== 'active');
  const feedback = (data.variant_feedback || []).filter(eligible);
  const familyTimes = Object.fromEntries(
    [...new Set(trials.map((t) => t.task_family))].map((f) => [
      f,
      median(
        trials
          .filter((t) => t.task_family === f && t.status === 'success')
          .map((t) => t.elapsed_ms),
      ) || 1,
    ]),
  );
  const cell = (ui: string, mood?: string) => {
    const subset = trials.filter(
      (t) =>
        t.ui_variant === ui &&
        (!mood || sessions.find((s) => s.id === t.session_id)?.mood === mood),
    );
    const participants = [...new Set(subset.map((t) => t.participant_id))];
    const ratings = feedback.filter(
      (f) =>
        f.ui_variant === ui &&
        (!mood || sessions.find((s) => s.id === f.session_id)?.mood === mood),
    );
    const perParticipant = (records: any[], fn: (r: any[]) => number | null) =>
      participants
        .map((p) => fn(records.filter((r) => r.participant_id === p)))
        .filter((v): v is number => v !== null);
    return {
      ui_variant: ui,
      mood: mood || 'all',
      unique_participants: participants.length,
      exposures: new Set(subset.map((t) => t.session_id)).size,
      trial_count: subset.length,
      success_rate: mean(
        perParticipant(subset, (r) =>
          r.length ? r.filter((t) => t.status === 'success').length / r.length : null,
        ),
      ),
      median_successful_ms: median(
        perParticipant(subset, (r) =>
          median(r.filter((t) => t.status === 'success').map((t) => t.elapsed_ms)),
        ),
      ),
      mean_successful_ms: mean(
        perParticipant(subset, (r) =>
          mean(r.filter((t) => t.status === 'success').map((t) => t.elapsed_ms)),
        ),
      ),
      status_counts: Object.fromEntries(
        ['success', 'incorrect', 'timeout', 'give_up', 'abandoned'].map((status) => [
          status,
          subset.filter((t) => t.status === status).length,
        ]),
      ),
      normalized_time: median(
        perParticipant(subset, (r) =>
          median(
            r
              .filter((t) => t.status === 'success')
              .map((t) => t.elapsed_ms / familyTimes[t.task_family]),
          ),
        ),
      ),
      effort: mean(perParticipant(ratings, (r) => mean(r.map((f) => f.effort)))),
      satisfaction: mean(perParticipant(ratings, (r) => mean(r.map((f) => f.satisfaction)))),
      reuse_intent: mean(perParticipant(ratings, (r) => mean(r.map((f) => f.reuse_intent)))),
      errors: subset.reduce((n, t) => n + t.error_count, 0),
    };
  };
  const preferencePairs = sessions
    .map((s) => {
      const initial = (data.gallery_choices || []).find(
        (c) => eligible(c) && c.session_id === s.id && c.phase === 'initial',
      );
      const own = trials.filter(
        (t) => t.session_id === s.id && t.ui_variant === initial?.ui_variant,
      );
      const other = trials.filter(
        (t) => t.session_id === s.id && t.ui_variant !== initial?.ui_variant,
      );
      return own.length && other.length
        ? {
            participant_id: s.participant_id,
            own: own.filter((t) => t.status === 'success').length / own.length,
            other: other.filter((t) => t.status === 'success').length / other.length,
          }
        : null;
    })
    .filter((r): r is { participant_id: string; own: number; other: number } => r !== null);
  const participants = [...new Set(preferencePairs.map((p) => p.participant_id))];
  const preferenceComparison = {
    measurable_participants: participants.length,
    initial_preference_success: mean(
      participants.map((p) =>
        mean(preferencePairs.filter((r) => r.participant_id === p).map((r) => r.own))!,
      ),
    ),
    other_assigned_success: mean(
      participants.map((p) =>
        mean(preferencePairs.filter((r) => r.participant_id === p).map((r) => r.other))!,
      ),
    ),
    interpretation:
      'Descriptive paired subset only; preferred UI was not necessarily assigned. No independent adaptation benefit has been tested.',
  };
  return {
    participant_count: new Set(sessions.map((s) => s.participant_id)).size,
    completed_sessions: sessions.filter((s) => s.status === 'complete').length,
    incomplete_sessions: sessions.filter((s) => s.status !== 'complete').length,
    mood_distribution: Object.fromEntries(
      [...MOODS.map((m) => m.id), 'unclassified'].map((m) => [
        m,
        sessions.filter((s) => (s.mood || 'unclassified') === m).length,
      ]),
    ),
    coverage: MOODS.flatMap((m) => variantIds.map((ui) => cell(ui, m.id))),
    overall: variantIds.map((ui) => cell(ui)),
    preference_comparison: preferenceComparison,
    preference_changes: (data.gallery_choices || [])
      .filter((c) => c.phase === 'final' && eligible(c))
      .map((c) => ({
        session_id: c.session_id,
        initial: (data.gallery_choices || []).find(
          (a) => eligible(a) && a.session_id === c.session_id && a.phase === 'initial',
        )?.ui_variant,
        final: c.ui_variant,
        tested: c.tested,
      })),
    configuration: {
      study_version: 'moodspace-1.0',
      variants: variantIds,
      moods: MOODS.map((m) => m.id),
      timeout_seconds: 90,
      variants_per_person: 4,
      tasks_per_variant: 2,
      min_support: 8,
    },
    h3: 'unverified',
  };
}
export function recommend(
  summary: ReturnType<typeof summarize>,
  mood: Mood,
  preferred: VariantId = 'U01',
  explicitPreference = true,
) {
  const cells = summary.coverage.filter((c) => c.mood === mood);
  let pool = cells;
  let method = 'empirical-mood';
  if (pool.length !== 8 || pool.some((c) => c.unique_participants < 8)) {
    pool = summary.overall;
    method = 'overall-baseline';
  }
  if (pool.some((c) => c.unique_participants < 8) || !pool.length)
    return {
      state: 'insufficient_evidence',
      method: 'user-choice',
      version: 'lexicographic-v1.1',
      ui_variant: preferred,
      mood,
      support: (cells.length ? cells : summary.overall).map((c) => ({
        ui: c.ui_variant,
        n: c.unique_participants,
      })),
      candidates: (cells.length ? cells : summary.overall).map((c) => ({
        ...c,
        eligible: c.unique_participants >= 8,
        missing_support: Math.max(0, 8 - c.unique_participants),
      })),
      selection_source: explicitPreference ? 'user-preference' : 'neutral-fallback',
      sample_size: 0,
      reason:
        'At least 8 distinct real participants are needed in each of the 8 compared cells. ' +
        (explicitPreference
          ? 'Your own choice is the fallback.'
          : 'Quiet Focus is a neutral starting interface, not a mood-specific winner.'),
      alternatives: variantIds.filter((v) => v !== preferred),
      h3: 'unverified',
    };
  const rank = [...pool].sort(
    (a, b) =>
      (b.success_rate ?? 0) - (a.success_rate ?? 0) ||
      (a.normalized_time ?? Infinity) - (b.normalized_time ?? Infinity) ||
      (a.effort ?? Infinity) - (b.effort ?? Infinity) ||
      (b.satisfaction ?? 0) - (a.satisfaction ?? 0),
  );
  const winner = rank[0];
  const ties = rank.filter(
    (c) =>
      Math.abs((c.success_rate ?? 0) - (winner.success_rate ?? 0)) < 0.01 &&
      (c.normalized_time === winner.normalized_time ||
        (c.normalized_time !== null &&
          winner.normalized_time !== null &&
          Math.abs(c.normalized_time - winner.normalized_time) < 0.05)),
  );
  const selected = ties.find((c) => c.ui_variant === preferred) || winner;
  return {
    state: 'exploratory',
    method,
    version: 'lexicographic-v1.1',
    ui_variant: selected.ui_variant,
    mood,
    support: rank.map((c) => ({ ui: c.ui_variant, n: c.unique_participants })),
    sample_size: selected.unique_participants,
    selection_source: method === 'empirical-mood' ? 'mood-evidence' : 'overall-evidence',
    candidates: rank.map((c) => ({ ...c, eligible: true, missing_support: 0 })),
    tied_options: ties.map((c) => c.ui_variant),
    reason:
      ties.length > 1
        ? 'Several options are practically tied; keep your preference.'
        : 'Ranked by participant-level success, family-normalized time, effort, then satisfaction. Observational evidence; improvement is unverified.',
    alternatives: rank.filter((c) => c.ui_variant !== selected.ui_variant).map((c) => c.ui_variant),
    h3: 'unverified',
  };
}
