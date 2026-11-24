import express from 'express';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { all, get, put, atomic, deleteParticipant, tables, type Db } from './db.js';
import { allocate } from './allocation.js';
import { summarize, recommend } from './recommendation.js';
import { exportData, csv } from './exports.js';
import { zipSync, strToU8 } from 'fflate';
import { seeded } from './allocation.js';
import { predictMood, modelBridge, publicModelBridge } from './moodModel.js';
import { additionalMetrics } from './researchMetrics.js';
import { recommendWorkspace } from './demoRecommendation.js';
import {
  VERSION,
  variantIds,
  freshTasks,
  taskBank,
  challenge,
  scoreTask,
  updateTask,
  courses,
  milestones,
  type Mood,
  type VariantId,
} from '../src/domain.js';
const iso = () => new Date().toISOString();
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const moodSchema = z.object({
  mood: z.enum(['positive', 'neutral', 'stressed', 'unclassified']),
  valence: z.number().int().min(1).max(5).nullable(),
  arousal: z.number().int().min(1).max(5).nullable(),
  text_opt_in: z.boolean(),
  text: z.string().max(1000).optional(),
  reference_mood: z.enum(['positive', 'neutral', 'stressed', 'unclassified']).optional(),
  prediction_id: z.string().uuid().optional(),
  assessment_source: z.enum(['self-report', 'camera-confirmed', 'camera-corrected']).optional(),
  camera_suggestion: z.enum(['positive', 'neutral', 'stressed']).optional(),
});
const choiceSchema = z
  .object({
    ui_variant: z.enum(variantIds as [VariantId, ...VariantId[]]),
    ordering: z.array(z.enum(variantIds as [VariantId, ...VariantId[]])).length(8),
    viewed_ids: z.array(z.enum(variantIds as [VariantId, ...VariantId[]])),
    rationale: z.string().max(1000).optional(),
  })
  .refine(
    (b) => new Set(b.ordering).size === 8 && new Set(b.viewed_ids).size === b.viewed_ids.length,
    'Gallery IDs must be unique',
  );
