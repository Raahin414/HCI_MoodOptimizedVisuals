import { useEffect, useRef, useState } from 'react';
import { api, type Credentials } from './api';
import { VARIANTS, type EventType, type Status } from './domain';
import MoodCheck from './MoodCheck';
import Workspace from './Workspace';
const key = 'moodspace-adaptive-session';
function read(): Credentials | null {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
export default function AdaptiveWorkspace() {
  const [credentials, setCredentials] = useState<Credentials | null>(read),
    [session, setSession] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [consent, setConsent] = useState(false),
    [source, setSource] = useState('demo'),
    [preferred, setPreferred] = useState(''),
    [moodGuided, setMoodGuided] = useState(true),
    [reviewSuggestions, setReviewSuggestions] = useState(false),
    [alternative, setAlternative] = useState('U01'),
    [purpose, setPurpose] = useState(false),
    [savedFeedback, setSavedFeedback] = useState(false),
    [ratings, setRatings] = useState({ satisfaction: '', effort: '', comment: '' });
  const queue = useRef(Promise.resolve()),
    failed = useRef<(() => Promise<void>) | null>(null),
    origin = useRef(performance.now());
  const [resumeCode, setResumeCode] = useState('');
  async function restore() {
    setBusy(true);
    try {
      const [id, token] = resumeCode.trim().split('.');
      const restored = await api('/sessions/' + id, undefined, token);
      if (restored.mode !== 'workspace')
        throw new Error('Use the HCI study page for a study resume code.');
      const auth = { id, token };
      localStorage.setItem(key, JSON.stringify(auth));
      setCredentials(auth);
      setSession(restored);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    api('/health')
      .then((h) => setPurpose(h.test_mode))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (credentials)
      api('/sessions/' + credentials.id, undefined, credentials.token)
        .then(setSession)
        .catch((e) => setError(e.message));
  }, [credentials?.id]);
  useEffect(() => {
    if (credentials && session?.phase === 'recommendation')
      api('/sessions/' + credentials.id + '/recommendation', undefined, credentials.token)
        .then((r) => {
          setResult(r);
          setAlternative(r.ui_variant);
          if (!reviewSuggestions)
            act('recommendation', { decision: 'accepted', ui_variant: r.ui_variant });
        })
        .catch((e) => setError(e.message));
  }, [session?.phase, credentials?.id]);
  function mutation(path: string, body: any) {
    const payload = { ...body, operation_id: crypto.randomUUID() };
    const operation = async () => {
      const value = await api(
        '/sessions/' + credentials!.id + '/' + path,
        payload,
        credentials!.token,
      );
      setSession(value);
      setError('');
    };
    const promise = queue.current.then(async () => {
      if (failed.current) throw new Error('Retry the failed save first.');
      setBusy(true);
      try {
        await operation();
      } catch (e) {
        failed.current = operation;
        setError((e as Error).message);
        throw e;
      } finally {
        setBusy(false);
      }
    });
    queue.current = promise.catch(() => {});
    return promise;
  }
  function act(path: string, body: any) {
    void mutation(path, body).catch(() => {});
  }
  async function retry() {
    try {
      setBusy(true);
      if (failed.current) {
        await failed.current();
        failed.current = null;
      } else if (credentials) {
        setSession(await api('/sessions/' + credentials.id, undefined, credentials.token));
        if (session?.phase === 'recommendation')
          setResult(
            await api(
              '/sessions/' + credentials.id + '/recommendation',
              undefined,
              credentials.token,
            ),
          );
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function begin() {
    setBusy(true);
    try {
      const c = await api('/sessions', {
        consent: true,
        source_type: source,
        mode: 'workspace',
        mood_guided_demo: moodGuided,
        ...(preferred ? { preferred_ui: preferred } : {}),
        device_class: innerWidth < 700 ? 'mobile' : 'desktop',
      });
      const auth = { id: c.session.id, token: c.token };
      localStorage.setItem(key, JSON.stringify(auth));
      setCredentials(auth);
      setSession(c.session);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function event(type: EventType, target_id: string, status?: Status) {
    act('event', {
      id: crypto.randomUUID(),
      type,
      target_id,
      client_ms: performance.now() - origin.current,
      ...(status ? { status } : {}),
    });
  }
  async function remove() {
    if (!confirm('Delete this workspace participant and all associated data?')) return;
    try {
      await queue.current;
      await api('/sessions/' + credentials!.id, undefined, credentials!.token, 'DELETE');
      localStorage.removeItem(key);
      setCredentials(null);
      setSession(null);
      setResult(null);
      setConsent(false);
      setError('');
      failed.current = null;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      {error && (
        <div role="alert" className="save-error">
          {error}
          <button disabled={busy} onClick={retry}>
            Retry workspace save
          </button>
        </div>
      )}
      {!session ? (
        <section className="study-form">
          <h1>Find your space for today.</h1>
          <p>Scan your face. Confirm your mood. Find a layout that fits.</p>
          <details className="simple-options">
            <summary>More options</summary>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={reviewSuggestions}
                onChange={(e) => setReviewSuggestions(e.target.checked)}
              />
              Review suggestions before opening
            </label>
            <label>
              Your preferred structure
              <select
                aria-label="Your preferred structure"
                value={preferred}
                onChange={(e) => setPreferred(e.target.value)}
              >
                <option value="">No preference — neutral starting interface</option>
                {VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Workspace record purpose
              <select
                aria-label="Workspace record purpose"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="demo">Rehearsal — excluded from research</option>
                <option value="real">Genuine voluntary observation</option>
                {purpose && (
                  <option value="automated_test">Automated test — excluded from research</option>
                )}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={moodGuided}
                onChange={(e) => setMoodGuided(e.target.checked)}
              />
              Try mood-guided design suggestions when I have no preferred layout. These are
              demonstration rules, not evidence of mood-specific superiority.
            </label>
          </details>
          <p className="ethics-note">
            Your camera stays on your device. We save your confirmed mood and workspace changes
            locally. You can delete them at any time.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I voluntarily agree to this local workspace data collection.
          </label>
          <button className="primary" disabled={!consent || busy} onClick={begin}>
            Assess my current mood
          </button>
          <details>
            <summary>Resume a personal workspace with a private code</summary>
            <label>
              Workspace resume code
              <textarea
                rows={3}
                value={resumeCode}
                onChange={(e) => setResumeCode(e.target.value)}
              />
            </label>
            <button disabled={busy || !resumeCode.trim()} onClick={restore}>
              Resume personal workspace
            </button>
          </details>
        </section>
      ) : (
        <>
          <div className="study-status">
            <span>{busy ? 'Saving…' : 'Saved locally'}</span>
            <details>
              <summary>Workspace controls</summary>
              <label>
                Private resume / deletion code
                <textarea readOnly rows={3} value={credentials!.id + '.' + credentials!.token} />
              </label>
              <button className="danger" onClick={remove}>
                Delete workspace data
              </button>
            </details>
          </div>
          {session.phase === 'mood' ? (
            <MoodCheck
              camera
              continueLabel="Open my workspace"
              predict={(text, reference_mood) =>
                api(
                  '/sessions/' + credentials!.id + '/predict',
                  { text, text_opt_in: true, reference_mood },
                  credentials!.token,
                )
              }
              onSave={(b) => act('mood', b)}
            />
          ) : session.phase === 'recommendation' ? (
            <section className="study-form recommendation">
              <h1>{reviewSuggestions ? 'Your space for today.' : 'Opening your workspace…'}</h1>
              {!result ? (
                <p>Evaluating all eight candidates…</p>
              ) : (
                <>
                  <div className="recommendation-result">
                    <details>
                      <summary>Why this layout?</summary>
                      <span className="soft-label">
                        {result.selection_source === 'design-heuristic'
                          ? 'Mood-guided design demonstration'
                          : result.selection_source === 'mood-evidence'
                            ? 'Exploratory mood evidence'
                            : result.selection_source === 'overall-evidence'
                              ? 'Observed overall baseline'
                              : result.selection_source === 'user-preference'
                                ? 'Your preference · insufficient evidence'
                                : 'Neutral starting interface · insufficient evidence'}
                      </span>
                      <p>{result.reason}</p>
                      <p>
                        Active mood: <strong>{session.active_mood}</strong> · human-confirmed.
                        Method: {result.method} / {result.version}.
                      </p>
                    </details>
                    <h2>{VARIANTS.find((v) => v.id === result.ui_variant)?.name}</h2>
                    <p>For your {session.active_mood} mood. You can switch layouts anytime.</p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        act('recommendation', {
                          decision: 'accepted',
                          ui_variant: result.ui_variant,
                        })
                      }
                    >
                      Use suggested workspace
                    </button>
                  </div>
                  <details>
                    <summary>Try another layout</summary>
                    <label>
                      Choose a different interface
                      <select
                        aria-label="Override workspace"
                        value={alternative}
                        onChange={(e) => setAlternative(e.target.value)}
                      >
                        {VARIANTS.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act('recommendation', {
                          decision: 'manual_override',
                          ui_variant: alternative,
                        })
                      }
                    >
                      Open my chosen layout
                    </button>
                  </details>
                  <details>
                    <summary>All eight candidates and support</summary>
                    {result.candidates.map((c: any) => (
                      <p key={c.ui_variant}>
                        {c.ui_variant} · {c.unique_participants} distinct real participants ·{' '}
                        {c.missing_support} more needed
                      </p>
                    ))}
                    <p>No prospective adaptation advantage is established.</p>
                  </details>
                </>
              )}
            </section>
          ) : session.phase === 'workspace' ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="context-label">
                    Active mood: {session.active_mood} · human-confirmed
                  </span>
                  <h1>{VARIANTS.find((v) => v.id === session.active_ui)?.name}</h1>
                  <button
                    onClick={() => {
                      localStorage.removeItem(key);
                      setCredentials(null);
                      setSession(null);
                      setResult(null);
                      setConsent(false);
                      setError('');
                    }}
                  >
                    Start a new mood check
                  </button>
                </div>
                <label>
                  Switch interface
                  <select
                    aria-label="Switch adaptive interface"
                    value={session.active_ui}
                    disabled={busy}
                    onChange={(e) => {
                      setSavedFeedback(false);
                      act('recommendation', {
                        decision: 'manual_override',
                        ui_variant: e.target.value,
                      });
                    }}
                  >
                    {VARIANTS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Workspace
                id={session.active_ui}
                tasks={session.sandbox}
                onStatus={(id, status) =>
                  event(status === 'done' ? 'completion_action' : 'status_action', id, status)
                }
                onEvent={event}
              />
              <details className="research-panel">
                <summary>Leave feedback</summary>
                <h2>How does this workspace feel?</h2>
                <form
                  className="workspace-feedback-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await mutation('workspace-feedback', {
                        satisfaction: +ratings.satisfaction,
                        effort: +ratings.effort,
                        comment: ratings.comment,
                      });
                      setSavedFeedback(true);
                    } catch {}
                  }}
                >
                  <label>
                    Satisfaction
                    <select
                      required
                      aria-label="Workspace satisfaction"
                      value={ratings.satisfaction}
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
                      required
                      aria-label="Workspace mental effort"
                      value={ratings.effort}
                      onChange={(e) => setRatings((r) => ({ ...r, effort: e.target.value }))}
                    >
                      <option value="">Choose 1–7</option>
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Comment · optional
                    <textarea
                      maxLength={1000}
                      value={ratings.comment}
                      onChange={(e) => setRatings((r) => ({ ...r, comment: e.target.value }))}
                    />
                  </label>
                  <button disabled={busy || savedFeedback} className="primary">
                    Save workspace feedback
                  </button>
                  {savedFeedback && <p role="status">Workspace feedback saved.</p>}
                </form>
              </details>
            </>
          ) : (
            <p>This session is paused.</p>
          )}
        </>
      )}
    </>
  );
}
