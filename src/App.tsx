import { useEffect, useRef, useState } from 'react';
import {
  NavLink,
  Link,
  Routes,
  Route,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FlaskConical,
  Grid2X2,
  Home,
  Leaf,
  Menu,
  PanelLeft,
  Shield,
  Timer,
  X,
  Download,
  RefreshCw,
} from 'lucide-react';
import { api, readCredentials, writeCredentials, type Credentials } from './api';
import {
  VARIANTS,
  MOODS,
  courses,
  courseProgress,
  freshTasks,
  challenge,
  updateTask,
  VERSION,
  type VariantId,
  type Mood,
  type EventType,
  type Status,
} from './domain';
import Workspace from './Workspace';
import Gallery, { Thumbnail } from './Gallery';
import MoodCheck from './MoodCheck';
import AdaptiveWorkspace from './AdaptiveWorkspace';
import SelectedWorkspace from './SelectedWorkspace';
import ResearchAnalytics from './ResearchAnalytics';
type Session = any;
export default function App() {
  const navigate = useNavigate();
  const currentLocation = useLocation();
  const [credentials, setCredentials] = useState<Credentials | null>(readCredentials);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [demoMood, setDemoMood] = useState<Mood>('neutral');
  const [health, setHealth] = useState<{ test_mode: boolean } | null>(null);
  const failed = useRef<(() => Promise<void>) | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const origin = useRef(performance.now());
  useEffect(() => {
    api('/health')
      .then(setHealth)
      .catch(() => setError('The API is unavailable. Start npm run dev and retry.'));
  }, []);
  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    setLoading(true);
    api('/sessions/' + credentials.id, undefined, credentials.token)
      .then((s) => {
        if (!cancelled) {
          setSession(s);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [credentials]);
  function enqueue(path: string, body: any) {
    const payload = { ...body, operation_id: crypto.randomUUID() };
    const operation = async () => {
      if (!credentials) throw new Error('Start or resume a session first.');
      const value = await api(
        '/sessions/' + credentials.id + '/' + path,
        payload,
        credentials.token,
      );
      setSession(value);
      setError('');
    };
    const promise = queue.current.then(async () => {
      if (failed.current) throw new Error('Retry the failed save before continuing.');
      setLoading(true);
      try {
        await operation();
      } catch (e) {
        failed.current = operation;
        setError((e as Error).message);
        throw e;
      } finally {
        setLoading(false);
      }
    });
    queue.current = promise.catch(() => {});
    return promise;
  }
  const run = (path: string, body: any) => {
    void enqueue(path, body).catch(() => {});
  };
  const event = (type: EventType, target_id: string, status?: Status) => {
    if (
      !session ||
      (!['trials', 'practice'].includes(session.phase) &&
        !(session.phase === 'debrief' && session.active_ui))
    )
      return;
    run('event', {
      id: crypto.randomUUID(),
      type,
      target_id,
      client_ms: performance.now() - origin.current,
      ...(status ? { status } : {}),
    });
  };
  const onStatus = (id: string, status: Status) =>
    event(status === 'done' ? 'completion_action' : 'status_action', id, status);
  async function retry() {
    if (!failed.current) {
      location.reload();
      return;
    }
    setLoading(true);
    try {
      await failed.current();
      failed.current = null;
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function forget() {
    writeCredentials(null);
    setCredentials(null);
    setSession(null);
    failed.current = null;
    setError('');
  }
  async function withdraw() {
    if (
      !credentials ||
      !confirm('Permanently delete all records for this participant code? This cannot be undone.')
    )
      return;
    try {
      await api('/sessions/' + credentials.id, undefined, credentials.token, 'DELETE');
      forget();
      navigate('/study');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function create(source_type: string) {
    try {
      setLoading(true);
      const result = await api('/sessions', {
        consent: true,
        source_type,
        device_class: innerWidth < 700 ? 'mobile' : 'desktop',
      });
      const c = { id: result.session.id, token: result.token };
      writeCredentials(c);
      setCredentials(c);
      setSession(result.session);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function restore(code: string) {
    const [id, token] = code.trim().split('.');
    try {
      const s = await api('/sessions/' + id, undefined, token);
      const c = { id, token };
      writeCredentials(c);
      setCredentials(c);
      setSession(s);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={'sidebar ' + (mobile ? 'mobile-open' : '')}>
        <Link className="brand" to="/" onClick={() => setMobile(false)}>
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          MoodSpace<span className="brand-period">.</span>
        </Link>
        <div className="semester-label">
          <BookOpen size={16} />
          <span>
            My study space<small>A fictional semester</small>
          </span>
        </div>
        <nav aria-label="Main navigation">
          {[
            [Home, '/', 'Overview'],
            [Grid2X2, '/gallery', 'Interface library'],
            [PanelLeft, '/adapt', 'My workspace'],
            [FlaskConical, '/study', 'HCI study'],
          ].map(([Icon, to, label]) => {
            const I = Icon as typeof Home;
            return (
              <NavLink
                className={({ isActive }) =>
                  isActive ||
                  (to === '/adapt' &&
                    (currentLocation.pathname.startsWith('/workspace/') ||
                      currentLocation.pathname === '/chosen-workspace'))
                    ? 'active'
                    : undefined
                }
                end={to === '/'}
                key={String(to)}
                to={String(to)}
                onClick={() => setMobile(false)}
              >
                <I size={18} />
                {String(label)}
                {to === '/gallery' && <span className="nav-count">8</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="small-leaf">
            <Leaf size={21} />
          </span>
          <strong>A little room to think.</strong>
          <p>
            Different days call for different ways of working. Explore what feels right for you.
          </p>
        </div>
        <div className="sidebar-bottom">
          <NavLink to="/research" onClick={() => setMobile(false)}>
            <Shield size={17} />
            Research console
          </NavLink>
          <span>
            Original HCI course project <small>Local-first · {VERSION}</small>
          </span>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="content-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            My study space <span>/</span>
            <strong>MoodSpace</strong>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <i /> Local workspace
            </span>
            <span className="profile-mark">M</span>
          </div>
        </header>
        {health?.test_mode && (
          <div className="test-banner">
            AUTOMATED TEST MODE · accelerated trial limit · choose test provenance for automated
            runs
          </div>
        )}
        {error && (
          <div className="save-error" role="alert">
            <span>{error}</span>
            <button onClick={retry} disabled={loading}>
              <RefreshCw size={15} />
              Retry
            </button>
            {credentials && <button onClick={forget}>Clear local session code</button>}
          </div>
        )}
        <main id="main" className="main-content">
          <Routes>
            <Route path="/" element={<Welcome session={session} loading={loading} />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route
              path="/adapt"
              element={
                <div className="adaptive-page">
                  <AdaptiveWorkspace />
                </div>
              }
            />
            <Route
              path="/chosen-workspace"
              element={
                credentials && !session ? (
                  <p>Restoring chosen workspace…</p>
                ) : session?.status === 'complete' && session.active_ui ? (
                  <SelectedWorkspace
                    session={session}
                    onEvent={event}
                    onStatus={onStatus}
                    save={enqueue}
                  />
                ) : (
                  <NavigateStudy />
                )
              }
            />
            <Route
              path="/workspace/:variantId"
              element={<DemoWorkspace mood={demoMood} onMood={setDemoMood} />}
            />
            <Route
              path="/study"
              element={
                !session ? (
                  <Consent
                    onStart={create}
                    onRestore={restore}
                    loading={loading}
                    testMode={health?.test_mode}
                  />
                ) : (
                  <>
                    <div className="study-status">
                      <span>
                        <FlaskConical size={16} />
                        {session.source_type === 'real'
                          ? 'Participant study'
                          : session.source_type === 'demo'
                            ? 'Rehearsal · excluded from research'
                            : 'Automated test · excluded from research'}
                      </span>
                      <span aria-live="polite">{loading ? 'Saving…' : 'Saved locally'}</span>
                      <details>
                        <summary>Session controls</summary>
                        <label>
                          Your private resume / deletion code
                          <textarea
                            readOnly
                            value={credentials?.id + '.' + credentials?.token}
                            rows={3}
                          />
                        </label>
                        <small>
                          Keep this private code to resume or withdraw on another browser.
                        </small>
                        <div className="actions">
                          <button
                            disabled={session.status === 'complete'}
                            onClick={() =>
                              run(session.status === 'stopped' ? 'resume' : 'stop', {})
                            }
                          >
                            {session.status === 'complete'
                              ? 'Session complete'
                              : session.status === 'stopped'
                                ? 'Resume session'
                                : 'Stop for now'}
                          </button>
                          <button className="danger" onClick={withdraw}>
                            Delete my data
                          </button>
                        </div>
                      </details>
                    </div>
                    {session.status === 'stopped' ? (
                      <section className="study-form">
                        <h1>Your place is saved.</h1>
                        <p>
                          You can leave now or resume. An active task stopped midway is recorded as
                          abandoned.
                        </p>
                        <button className="primary" onClick={() => run('resume', {})}>
                          Resume session
                        </button>
                      </section>
                    ) : (
                      <Study
                        session={session}
                        run={run}
                        enqueue={enqueue}
                        onStatus={onStatus}
                        onEvent={event}
                        busy={loading}
                        credentials={credentials!}
                      />
                    )}
                  </>
                )
              }
            />
            <Route
              path="/results"
              element={
                credentials && !session ? (
                  <p>Restoring recommendation…</p>
                ) : session?.status === 'complete' ? (
                  <Results session={session} credentials={credentials!} run={enqueue} />
                ) : (
                  <NavigateStudy />
                )
              }
            />
            <Route path="/research" element={<Research />} />
            <Route
              path="*"
              element={
                <section className="study-form">
                  <h1>A little off course.</h1>
                  <p>This page does not exist.</p>
                  <Link to="/">Return to your study space</Link>
                </section>
              }
            />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>MoodSpace · Made for the way you work</span>
          <span>Fictional content. Real choices.</span>
        </footer>
      </div>
    </div>
  );
}
function NavigateStudy() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/study', { replace: true });
  }, [navigate]);
  return null;
}
function Welcome({ session, loading }: { session: Session; loading: boolean }) {
  return (
    <>
      <div className="home-heading">
        <span className="context-label">Your study space, thoughtfully arranged</span>
        <h1>A little room to think.</h1>
        <p>
          One semester. Eight ways to see it. Find a workspace that makes your next step feel a
          little clearer.
        </p>
        <div className="actions">
          <Link className="primary" to="/gallery">
            Explore the eight designs
            <ArrowRight size={17} />
          </Link>
          <Link className="secondary" to="/adapt">
            Find a mood-aware workspace
          </Link>
          <Link className="secondary" to="/study">
            {loading
              ? 'Loading your place…'
              : session
                ? 'Continue your study'
                : 'Join the HCI study'}
          </Link>
        </div>
      </div>
      <div className="home-feature">
        <div>
          <span className="soft-label">
            <Leaf size={16} /> A calmer place to begin
          </span>
          <h2>
            Same work.
            <br />A different point of view.
          </h2>
          <p>
            Your tasks, deadlines, and course progress stay the same. Only the way they are
            organized changes.
          </p>
          <Link to="/workspace/U01">
            Try Quiet Focus
            <ArrowRight size={16} />
          </Link>
          <div className="home-counts">
            <span>
              <strong>8</strong> distinct structures
            </span>
            <span>
              <strong>3</strong> self-reported moods
            </span>
          </div>
        </div>
        <Thumbnail id="U01" />
      </div>
      <div className="home-bottom">
        <section>
          <h2>Built around your choices.</h2>
          <p>
            No layout is assumed to be better for a particular mood. Explore freely, or contribute
            to a voluntary study that can test those ideas with real observations.
          </p>
          <Link to="/study">
            How the study works
            <ArrowRight size={15} />
          </Link>
        </section>
        <section className="home-courses">
          <h3>Inside the fictional semester</h3>
          {courses.map((c) => (
            <span key={c.id}>
              {c.name}
              <small>{c.code}</small>
            </span>
          ))}
        </section>
      </div>
    </>
  );
}
function DemoWorkspace({ mood, onMood }: { mood: Mood; onMood: (m: Mood) => void }) {
  const { variantId } = useParams();
  const id = (VARIANTS.some((v) => v.id === variantId) ? variantId : 'U01') as VariantId;
  const [tasks, setTasks] = useState(freshTasks);
  const navigate = useNavigate();
  const v = VARIANTS.find((v) => v.id === id)!;
  return (
    <>
      <div className="page-heading workspace-heading">
        <div>
          <span className="context-label">Your workspace / {id}</span>
          <h1>{v.name}</h1>
          <p>{v.tag}. Demo changes stay in this browser view.</p>
        </div>
        <div className="demo-selectors">
          <label>
            Structure
            <select
              aria-label="Workspace structure"
              value={id}
              onChange={(e) => navigate('/workspace/' + e.target.value)}
            >
              {VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Current mood
            <select
              aria-label="Current mood"
              value={mood}
              onChange={(e) => onMood(e.target.value as Mood)}
            >
              {MOODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="unclassified">Not sure</option>
            </select>
          </label>
        </div>
      </div>
      <Workspace
        id={id}
        tasks={tasks}
        onStatus={(target, status) => setTasks((t) => updateTask(t, target, status))}
        onEvent={() => {}}
      />
      <div className="demo-footer">
        <span>Manual selection · self-reported {mood} · no mood-to-layout rule</span>
        <button onClick={() => setTasks(freshTasks())}>Reset fictional tasks</button>
      </div>
    </>
  );
}
function Consent({
  onStart,
  onRestore,
  loading,
  testMode,
}: {
  onStart: (source: string) => void;
  onRestore: (code: string) => void;
  loading: boolean;
  testMode?: boolean;
}) {
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState('demo');
  const [code, setCode] = useState('');
  return (
    <div className="consent-layout">
      <div className="consent-intro">
        <span className="context-label">A voluntary HCI study</span>
        <h1>Help shape a better study space.</h1>
        <p>
          How does a self-reported mood relate to the way students use and prefer different
          interfaces?
        </p>
        <ol className="protocol-list">
          <li>
            <span>01</span>
            <div>
              <strong>Check in & explore</strong>
              <p>Report your mood and choose from eight previews.</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Try four assigned designs</strong>
              <p>Practice, then complete two tasks in each design.</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Tell us what worked</strong>
              <p>Rate each design, make a final choice, and check in again.</p>
            </div>
          </li>
        </ol>
        <p className="muted">
          Planning estimate: 12–18 minutes. This has not been established by a human rehearsal.
        </p>
        <details>
          <summary>Resume with a private code</summary>
          <label>
            Resume code
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} />
          </label>
          <button disabled={!code.trim() || loading} onClick={() => onRestore(code)}>
            Resume saved session
          </button>
        </details>
      </div>
      <section className="consent-card">
        <h2>Before you take part</h2>
        <p>
          This undergraduate class exercise collects a pseudonymous participant code, mood
          self-reports, task responses and timing, workspace actions, interface ratings, and
          choices.
        </p>
        <p>
          No name, email, camera, audio, or precise location is requested. Optional text is stored
          only with a separate opt-in. Avoid personal information in comments.
        </p>
        <p>
          Participation is voluntary. Stop at any point, resume using your private code, or
          permanently delete your data with that code. Stopped and incomplete sessions stay
          incomplete.
        </p>
        <p className="ethics-note">
          Institutional / course approval: pending local review. This app does not represent ethics
          approval. Use rehearsal mode until the required review and recruitment arrangements are in
          place.
        </p>
        <label>
          Session purpose
          <select
            aria-label="Session purpose"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="demo">Rehearsal — excluded from research</option>
            <option value="real">Genuine participant observation</option>
            {testMode && (
              <option value="automated_test">Automated test — excluded from research</option>
            )}
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          I understand this information and voluntarily agree to participate.
        </label>
        <button className="primary" disabled={!consent || loading} onClick={() => onStart(mode)}>
          Begin {mode === 'demo' ? 'rehearsal' : 'session'}
          <ArrowRight size={16} />
        </button>
        <Link className="text-action" to="/gallery">
          Explore without participating
        </Link>
        <p className="muted">
          Consent version 1.0 · Locally stored SQLite data. The study organizer sets retention
          before recruitment.
        </p>
      </section>
    </div>
  );
}
function Study({
  session: s,
  run,
  enqueue,
  onStatus,
  onEvent,
  busy,
  credentials,
}: {
  session: Session;
  run: (p: string, b: any) => void;
  enqueue: (p: string, b: any) => Promise<void>;
  onStatus: (id: string, status: Status) => void;
  onEvent: (type: EventType, id: string) => void;
  busy: boolean;
  credentials: Credentials;
}) {
  const order = s.gallery_order || VARIANTS.map((v) => v.id);
  switch (s.phase) {
    case 'mood':
      return (
        <MoodCheck
          predict={(text, reference_mood) =>
            api(
              '/sessions/' + credentials.id + '/predict',
              { text, text_opt_in: true, reference_mood },
              credentials.token,
            )
          }
          onSave={(b) => run('mood', b)}
        />
      );
    case 'gallery':
    case 'final':
      return (
        <Gallery
          key={s.phase}
          final={s.phase === 'final'}
          initial={s.initial_choice}
          tested={s.phase === 'final' ? s.assigned_sequence : []}
          order={order}
          onChoose={(ui_variant, viewed_ids, rationale) =>
            run('choice', { ui_variant, viewed_ids, ordering: order, rationale })
          }
        />
      );
    case 'practice':
      return (
        <>
          <div className="task-instruction practice-instruction">
            <span>Practice · Not scored</span>
            <h1>Find “Editorial storyboard” and mark it complete.</h1>
            <p>
              Use All tasks to locate it. Open its details, then choose Mark complete. Practice does
              not enter research performance metrics.
            </p>
            <button
              className="primary"
              disabled={busy || s.sandbox.find((t: any) => t.id === 'T24')?.status !== 'done'}
              onClick={() => run('practice', { completed: true })}
            >
              Finish practice
              <ArrowRight size={15} />
            </button>
          </div>
          <Workspace id="U01" tasks={s.sandbox} onStatus={onStatus} onEvent={onEvent} />
        </>
      );
    case 'trials':
      return (
        <Trial
          key={s.trial_index}
          session={s}
          run={run}
          enqueue={enqueue}
          busy={busy}
          onStatus={onStatus}
          onEvent={onEvent}
        />
      );
    case 'feedback':
      return (
        <Feedback
          key={s.trial_index}
          variant={s.assigned_sequence[Math.floor((s.trial_index - 1) / 2)]}
          onSave={(b) => run('feedback', b)}
          busy={busy}
        />
      );
    case 'exitMood':
      return <MoodCheck after onSave={(b) => run('mood', b)} />;
    case 'debrief':
      return <Debrief s={s} />;
    default:
      return <p>Recovering your saved place…</p>;
  }
}
function Trial({
  session: s,
  run,
  enqueue,
  onStatus,
  onEvent,
  busy,
}: {
  session: Session;
  run: (p: string, b: any) => void;
  enqueue: (p: string, b: any) => Promise<void>;
  onStatus: (id: string, status: Status) => void;
  onEvent: (type: EventType, id: string) => void;
  busy: boolean;
}) {
  const t = s.trials.find((t: any) => t.sequence_index === s.trial_index);
  const a = s.assignments[s.trial_index];
  const c = challenge(a.task_id);
  const [answer, setAnswer] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const initial = useRef<{ wall: number; perf: number } | null>(null);
  const sent = useRef(false);
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (t?.status !== 'active') return;
    initial.current = {
      wall: Math.max(0, Date.parse(s.server_time) - Date.parse(t.started_at)),
      perf: performance.now(),
    };
    const interval = setInterval(() => {
      const e = initial.current!.wall + performance.now() - initial.current!.perf;
      setElapsed(e);
    }, 100);
    return () => clearInterval(interval);
  }, [t?.started_at]);
  useEffect(() => {
    if (elapsed >= s.timeout_ms && t?.status === 'active' && !sent.current) {
      sent.current = true;
      run('answer', {
        request_id: crypto.randomUUID(),
        answer: '',
        outcome: 'timeout',
        elapsed_ms: elapsed,
      });
    }
  }, [elapsed, s.timeout_ms, t?.status]);
  async function submit(outcome: string) {
    if (sent.current) return;
    setRecording(true);
    sent.current = true;
    try {
      await enqueue('answer', {
        request_id: crypto.randomUUID(),
        answer,
        outcome,
        elapsed_ms: elapsed,
      });
    } catch {
      sent.current = false;
    } finally {
      setRecording(false);
    }
  }
  return (
    <>
      <div className="trial-progress" aria-label="Study progress">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className={i < s.trial_index ? 'finished' : i === s.trial_index ? 'current' : ''}
          />
        ))}
        <small>
          Task {s.trial_index + 1} of 8 · Design {Math.floor(s.trial_index / 2) + 1} of 4
        </small>
      </div>
      <section className="task-instruction">
        <div className="trial-title">
          <span>{VARIANTS.find((v) => v.id === a.variant)?.name}</span>
          <span className="timer">
            <Timer size={16} />
            {Math.ceil(Math.max(0, s.timeout_ms - elapsed) / 1000)}s remaining
          </span>
        </div>
        <h1>{c.prompt}</h1>
        {!t ? (
          <>
            <p>
              Start when you are ready. The workspace opens with a fresh copy of the fictional
              semester.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => run('start', { request_id: crypto.randomUUID() })}
            >
              Start task
              <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <>
            <form
              className="answer-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit('submit');
              }}
            >
              {c.options && (
                <label>
                  Your answer
                  <select
                    aria-label="Your answer"
                    required
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  >
                    <option value="">Choose a date after inspecting the workspace</option>
                    {c.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="primary"
                type="submit"
                disabled={busy || recording || (!!c.options && !answer)}
              >
                Record response
              </button>
              <button
                type="button"
                disabled={busy || recording}
                onClick={() => void submit('give_up')}
              >
                I can't complete this
              </button>
            </form>
            <p className="muted">
              Responses are recorded neutrally. Each task has a {s.timeout_ms / 1000}-second limit.
            </p>
          </>
        )}
      </section>
      {t && <Workspace id={a.variant} tasks={s.sandbox} onStatus={onStatus} onEvent={onEvent} />}
    </>
  );
}
function Feedback({
  variant,
  onSave,
  busy,
}: {
  variant: VariantId;
  onSave: (b: any) => void;
  busy: boolean;
}) {
  const [rating, setRating] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const fields = [
    ['satisfaction', 'Satisfaction', 5, '1 · Very dissatisfied', '5 · Very satisfied'],
    ['effort', 'Mental effort', 7, '1 · Very low effort', '7 · Very high effort'],
    ['clarity', 'Clarity', 5, '1 · Very unclear', '5 · Very clear'],
    ['reuse_intent', 'Willingness to reuse', 5, '1 · Very unlikely', '5 · Very likely'],
  ] as const;
  return (
    <div className="study-form">
      <span className="context-label">Response recorded</span>
      <h1>How was {VARIANTS.find((v) => v.id === variant)?.name}?</h1>
      <p>
        Think about the two tasks you just attempted. Rate the interface, rather than your mood.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...rating, comment });
        }}
      >
        {fields.map(([id, label, max, lo, hi]) => (
          <fieldset className="rating-field" key={id}>
            <legend>{label}</legend>
            <div className="rating-buttons">
              {Array.from({ length: max }, (_, i) => (
                <label key={i} className={rating[id] === i + 1 ? 'selected' : ''}>
                  <input
                    type="radio"
                    name={id}
                    required
                    value={i + 1}
                    checked={rating[id] === i + 1}
                    onChange={() => setRating((r) => ({ ...r, [id]: i + 1 }))}
                  />
                  {i + 1}
                </label>
              ))}
            </div>
            <small>
              {lo}
              <span>{hi}</span>
            </small>
          </fieldset>
        ))}
        <label>
          Anything you would change? <span className="muted">Optional</span>
          <textarea
            maxLength={1000}
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy || Object.keys(rating).length < 4}>
          Save feedback & continue
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}
function Debrief({ s }: { s: Session }) {
  return (
    <section className="study-form debrief">
      <span className="soft-label">
        <Check size={18} />
        Session complete
      </span>
      <h1>Thank you for making space.</h1>
      <p>
        You attempted {s.trials.length} scored tasks across four assigned designs. Your
        self-reports, responses, and preferences can help explore how different structures support
        study work.
      </p>
      <p>
        No mood was induced. We do not assume one design is best for a mood, and this session cannot
        establish that adaptation improves outcomes.
      </p>
      <div className="debrief-facts">
        <span>
          First preference<strong>{VARIANTS.find((v) => v.id === s.initial_choice)?.name}</strong>
        </span>
        <span>
          Final preference<strong>{VARIANTS.find((v) => v.id === s.final_choice)?.name}</strong>
        </span>
      </div>
      <p>
        Recommendations are offered separately from the experiment. With insufficient genuine data,
        your choice remains the fallback.
      </p>
      <Link className="primary" to="/results">
        See my workspace suggestion
        <ArrowRight size={16} />
      </Link>
      <p className="muted">
        Keep your private code in Session controls to request deletion. For class research
        questions, use the organizer's contact provided before recruitment.
      </p>
    </section>
  );
}
function Results({
  session: s,
  credentials,
  run,
}: {
  session: Session;
  credentials: Credentials;
  run: (p: string, b: any) => Promise<void>;
}) {
  const [result, setResult] = useState<any>();
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<VariantId>(s.final_choice);
  const [saving, setSaving] = useState(false);
  async function choose(decision: string, id: string) {
    setSaving(true);
    setError('');
    try {
      await run('recommendation', { decision, ui_variant: id });
      navigate('/chosen-workspace');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const navigate = useNavigate();
  const load = () =>
    api('/sessions/' + credentials.id + '/recommendation', undefined, credentials.token)
      .then(setResult)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [credentials.id]);
  return (
    <section className="study-form recommendation">
      <span className="context-label">After the study</span>
      <h1>A workspace, on your terms.</h1>
      {error && (
        <p role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </p>
      )}
      {!result ? (
        <p>Checking genuine observation support…</p>
      ) : (
        <>
          <div className="recommendation-result">
            <span className="soft-label">
              {result.state === 'insufficient_evidence'
                ? 'Your preference · insufficient evidence'
                : 'Exploratory empirical suggestion'}
            </span>
            <h2>{VARIANTS.find((v) => v.id === result.ui_variant)?.name}</h2>
            <p>{result.reason}</p>
            <dl>
              <div>
                <dt>Selected mood</dt>
                <dd>{s.active_mood || s.mood} · latest self-report</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>
                  {result.method} / {result.version}
                </dd>
              </div>
              <div>
                <dt>Distinct participants supporting winner</dt>
                <dd>{result.sample_size}</dd>
              </div>
            </dl>
            <div className="actions">
              <button
                className="primary"
                disabled={saving}
                onClick={() => void choose('accepted', result.ui_variant)}
              >
                Use this workspace
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <label>
            Try another structure
            <select
              aria-label="Alternative workspace"
              value={chosen}
              onChange={(e) => setChosen(e.target.value as VariantId)}
            >
              {VARIANTS.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={saving}
            onClick={() =>
              void choose(chosen === s.final_choice ? 'rejected' : 'manual_override', chosen)
            }
          >
            Keep my choice / try this design
          </button>
          <details>
            <summary>Evidence by interface</summary>
            {result.support.map((c: any) => (
              <p key={c.ui}>
                {c.ui}: {c.n} distinct real participants
              </p>
            ))}
            <p>
              H3 (adaptation benefit): unverified. All three mood groups are observed, not
              randomized.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
function Research() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<any>();
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>();
  const [notice, setNotice] = useState('');
  const [includeSynthetic, setIncludeSynthetic] = useState(false);
  async function load() {
    try {
      const d = await api('/research', undefined, password);
      setData(d);
      setAuthenticated(true);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function download(kind: string) {
    try {
      const res = await fetch(
        '/api/research/' +
          (kind === 'json' ? 'export' : 'export-csv') +
          (includeSynthetic ? '?include_synthetic=true' : ''),
        {
          headers: { Authorization: 'Bearer ' + password },
        },
      );
      if (!res.ok) throw new Error('Export failed. Try again.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = kind === 'json' ? 'moodspace-study.json' : 'moodspace-csv.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!authenticated)
    return (
      <section className="study-form research-login">
        <Shield size={28} />
        <h1>Research console</h1>
        <p>
          Enter the local administrator password configured in .env. Participant records remain
          protected by the server.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <label>
            Administrator password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary">
            Open research console
            <ArrowRight size={16} />
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="context-label">Research / genuine observations only</span>
          <h1>Evidence, as it stands.</h1>
          <p>
            {data.synthetic_sessions} rehearsal / automated sessions excluded. No participant
            responses are seeded.
          </p>
        </div>
        <div className="actions">
          <button onClick={load}>
            <RefreshCw size={15} />
            Refresh
          </button>
          <button onClick={() => download('json')}>
            <Download size={15} />
            JSON export
          </button>
          <button onClick={() => download('csv')}>
            <Download size={15} />
            CSV archive
          </button>
          <button
            onClick={() => {
              setPassword('');
              setAuthenticated(false);
              setData(null);
            }}
          >
            Lock
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="save-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={includeSynthetic}
          onChange={(e) => setIncludeSynthetic(e.target.checked)}
        />
        Include labeled rehearsal / automated sessions in exports only. Dashboard evidence remains
        genuine-only.
      </label>
      <div className="research-counts">
        <div>
          <span>Consented study participants</span>
          <strong>{data.participant_count}</strong>
        </div>
        <div>
          <span>Completed sessions</span>
          <strong>{data.completed_sessions}</strong>
        </div>
        <div>
          <span>Incomplete sessions</span>
          <strong>{data.incomplete_sessions}</strong>
        </div>
        <div>
          <span>Adaptation benefit (H3)</span>
          <strong className="small-value">Unverified</strong>
        </div>
      </div>
      <section className="research-panel">
        <header className="section-heading">
          <div>
            <h2>24 cells. Actual coverage.</h2>
            <p>
              Distinct real participants with a recorded trial in each mood × interface cell.
              Minimum empirical support: 8 per compared cell.
            </p>
          </div>
        </header>
        <div className="table-scroll">
          <table className="coverage-table">
            <thead>
              <tr>
                <th>Mood / Interface</th>
                {VARIANTS.map((v) => (
                  <th key={v.id}>
                    {v.id}
                    <small>{v.name}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOODS.map((m) => (
                <tr key={m.id}>
                  <th>
                    {m.short}
                    <small>{data.mood_distribution[m.id]} sessions</small>
                  </th>
                  {VARIANTS.map((v) => {
                    const n =
                      data.coverage.find((c: any) => c.mood === m.id && c.ui_variant === v.id)
                        ?.unique_participants || 0;
                    return (
                      <td
                        key={v.id}
                        style={{
                          background: n >= 8 ? '#e3eee8' : n > 0 ? '#f3f6f2' : 'transparent',
                        }}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.participant_count && (
          <p className="empty-state">
            No genuine observations yet. Run a voluntary, approved study before drawing research
            conclusions.
          </p>
        )}
        <p className="muted">
          Unclassified: {data.mood_distribution.unclassified} sessions; excluded from mood-specific
          inference.
        </p>
      </section>
      <section className="research-panel">
        <h2>Recommendation readiness</h2>
        <div className="readiness-grid">
          {data.readiness.map((r: any) => (
            <article key={r.mood}>
              <strong>{r.mood}</strong>
              <p>
                {r.state === 'insufficient_evidence'
                  ? 'Insufficient evidence'
                  : r.method === 'overall-baseline'
                    ? 'Overall observed baseline'
                    : 'Exploratory mood ranking'}
              </p>
              <small>{r.support.filter((c: any) => c.n >= 8).length} / 8 cells meet support</small>
            </article>
          ))}
        </div>
      </section>
      <ResearchAnalytics data={data} />
      <section className="research-panel">
        <h2>Performance & feedback</h2>
        <p>
          Participant-weighted performance. Successful times only; timeouts remain non-successes.
          Missing ratings are shown as —.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Design</th>
                <th>Participants</th>
                <th>Success</th>
                <th>Median time</th>
                <th>Errors</th>
                <th>Effort / 7</th>
                <th>Satisfaction / 5</th>
                <th>Reuse / 5</th>
              </tr>
            </thead>
            <tbody>
              {data.overall.map((c: any) => (
                <tr key={c.ui_variant}>
                  <th>{c.ui_variant}</th>
                  <td>{c.unique_participants}</td>
                  <td>{c.success_rate == null ? '—' : (100 * c.success_rate).toFixed(1) + '%'}</td>
                  <td>
                    {c.median_successful_ms == null
                      ? '—'
                      : (c.median_successful_ms / 1000).toFixed(1) + ' s'}
                  </td>
                  <td>{c.errors}</td>
                  <td>{c.effort?.toFixed(1) || '—'}</td>
                  <td>{c.satisfaction?.toFixed(1) || '—'}</td>
                  <td>{c.reuse_intent?.toFixed(1) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="research-panel">
        <h2>Baseline comparisons · descriptive only</h2>
        <p>
          Fixed overall baseline:{' '}
          {data.static_baseline.state === 'insufficient_evidence'
            ? 'Insufficient evidence'
            : data.static_baseline.ui_variant}
          . The same support rule applies before naming an overall winner.
        </p>
        <p>
          Initial-preference paired subset: {data.preference_comparison.measurable_participants}{' '}
          distinct participants. Preferred-design success:{' '}
          {data.preference_comparison.initial_preference_success == null
            ? '—'
            : (data.preference_comparison.initial_preference_success * 100).toFixed(1) + '%'}
          ; other assigned designs:{' '}
          {data.preference_comparison.other_assigned_success == null
            ? '—'
            : (data.preference_comparison.other_assigned_success * 100).toFixed(1) + '%'}
          .
        </p>
        <p>{data.preference_comparison.interpretation} H3 remains unverified.</p>
        <h2 style={{ marginTop: 24 }}>Initial → final preference</h2>
        {data.preference_changes.length ? (
          data.preference_changes.map((c: any) => (
            <p key={c.session_id}>
              {c.session_id.slice(0, 8)}: {c.initial} → {c.final} ·{' '}
              {c.initial === c.final ? 'unchanged' : 'changed'} ·{' '}
              {c.tested ? 'tested design' : 'untested preview'}
            </p>
          ))
        ) : (
          <p>No complete preference pairs yet.</p>
        )}
      </section>
      <section className="research-panel">
        <h2>Sessions & withdrawal</h2>
        {!data.sessions.length ? (
          <p>No genuine participant sessions yet.</p>
        ) : (
          data.sessions.map((s: any) => (
            <div className="session-row" key={s.id}>
              <span>
                {s.id.slice(0, 8)} · {s.mode || 'study'} · {s.mood || 'Before check-in'} ·{' '}
                {s.status}
                <small>Participant {s.participant_id}</small>
              </span>
              <div className="actions">
                <button
                  onClick={async () => {
                    try {
                      setDetail(await api('/research/sessions/' + s.id, undefined, password));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Inspect
                </button>
                <button
                  className="danger"
                  onClick={async () => {
                    if (
                      confirm(
                        'Permanently delete participant ' +
                          s.participant_id +
                          ' and all associated records?',
                      )
                    ) {
                      try {
                        await api(
                          '/research/participants/' + s.participant_id,
                          undefined,
                          password,
                          'DELETE',
                        );
                        setDetail(null);
                        setNotice('Participant records deleted.');
                        void load();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }
                  }}
                >
                  Delete participant
                </button>
              </div>
            </div>
          ))
        )}
        {detail && (
          <details open>
            <summary>Selected session records</summary>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </details>
        )}
      </section>
      <details className="research-panel">
        <summary>Read-only study configuration</summary>
        <pre>{JSON.stringify(data.configuration, null, 2)}</pre>
      </details>
    </>
  );
}