const idSchema = z.string().uuid();
const requirePhase = (s: any, p: string) => {
  if (s.phase !== p)
    throw Object.assign(new Error(`This session is at ${s.phase}. Refresh to continue.`), {
      status: 409,
    });
};
export function createApp(
  db: Db,
  { adminPassword = process.env.ADMIN_PASSWORD, testMode = process.env.TEST_MODE === 'true' } = {},
) {
  const timeoutMs = testMode
    ? Math.max(500, Math.min(90000, Number(process.env.TEST_TIMEOUT_MS || 3000)))
    : 90000;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, version: VERSION, test_mode: testMode }),
  );
  function snapshot(s: any) {
    const { token_hash, ...safe } = s;
    return {
      ...safe,
      trials: all(db, 'trials').filter((t) => t.session_id === s.id),
      choices: all(db, 'gallery_choices').filter((c) => c.session_id === s.id),
      feedback: all(db, 'variant_feedback').filter((f) => f.session_id === s.id),
      server_time: iso(),
      timeout_ms: timeoutMs,
    };
  }
  app.post('/api/sessions', (req, res) => {
    const b = z
      .object({
        consent: z.literal(true),
        source_type: z.enum(['real', 'demo', 'automated_test']).default('real'),
        device_class: z.enum(['mobile', 'desktop']).optional(),
        mode: z.enum(['study', 'workspace']).default('study'),
        preferred_ui: z.enum(variantIds as [VariantId, ...VariantId[]]).optional(),
        mood_guided_demo: z.boolean().default(false),
      })
      .parse(req.body);
    if (b.source_type === 'automated_test' && !testMode)
      return res
        .status(403)
        .json({ error: 'Automated provenance is available only in TEST_MODE.' });
    const token = randomBytes(24).toString('hex');
    const participant_id = randomUUID(),
      id = randomUUID();
    const allocation_seed = randomBytes(4).readUInt32BE();
    const rng = seeded(allocation_seed);
    const gallery_order = [...variantIds];
    for (let i = 7; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [gallery_order[i], gallery_order[j]] = [gallery_order[j], gallery_order[i]];
    }
    const session = {
      id,
      participant_id,
      source_type: b.source_type,
      token_hash: hash(token),
      consent_version: 'consent-1.0',
      consented_at: iso(),
      study_version: VERSION,
      status: 'active',
      phase: 'mood',
      created_at: iso(),
      mood: null,
      trial_index: 0,
      assigned_sequence: [],
      allocation_seed,
      gallery_order,
      sandbox: freshTasks(),
      practice_complete: false,
      mode: b.mode,
      preferred_ui: b.preferred_ui || 'U01',
      preference_explicit: !!b.preferred_ui,
      mood_guided_demo: b.mode === 'workspace' && b.mood_guided_demo,
    };
    atomic(db, () => {
      put(db, 'participants', {
        id: participant_id,
        participant_id,
        source_type: b.source_type,
        created_at: iso(),
        device_class: b.device_class,
      });
      put(db, 'sessions', session);
    });
    res.status(201).json({ token, session: snapshot(session) });
  });
  const auth: express.RequestHandler = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const s = get(db, 'sessions', String(req.params.id));
    if (!s || !token || hash(token) !== s.token_hash) {
      res.status(401).json({ error: 'Session code was not recognized.' });
      return;
    }
    res.locals.session = s;
    next();
  };
  app.get('/api/sessions/:id', auth, (_req, res) => res.json(snapshot(res.locals.session)));
  app.delete('/api/sessions/:id', auth, (_req, res) => {
    deleteParticipant(db, res.locals.session.participant_id);
    res.json({ deleted: true });
  });
  function route(path: string, fn: (s: any, b: any) => any) {
    app.post('/api/sessions/:id/' + path, auth, (req, res) => {
      const result = atomic(db, () => {
        const s = res.locals.session;
        const key = req.body.operation_id;
        if (key) {
          idSchema.parse(key);
          if (s.operation_ids?.includes(key)) return snapshot(s);
        }
        if (s.status === 'stopped' && path !== 'resume')
          throw Object.assign(new Error('Resume this stopped session before making changes.'), {
            status: 409,
          });
        const value = fn(s, req.body);
        if (key) s.operation_ids = [...(s.operation_ids || []).slice(-99), key];
        put(db, 'sessions', s);
        return value === undefined ? snapshot(s) : value;
      });
      res.json(result);
    });
  }
  const base = (s: any) => ({
    session_id: s.id,
    participant_id: s.participant_id,
    source_type: s.source_type,
  });
  app.post('/api/sessions/:id/predict', auth, async (req, res, next) => {
    try {
      const s = res.locals.session;
      requirePhase(s, 'mood');
      if (s.status !== 'active')
        throw Object.assign(new Error('Resume this session before predicting mood.'), {
          status: 409,
        });
      const b = z
        .object({
          text_opt_in: z.boolean(),
          text: z.string().max(1000).default(''),
          reference_mood: z.enum(['positive', 'neutral', 'stressed', 'unclassified']),
        })
        .parse(req.body);
      if (!b.text_opt_in || !b.text.trim())
        return res.json({
          available: false,
          method: 'self-report',
          predicted_mood: null,
          reason: 'Optional text was skipped or not consented. Use your own report.',
        });
      const result = await predictMood(b.text);
      const current = get(db, 'sessions', s.id);
      if (!current || current.phase !== 'mood' || current.status !== 'active')
        throw Object.assign(new Error('This assessment is no longer active.'), { status: 409 });
      const id = randomUUID();
      put(db, 'mood_predictions', {
        ...result,
        ...base(current),
        model_source_type: result.source_type || 'local-study-or-rule',
        id,
        phase: 'before',
        reference_mood: b.reference_mood,
        text_opt_in: true,
        created_at: iso(),
      });
      res.json({ ...result, prediction_id: id });
    } catch (e) {
      next(e);
    }
  });
  route('mood', (s, b) => {
    const input = moodSchema.parse(b);
    if (s.mode !== 'workspace' && (input.valence === null || input.arousal === null))
      throw Object.assign(new Error('Study check-ins require both context ratings.'), {
        status: 400,
      });
    if (
      (input.camera_suggestion || input.assessment_source?.startsWith('camera')) &&
      s.mode !== 'workspace'
    )
      throw Object.assign(
        new Error('Camera assessment is only available in the personal workspace.'),
        { status: 400 },
      );
    const phase = s.phase === 'mood' ? 'before' : 'after';
    if (phase === 'after') requirePhase(s, 'exitMood');
    const prediction = input.prediction_id
      ? get(db, 'mood_predictions', input.prediction_id)
      : null;
    if (
      input.prediction_id &&
      (!prediction || prediction.session_id !== s.id || phase !== 'before')
    )
      throw Object.assign(new Error('Prediction does not belong to this assessment.'), {
        status: 400,
      });
    put(db, 'mood_reports', {
      ...base(s),
      id: s.id + '-' + phase,
      phase,
      ...input,
      reference_mood: prediction?.reference_mood || input.mood,
      prediction_confirmed: prediction ? prediction.predicted_mood === input.mood : null,
      text: input.text_opt_in ? input.text || null : null,
      created_at: iso(),
    });
    if (phase === 'before') {
      s.mood = input.mood;
      s.active_mood = input.mood;
      s.phase = s.mode === 'workspace' ? 'recommendation' : 'gallery';
    } else {
      s.phase = 'debrief';
      s.status = 'complete';
      s.ended_at = iso();
      s.active_mood = input.mood;
    }
  });
  route('choice', (s, b) => {
    const input = choiceSchema.parse(b);
    const phase = s.phase === 'gallery' ? 'initial' : 'final';
    if (phase === 'final') requirePhase(s, 'final');
    if (JSON.stringify(input.ordering) !== JSON.stringify(s.gallery_order))
      throw Object.assign(new Error('Gallery ordering must match the persisted server order.'), {
        status: 400,
      });
    put(db, 'gallery_choices', {
      ...base(s),
      id: s.id + '-' + phase,
      phase,
      ...input,
      tested: s.assigned_sequence.includes(input.ui_variant),
      created_at: iso(),
    });
    if (phase === 'initial') {
      const prior = all(db, 'allocations').filter((a) => a.source_type === s.source_type);
      const allocation = allocate(s.mood, s.allocation_seed, prior);
      s.assigned_sequence = allocation.variants;
      s.assignments = allocation.trials;
      s.initial_choice = input.ui_variant;
      s.phase = 'practice';
      put(db, 'allocations', {
        ...base(s),
        id: s.id,
        mood: s.mood,
        seed: s.allocation_seed,
        ...allocation,
        created_at: iso(),
      });
    } else {
      s.final_choice = input.ui_variant;
      s.phase = 'exitMood';
    }
  });
  route('practice', (s, b) => {
    requirePhase(s, 'practice');
    z.object({ completed: z.literal(true) }).parse(b);
    if (s.sandbox.find((t: any) => t.id === 'T24')?.status !== 'done')
      throw Object.assign(
        new Error('Open Editorial storyboard and mark it complete to finish practice.'),
        { status: 400 },
      );
    s.practice_complete = true;
    s.phase = 'trials';
    s.sandbox = freshTasks();
  });
  route('start', (s, b) => {
    idSchema.parse(b.request_id);
    requirePhase(s, 'trials');
    const assignment = s.assignments[s.trial_index];
    const id = s.id + '-trial-' + s.trial_index;
    let t = get(db, 'trials', id);
    if (!t) {
      const c = challenge(assignment.task_id);
      t = {
        ...base(s),
        id,
        ui_variant: assignment.variant,
        task_id: c.id,
        task_family: c.family,
        difficulty: c.difficulty,
        sequence_index: s.trial_index,
        started_at: iso(),
        ended_at: null,
        elapsed_ms: null,
        status: 'active',
        error_count: 0,
        retry_count: 0,
      };
      put(db, 'trials', t);
      s.sandbox = freshTasks();
    }
  });
  route('event', (s, b) => {
    const input = z
      .object({
        id: idSchema,
        type: z.enum([
          'task_open',
          'course_open',
          'deadline_inspect',
          'completion_action',
          'status_action',
          'backtrack',
          'navigation',
        ]),
        target_id: z.string().max(100),
        client_ms: z.number().min(0).max(86400000),
        status: z.enum(['todo', 'progress', 'done']).optional(),
      })
      .parse(b);
    if (get(db, 'interaction_events', input.id)) return snapshot(s);
    const t = get(db, 'trials', s.id + '-trial-' + s.trial_index);
    if (
      !['practice', 'trials', 'workspace', 'debrief'].includes(s.phase) ||
      (s.phase === 'debrief' && !s.active_ui) ||
      (s.phase === 'trials' && t?.status !== 'active')
    )
      throw Object.assign(new Error('Start a task before recording workspace actions.'), {
        status: 409,
      });
    const validTargets = [
      ...freshTasks().map((t) => t.id),
      ...courses.map((c) => c.id),
      ...milestones.map((m) => m.id),
      ...variantIds,
      'all',
      'queue',
      'next',
      'attention',
      'complete',
      'courses',
      'week',
      'tasks',
      'fallback',
    ];
    if (!validTargets.includes(input.target_id))
      throw Object.assign(new Error('Unknown interaction target.'), { status: 400 });
    if (input.type === 'completion_action' || input.type === 'status_action') {
      if (!input.status || !s.sandbox.some((t: any) => t.id === input.target_id))
        throw Object.assign(new Error('Task action requires a valid task and status.'), {
          status: 400,
        });
      s.sandbox = updateTask(s.sandbox, input.target_id, input.status);
    }
    put(db, 'interaction_events', {
      ...base(s),
      ...input,
      event_type: input.type,
      trial_id: t?.id || null,
      ui_variant:
        s.phase === 'practice'
          ? 'U01'
          : ['workspace', 'debrief'].includes(s.phase)
            ? s.active_ui
            : t.ui_variant,
      created_at: iso(),
    });
  });
  route('answer', (s, b) => {
    const input = z
      .object({
        request_id: idSchema,
        answer: z.string().max(100).default(''),
        outcome: z.enum(['submit', 'give_up', 'timeout', 'abandoned']),
        elapsed_ms: z.number().min(0).max(86400000),
      })
      .parse(b);
    const prior = all(db, 'trials').find(
      (t) => t.session_id === s.id && t.request_id === input.request_id,
    );
    if (prior) return snapshot(s);
    requirePhase(s, 'trials');
    const t = get(db, 'trials', s.id + '-trial-' + s.trial_index);
    if (!t || t.status !== 'active')
      throw Object.assign(new Error('Start this task first.'), { status: 409 });
    const wall = Date.now() - Date.parse(t.started_at),
      limit = timeoutMs;
    const timeout = wall >= limit || input.outcome === 'timeout';
    t.status = timeout
      ? 'timeout'
      : input.outcome === 'give_up'
        ? 'give_up'
        : input.outcome === 'abandoned'
          ? 'abandoned'
          : scoreTask(t.task_id, input.answer, s.sandbox)
            ? 'success'
            : 'incorrect';
    t.elapsed_ms = Math.min(limit, Math.max(input.elapsed_ms, wall));
    t.ended_at = iso();
    t.error_count = t.status === 'incorrect' ? 1 : 0;
    t.request_id = input.request_id;
    put(db, 'trials', t);
    s.trial_index++;
    s.sandbox = freshTasks();
    if (s.trial_index % 2 === 0) s.phase = 'feedback';
  });
  route('feedback', (s, b) => {
    requirePhase(s, 'feedback');
    const rating = (max: number) => z.number().int().min(1).max(max);
    const input = z
      .object({
        satisfaction: rating(5),
        effort: rating(7),
        clarity: rating(5),
        reuse_intent: rating(5),
        comment: z.string().max(1000).optional(),
      })
      .parse(b);
    const ui_variant = s.assigned_sequence[Math.floor((s.trial_index - 1) / 2)];
    put(db, 'variant_feedback', {
      ...base(s),
      id: s.id + '-' + ui_variant,
      ui_variant,
      ...input,
      created_at: iso(),
    });
    s.phase = s.trial_index === 8 ? 'final' : 'trials';
  });
  route('stop', (s, _b) => {
    if (s.status === 'complete') return snapshot(s);
    const t = get(db, 'trials', s.id + '-trial-' + s.trial_index);
    if (t?.status === 'active') {
      t.status = 'abandoned';
      t.ended_at = iso();
      t.elapsed_ms = Math.min(timeoutMs, Date.now() - Date.parse(t.started_at));
      put(db, 'trials', t);
      s.trial_index++;
      if (s.trial_index % 2 === 0) s.phase = 'feedback';
    }
    s.status = 'stopped';
    s.stopped_at = iso();
  });
  route('resume', (s, _b) => {
    if (s.status === 'stopped') s.status = 'active';
  });
  app.get('/api/sessions/:id/recommendation', auth, (_req, res) => {
    const s = res.locals.session;
    if (
      s.mode === 'workspace'
        ? !['recommendation', 'workspace'].includes(s.phase) || s.status !== 'active'
        : s.status !== 'complete'
    )
      return res
        .status(409)
        .json({ error: 'Finish the study before requesting a recommendation.' });
    const previous = get(db, 'recommendations', s.id);
    if (previous) return res.json(previous); // Freeze the evidence snapshot; revisits must not rewrite a past decision.
    const result = recommendWorkspace(
      exportData(db).summary,
      s.active_mood || s.mood,
      s.final_choice || s.preferred_ui || 'U01',
      s.mode === 'workspace' ? s.preference_explicit : true,
      s.mode === 'workspace' && s.mood_guided_demo,
    );
    put(db, 'recommendations', {
      ...base(s),
      id: s.id,
      mode: s.mode || 'study',
      inputs: {
        active_mood: s.active_mood || s.mood,
        source: 'human-confirmed',
        preferred_ui: s.final_choice || s.preferred_ui || 'U01',
      },
      ...result,
      generated_at: iso(),
      decision: previous?.decision || null,
      chosen_ui: previous?.chosen_ui || null,
      decided_at: previous?.decided_at || null,
    });
    res.json(result);
  });
  route('recommendation', (s, b) => {
    if (s.mode === 'workspace') {
      if (!['recommendation', 'workspace'].includes(s.phase)) requirePhase(s, 'recommendation');
    } else requirePhase(s, 'debrief');
    const input = z
      .object({
        decision: z.enum(['accepted', 'rejected', 'manual_override']),
        ui_variant: z.enum(variantIds as [VariantId, ...VariantId[]]),
      })
      .parse(b);
    const r = get(db, 'recommendations', s.id);
    if (!r) throw Object.assign(new Error('Generate a recommendation first.'), { status: 409 });
    if (input.decision === 'accepted' && input.ui_variant !== r.ui_variant)
      throw Object.assign(new Error('Accept the suggested design or use manual override.'), {
        status: 400,
      });
    put(db, 'recommendations', {
      ...r,
      decision: input.decision,
      chosen_ui: input.ui_variant,
      decided_at: iso(),
    });
    s.active_ui = input.ui_variant;
    if (s.mode === 'workspace') s.phase = 'workspace';
  });
  route('workspace-feedback', (s, b) => {
    if (!(
      (s.mode === 'workspace' && s.phase === 'workspace') ||
      (s.phase === 'debrief' && s.active_ui)
    ))
      throw Object.assign(new Error('Follow-up feedback requires an opened chosen workspace.'), {
        status: 409,
      });
    const rating = (max: number) => z.number().int().min(1).max(max);
    const input = z
      .object({
        satisfaction: rating(5),
        effort: rating(7),
        comment: z.string().max(1000).optional(),
      })
      .parse(b);
    put(db, 'workspace_feedback', {
      ...base(s),
      id: randomUUID(),
      ...input,
      ui_variant: s.active_ui,
      mood: s.active_mood,
      context: 'self-selected-workspace-not-randomized',
      created_at: iso(),
    });
  });
  const attempts = new Map<string, { n: number; time: number }>();
  app.use('/api/research', (req, res, next) => {
    if (!adminPassword || adminPassword === 'replace-with-a-long-random-local-password')
      return res
        .status(503)
        .json({ error: 'Set a private ADMIN_PASSWORD in .env before opening research tools.' });
    const ip = req.ip || 'local';
    const a = attempts.get(ip);
    if (a && a.n >= 10 && Date.now() - a.time < 60000)
      return res.status(429).json({ error: 'Too many attempts. Try again in one minute.' });
    const supplied = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (!timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash(adminPassword)))) {
      attempts.set(ip, { n: (a?.n || 0) + 1, time: Date.now() });
      return res.status(401).json({ error: 'Research password was not recognized.' });
    }
    attempts.delete(ip);
    next();
  });
  app.get('/api/research', async (_req, res) => {
    const data = exportData(db);
    res.json({
      ...data.summary,
      ...additionalMetrics(data.tables),
      model_status: await modelBridge(),
      public_model_status: await publicModelBridge(),
      sessions: data.tables.sessions,
      synthetic_sessions: all(db, 'sessions').filter((s) => s.source_type !== 'real').length,
      readiness: MOODS_FOR_REPORT.map((m) => recommend(data.summary, m)),
      static_baseline: recommend(data.summary, 'unclassified'),
    });
  });
  app.get('/api/research/sessions/:id', (req, res) => {
    const data = exportData(db, req.query.include_synthetic === 'true');
    res.json(
      Object.fromEntries(
        tables.map((t) => [
          t,
          data.tables[t].filter((r) => r.session_id === req.params.id || r.id === req.params.id),
        ]),
      ),
    );
  });
  app.delete('/api/research/participants/:id', (req, res) => {
    deleteParticipant(db, String(req.params.id));
    res.json({ deleted: true });
  });
  app.get('/api/research/export', (req, res) =>
    res
      .attachment('moodspace-study.json')
      .json(exportData(db, req.query.include_synthetic === 'true')),
  );
  app.get('/api/research/export-csv', (req, res) => {
    const data = exportData(db, req.query.include_synthetic === 'true');
    const files = Object.fromEntries(tables.map((t) => [t + '.csv', strToU8(csv(data.tables[t]))]));
    files['manifest.json'] = strToU8(JSON.stringify(data.manifest, null, 2));
    files['summary.json'] = strToU8(JSON.stringify(data.summary, null, 2));
    res
      .type('application/zip')
      .attachment('moodspace-csv.zip')
      .send(Buffer.from(zipSync(files)));
  });
  app.get('/api/research/export/:table', (req, res) => {
    const table = z.enum(tables).parse(req.params.table);
    res
      .type('text/csv')
      .attachment(table + '.csv')
      .send(csv(exportData(db, req.query.include_synthetic === 'true').tables[table]));
  });
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err instanceof z.ZodError ? 400 : err.status || 500).json({
      error:
        err instanceof z.ZodError
          ? 'Invalid input: ' + err.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')
          : err.status
            ? err.message
            : 'The server could not save this change. Please retry.',
    });
  });
  return app;
}
const MOODS_FOR_REPORT: Mood[] = ['positive', 'neutral', 'stressed'];
