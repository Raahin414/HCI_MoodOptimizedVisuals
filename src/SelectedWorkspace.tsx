import { useState } from 'react';
import Workspace from './Workspace';
import { VARIANTS, type Status, type EventType } from './domain';
export default function SelectedWorkspace({
  session: s,
  onEvent,
  onStatus,
  save,
}: {
  session: any;
  onEvent: (t: EventType, id: string) => void;
  onStatus: (id: string, status: Status) => void;
  save: (path: string, b: any) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false),
    [ratings, setRatings] = useState({ satisfaction: '', effort: '' });
  async function change(id: string) {
    setBusy(true);
    setError('');
    try {
      await save('recommendation', { decision: 'manual_override', ui_variant: id });
      setSaved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="context-label">
            After the experiment · active mood: {s.active_mood || s.mood}
          </span>
          <h1>{VARIANTS.find((v) => v.id === s.active_ui)?.name}</h1>
          <p>
            Your confirmed layout and workspace actions are saved. Experimental trials remain
            unchanged.
          </p>
        </div>
        <label>
          Change layout
          <select
            value={s.active_ui}
            aria-label="Change selected interface"
            disabled={busy}
            onChange={(e) => void change(e.target.value)}
          >
            {VARIANTS.map((v) => (
              <option value={v.id} key={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <Workspace id={s.active_ui} tasks={s.sandbox} onEvent={onEvent} onStatus={onStatus} />
      <section className="research-panel">
        <h2>Optional follow-up feedback</h2>
        <p>This rating is recorded separately from assigned-interface study feedback.</p>
        <form
          className="workspace-feedback-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await save('workspace-feedback', {
                satisfaction: +ratings.satisfaction,
                effort: +ratings.effort,
              });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Satisfaction
            <select
              value={ratings.satisfaction}
              aria-label="Selected workspace satisfaction"
              required
              onChange={(e) => setRatings((r) => ({ ...r, satisfaction: e.target.value }))}
            >
              <option value="">Choose 1–5</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Mental effort
            <select
              value={ratings.effort}
              aria-label="Selected workspace effort"
              required
              onChange={(e) => setRatings((r) => ({ ...r, effort: e.target.value }))}
            >
              <option value="">Choose 1–7</option>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button className="primary" disabled={busy || saved}>
            Save follow-up feedback
          </button>
          {saved && <p role="status">Follow-up feedback saved.</p>}
        </form>
      </section>
    </>
  );
}
