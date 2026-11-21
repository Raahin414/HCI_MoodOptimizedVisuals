export function additionalMetrics(data: Record<string, any[]>) {
  const realSessions = data.sessions.filter((s) => s.source_type === 'real' && s.consented_at);
  const eligible = (r: any) =>
    r.source_type === 'real' &&
    realSessions.some((s) => s.id === r.session_id && s.participant_id === r.participant_id);
  const records = data.recommendations.filter(eligible);
  const rates = (rows: any[]) => {
    const accepted = rows.filter((r) => r.decision === 'accepted').length,
      rejected = rows.filter((r) => r.decision === 'rejected').length,
      overrides = rows.filter((r) => r.decision === 'manual_override').length,
      decided = accepted + rejected + overrides;
    return {
      generated: rows.length,
      decided,
      accepted,
      rejected,
      manual_overrides: overrides,
      pending: rows.length - decided,
      acceptance_rate: decided ? accepted / decided : null,
      rejection_rate: decided ? (rejected + overrides) / decided : null,
    };
  };
  const predictions = (data.mood_predictions || []).filter(eligible);
  const reports = data.mood_reports.filter(eligible);
  const predictionPerformance = [
    'rule-based demonstration',
    'trained-model',
    'public-corpus-model',
  ].map((method) => {
    const pairs = predictions
      .filter((p) => p.method === method && p.predicted_mood)
      .flatMap((p) => {
        const r = reports.find((r) => r.prediction_id === p.id);
        return r && ['positive', 'neutral', 'stressed'].includes(r.reference_mood || r.mood)
          ? [{ predicted: p.predicted_mood, actual: r.reference_mood || r.mood }]
          : [];
      });
    return {
      method,
      paired_reports: pairs.length,
      agreement: pairs.length
        ? pairs.filter((p) => p.actual === p.predicted).length / pairs.length
        : null,
      interpretation:
        'Descriptive agreement with pre-prediction self-report; not a held-out validation score.',
    };
  });
  const study = realSessions.filter((s) => (s.mode || 'study') === 'study');
  const trials = data.trials
    .filter(eligible)
    .filter((t) => study.some((s) => s.id === t.session_id));
  return {
    recommendation_decisions: rates(records),
    recommendation_by_mode: ['study', 'workspace'].map((mode) => ({
      mode,
      ...rates(
        records.filter((r) =>
          realSessions.some((s) => s.id === r.session_id && (s.mode || 'study') === mode),
        ),
      ),
    })),
    prediction_performance: predictionPerformance,
    workspace_sessions: realSessions.filter((s) => s.mode === 'workspace').length,
    workspace_feedback: (data.workspace_feedback || []).filter(eligible).length,
    missing_observations: {
      active_trials: trials.filter((t) => t.status === 'active').length,
      unattempted_trials: study
        .filter((s) => s.assignments)
        .reduce(
          (n, s) => n + Math.max(0, 8 - trials.filter((t) => t.session_id === s.id).length),
          0,
        ),
      missing_variant_ratings: study.reduce(
        (n, s) =>
          n +
          Math.max(
            0,
            (s.assigned_sequence?.length || 0) -
              data.variant_feedback.filter((f) => eligible(f) && f.session_id === s.id).length,
          ),
        0,
      ),
    },
  };
}
