import { MOODS, VARIANTS } from './domain';
const pct = (v: number | null) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const seconds = (v: number | null) => (v == null ? '—' : (v / 1000).toFixed(1) + ' s');
function Bars({ rows, max = 1 }: { rows: { label: string; value: number }[]; max?: number }) {
  return (
    <div className="data-bars">
      {rows.map((r) => (
        <div key={r.label}>
          <span>{r.label}</span>
          <div className="data-bar-track">
            <span style={{ width: Math.min(100, (r.value / Math.max(1, max)) * 100) + '%' }} />
          </div>
          <strong>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}
export default function ResearchAnalytics({ data: d }: { data: any }) {
  const decisions = d.recommendation_decisions;
  return (
    <>
      <section className="research-panel">
        <h2>Observed mood and completion coverage</h2>
        <p>
          Only consented genuine study sessions contribute to these descriptive charts. Zero bars
          stay zero.
        </p>
        <div className="analytics-columns">
          <div>
            <h3>Study sessions by starting mood</h3>
            <Bars
              rows={MOODS.map((m) => ({ label: m.short, value: d.mood_distribution[m.id] || 0 }))}
              max={Math.max(...MOODS.map((m) => d.mood_distribution[m.id] || 0), 1)}
            />
          </div>
          <div>
            <h3>Unique observed participants per interface</h3>
            <Bars
              rows={d.overall.map((c: any) => ({
                label: c.ui_variant,
                value: c.unique_participants,
              }))}
              max={Math.max(...d.overall.map((c: any) => c.unique_participants), 1)}
            />
          </div>
        </div>
        <p>
          Personal workspace sessions: {d.workspace_sessions}. Follow-up ratings:{' '}
          {d.workspace_feedback}. These are excluded from randomized-trial ranking.
        </p>
        <p>
          Missing observations: {d.missing_observations.active_trials} active trials,{' '}
          {d.missing_observations.unattempted_trials} allocated tasks not attempted,{' '}
          {d.missing_observations.missing_variant_ratings} assigned-interface ratings not yet
          submitted.
        </p>
      </section>
      <section className="research-panel">
        <h2>Successful completion time · participant-weighted</h2>
        <p>
          Mean and median summarize each participant before combining people. Failures are not
          counted as fast completions.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Design</th>
                <th>Mean successful time</th>
                <th>Median successful time</th>
                <th>Successful trials</th>
                <th>Timeout / give-up / abandoned</th>
              </tr>
            </thead>
            <tbody>
              {d.overall.map((c: any) => (
                <tr key={c.ui_variant}>
                  <th>{c.ui_variant}</th>
                  <td>{seconds(c.mean_successful_ms)}</td>
                  <td>{seconds(c.median_successful_ms)}</td>
                  <td>{c.status_counts.success}</td>
                  <td>
                    {c.status_counts.timeout + c.status_counts.give_up + c.status_counts.abandoned}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="research-panel">
        <h2>Recommendation decisions</h2>
        <p>
          {decisions.generated} suggestions generated · {decisions.decided} decisions ·{' '}
          {decisions.pending} pending. One latest decision per session; the original recommended
          design is retained.
        </p>
        <div className="readiness-grid">
          <article>
            <strong>Accepted</strong>
            <p>
              {decisions.accepted} · {pct(decisions.acceptance_rate)}
            </p>
          </article>
          <article>
            <strong>Rejected / overridden</strong>
            <p>
              {decisions.rejected + decisions.manual_overrides} · {pct(decisions.rejection_rate)}
            </p>
          </article>
          <article>
            <strong>Manual overrides</strong>
            <p>{decisions.manual_overrides}</p>
          </article>
        </div>
        {d.recommendation_by_mode.map((r: any) => (
          <p key={r.mode}>
            {r.mode}: {r.accepted} accepted, {r.rejected} rejected, {r.manual_overrides} overridden,{' '}
            {r.pending} pending.
          </p>
        ))}
        <p>
          No acceptance rate proves that adaptation improves performance. Static-baseline
          comparisons remain descriptive until a prospective test.
        </p>
      </section>
      <section className="research-panel">
        <h2>Mood model readiness and performance</h2>
        {d.public_model_status?.available && (
          <div className="prediction-note">
            <strong>External public-corpus experiment · separate from study validation</strong>
            <p>
              Held-out annotated-comment performance; fear/nervousness is a stress proxy.
              Participant-group validation and UI superiority are not established.
            </p>
            <pre>{JSON.stringify(d.public_model_status.evaluation, null, 2)}</pre>
          </div>
        )}
        <p>
          {d.model_status.available
            ? 'Validated local artifact available; inference remains optional.'
            : d.model_status.reason}
        </p>
        {d.model_status.evaluation && (
          <dl>
            {Object.entries(d.model_status.evaluation).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll('_', ' ')}</dt>
                <dd>{typeof value === 'number' ? value.toFixed(3) : String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {d.prediction_performance.map((p: any) => (
          <p key={p.method}>
            {p.method}: {p.paired_reports} genuine paired reports · agreement {pct(p.agreement)}.{' '}
            {p.interpretation}
          </p>
        ))}
        <p>
          Grouped macro-F1, balanced accuracy, confusion matrix and majority baseline are shown only
          when a valid evaluation artifact exists. Uncalibrated model scores are not displayed as
          confidence.
        </p>
        {d.model_status.confusion_matrix && (
          <pre>{JSON.stringify(d.model_status.confusion_matrix, null, 2)}</pre>
        )}
      </section>
    </>
  );
}
