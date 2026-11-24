import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { openDb, all, get, put, type Db } from '../server/db';
import { modelBridge } from '../server/moodModel';
import { exportData } from '../server/exports';
import { recommend, summarize } from '../server/recommendation';
import { variantIds } from '../src/domain';
let db: Db, server: Server, url: string;
beforeEach(async () => {
  vi.stubEnv('PUBLIC_MOOD_MODEL_ENABLED', 'false');
  db = openDb(':memory:');
  server = createApp(db, { adminPassword: 'test-admin', testMode: true }).listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  url = 'http://127.0.0.1:' + (server.address() as any).port;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  vi.unstubAllEnvs();
});
async function call(path: string, body?: any, token?: string, method?: string) {
  const r = await fetch(url + '/api' + path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
const assessment = { valence: 3, arousal: 3, text_opt_in: false };
it('keeps unused workspace scales null while requiring actual ratings in the study', async () => {
  for (const mode of ['workspace', 'study']) {
    const c = (await call('/sessions', { consent: true, source_type: 'automated_test', mode }))
      .data;
    const response = await call(
      '/sessions/' + c.session.id + '/mood',
      {
        mood: 'positive',
        valence: null,
        arousal: null,
        text_opt_in: false,
      },
      c.token,
    );
    expect(response.status).toBe(mode === 'workspace' ? 200 : 400);
    if (mode === 'workspace')
      expect(all(db, 'mood_reports')[0]).toMatchObject({ valence: null, arousal: null });
  }
});
it('stores camera label provenance without frames and rejects camera labels in the original study', async () => {
  for (const mode of ['workspace', 'study']) {
    const c = (await call('/sessions', { consent: true, source_type: 'automated_test', mode }))
      .data;
    const result = await call(
      '/sessions/' + c.session.id + '/mood',
      {
        ...assessment,
        mood: 'neutral',
        assessment_source: 'camera-corrected',
        camera_suggestion: 'positive',
        frames: 'MUST_NOT_BE_SAVED',
      },
      c.token,
    );
    expect(result.status).toBe(mode === 'workspace' ? 200 : 400);
    if (mode === 'workspace') {
      const report = all(db, 'mood_reports').find((r) => r.session_id === c.session.id);
      expect(report).toMatchObject({
        assessment_source: 'camera-corrected',
        camera_suggestion: 'positive',
        mood: 'neutral',
      });
      expect(report.frames).toBeUndefined();
    }
  }
});
for (const mood of ['positive', 'neutral', 'stressed'])
  it(`${mood}: evaluates all eight, renders chosen-state data, records override/actions/feedback, and preserves provenance`, async () => {
    const c = (
      await call('/sessions', {
        consent: true,
        source_type: 'automated_test',
        mode: 'workspace',
        preferred_ui: 'U08',
      })
    ).data;
    const root = '/sessions/' + c.session.id;
    const post = (p: string, b: any) => call(root + '/' + p, b, c.token);
    expect((await post('mood', { ...assessment, mood, text: 'DO NOT SAVE' })).data.phase).toBe(
      'recommendation',
    );
    const result = (await call(root + '/recommendation', undefined, c.token)).data;
    expect(result).toMatchObject({
      mood,
      ui_variant: 'U08',
      selection_source: 'user-preference',
      state: 'insufficient_evidence',
    });
    expect(result.candidates).toHaveLength(8);
    expect((await post('recommendation', { decision: 'accepted', ui_variant: 'U01' })).status).toBe(
      400,
    );
    expect(
      (await post('recommendation', { decision: 'accepted', ui_variant: 'U08' })).data,
    ).toMatchObject({ phase: 'workspace', active_ui: 'U08', active_mood: mood });
    expect(
      (await post('recommendation', { decision: 'manual_override', ui_variant: 'U03' })).data
        .active_ui,
    ).toBe('U03');
    expect(
      (
        await post('event', {
          id: randomUUID(),
          type: 'navigation',
          target_id: 'fallback',
          client_ms: 1,
        })
      ).status,
    ).toBe(200);
    await post('event', {
      id: randomUUID(),
      type: 'completion_action',
      target_id: 'T02',
      status: 'done',
      client_ms: 20,
    });
    expect(get(db, 'sessions', c.session.id).sandbox.find((t: any) => t.id === 'T02').status).toBe(
      'done',
    );
    const feedback = { satisfaction: 4, effort: 3, operation_id: randomUUID() };
    await post('workspace-feedback', feedback);
    await post('workspace-feedback', feedback);
    expect(all(db, 'workspace_feedback')).toHaveLength(1);
    expect(all(db, 'variant_feedback')).toHaveLength(0);
    const frozen = (await call(root + '/recommendation', undefined, c.token)).data;
    expect(frozen).toMatchObject({
      ui_variant: 'U08',
      chosen_ui: 'U03',
      decision: 'manual_override',
    });
    expect(exportData(db).manifest.row_counts.sessions).toBe(0);
    expect(exportData(db, true).manifest.counts_by_source.automated_test).toBe(1);
    expect(exportData(db, true).summary.participant_count).toBe(0);
    const exported = (
      await call('/research/export?include_synthetic=true', undefined, 'test-admin')
    ).data;
    expect(exported.manifest.excluded_synthetic).toBe(false);
    expect(exported.tables.sessions[0].source_type).toBe('automated_test');
    await call(root, undefined, c.token, 'DELETE');
    for (const t of [
      'sessions',
      'mood_predictions',
      'workspace_feedback',
      'interaction_events',
      'recommendations',
    ] as const)
      expect(all(db, t)).toHaveLength(0);
  });
it('skips prediction without text consent; prediction correction preserves independent reference label and blocks post-task leakage', async () => {
  const c = (
    await call('/sessions', { consent: true, source_type: 'automated_test', mode: 'workspace' })
  ).data;
  const root = '/sessions/' + c.session.id;
  let p = await call(
    root + '/predict',
    { text_opt_in: false, text: 'PRIVATE', reference_mood: 'neutral' },
    c.token,
  );
  expect(p.data.method).toBe('self-report');
  expect(all(db, 'mood_predictions')).toHaveLength(0);
  p = await call(
    root + '/predict',
    { text_opt_in: true, text: 'I am excited and happy', reference_mood: 'neutral' },
    c.token,
  );
  expect(p.data).toMatchObject({ method: 'rule-based demonstration', predicted_mood: 'positive' });
  await call(
    root + '/mood',
    {
      ...assessment,
      mood: 'positive',
      text_opt_in: true,
      text: 'I am excited and happy',
      prediction_id: p.data.prediction_id,
    },
    c.token,
  );
  expect(all(db, 'mood_reports')[0]).toMatchObject({
    reference_mood: 'neutral',
    mood: 'positive',
    prediction_confirmed: true,
  });
  expect(JSON.stringify(all(db, 'mood_predictions'))).not.toContain('excited');
  expect(
    (
      await call(
        root + '/predict',
        { text_opt_in: true, text: 'stressed', reference_mood: 'neutral' },
        c.token,
      )
    ).status,
  ).toBe(409);
});
it('uses a labeled neutral fallback with no preference, and blocks self-selected outcomes from experimental evidence', async () => {
  const c = (await call('/sessions', { consent: true, source_type: 'real', mode: 'workspace' }))
    .data;
  await call('/sessions/' + c.session.id + '/mood', { ...assessment, mood: 'stressed' }, c.token);
  const r = (await call('/sessions/' + c.session.id + '/recommendation', undefined, c.token)).data;
  expect(r.selection_source).toBe('neutral-fallback');
  put(db, 'trials', {
    id: 'not-randomized',
    session_id: c.session.id,
    participant_id: c.session.participant_id,
    source_type: 'real',
    ui_variant: 'U01',
    status: 'success',
    elapsed_ms: 1,
    task_family: 'deadline',
    error_count: 0,
  });
  const data = exportData(db);
  expect(data.summary.overall[0].unique_participants).toBe(0);
  expect(data.summary.workspace_sessions).toBe(1);
});
it('treats missing successful times as a tie and excludes the selected option from alternatives', () => {
  const data: any = { participants: [], sessions: [], trials: [] };
  for (let i = 0; i < 8; i++) {
    data.participants.push({ id: 'p' + i, source_type: 'real' });
    data.sessions.push({
      id: 's' + i,
      participant_id: 'p' + i,
      source_type: 'real',
      consent_version: '1',
      consented_at: '2026-11-19',
      mood: 'neutral',
    });
    for (const ui of variantIds)
      data.trials.push({
        id: ui + i,
        source_type: 'real',
        participant_id: 'p' + i,
        session_id: 's' + i,
        ui_variant: ui,
        status: 'timeout',
        elapsed_ms: 90000,
        task_family: 'deadline',
        error_count: 0,
      });
  }
  const r = recommend(summarize(data), 'neutral', 'U08');
  expect(r.ui_variant).toBe('U08');
  expect(r.alternatives).toHaveLength(7);
  expect(r.alternatives).not.toContain('U08');
  expect(r.sample_size).toBe(8);
});
it('fails safely when a configured Python executable or model directory is unavailable', async () => {
  const prior = { dir: process.env.MOOD_MODEL_DIR, python: process.env.MOOD_PYTHON };
  try {
    process.env.MOOD_MODEL_DIR = 'work/does-not-exist';
    process.env.MOOD_PYTHON = 'no-such-moodspace-python-executable';
    expect((await modelBridge('private text')).available).toBe(false);
  } finally {
    if (prior.dir === undefined) delete process.env.MOOD_MODEL_DIR;
    else process.env.MOOD_MODEL_DIR = prior.dir;
    if (prior.python === undefined) delete process.env.MOOD_PYTHON;
    else process.env.MOOD_PYTHON = prior.python;
  }
});
