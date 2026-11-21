import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app';
import { openDb, get, put, all, type Db } from '../server/db';
import { challenge } from '../src/domain';
let db: Db, server: Server, url: string;
beforeEach(async () => {
  db = openDb(':memory:');
  server = createApp(db, { adminPassword: 'isolated-test-secret', testMode: true }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise<void>((r) => server.once('listening', r));
  url = 'http://127.0.0.1:' + (server.address() as any).port;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  db.close();
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
async function create(source_type = 'automated_test') {
  return (await call('/sessions', { consent: true, source_type })).data;
}
const mood = {
  mood: 'neutral',
  valence: 3,
  arousal: 3,
  text_opt_in: false,
  text: 'DO NOT STORE THIS',
};
async function prepared() {
  const c = await create();
  const post = (path: string, b: any) => call('/sessions/' + c.session.id + '/' + path, b, c.token);
  await post('mood', mood);
  let s = (await call('/sessions/' + c.session.id, undefined, c.token)).data;
  await post('choice', {
    ui_variant: 'U08',
    ordering: s.gallery_order,
    viewed_ids: s.gallery_order,
  });
  await post('event', {
    id: randomUUID(),
    type: 'completion_action',
    target_id: 'T24',
    status: 'done',
    client_ms: 20,
  });
  await post('practice', { completed: true });
  s = (await call('/sessions/' + c.session.id, undefined, c.token)).data;
  return { ...c, post, s };
}
describe('study state and data protection', () => {
  it('requires consent, session tokens, configured research credentials and valid boundaries', async () => {
    expect((await call('/sessions', { consent: false })).status).toBe(400);
    const c = await create();
    expect((await call('/sessions/' + c.session.id)).status).toBe(401);
    expect((await call('/research')).status).toBe(401);
    expect((await call('/research', undefined, 'isolated-test-secret')).status).toBe(200);
    expect(
      (await call('/sessions/' + c.session.id + '/mood', { ...mood, valence: 6 }, c.token)).status,
    ).toBe(400);
    expect(
      (await call('/sessions/' + c.session.id + '/start', { request_id: randomUUID() }, c.token))
        .status,
    ).toBe(409);
  });
  it('discards unconsented text and makes state-changing retries idempotent', async () => {
    const c = await create();
    const op = { ...mood, operation_id: randomUUID() };
    expect((await call('/sessions/' + c.session.id + '/mood', op, c.token)).status).toBe(200);
    expect((await call('/sessions/' + c.session.id + '/mood', op, c.token)).status).toBe(200);
    expect(all(db, 'mood_reports')).toHaveLength(1);
    expect(all(db, 'mood_reports')[0].text).toBeNull();
    expect(JSON.stringify(all(db, 'mood_reports'))).not.toContain('DO NOT STORE');
    const result = await call('/sessions/' + c.session.id + '/mood', mood, c.token);
    expect(result.status).toBe(409);
  });
  it('does not permit skipping practice, unknown targets, arbitrary gallery order or invalid ratings', async () => {
    const c = await create();
    const root = '/sessions/' + c.session.id;
    await call(root + '/mood', mood, c.token);
    expect(
      (await call(root + '/choice', { ui_variant: 'U99', ordering: [], viewed_ids: [] }, c.token))
        .status,
    ).toBe(400);
    const s = get(db, 'sessions', c.session.id);
    await call(
      root + '/choice',
      { ui_variant: 'U01', ordering: s.gallery_order, viewed_ids: [] },
      c.token,
    );
    expect((await call(root + '/practice', { completed: true }, c.token)).status).toBe(400);
    expect(
      (
        await call(
          root + '/event',
          {
            id: randomUUID(),
            type: 'completion_action',
            target_id: 'T999',
            client_ms: 0,
            status: 'done',
          },
          c.token,
        )
      ).status,
    ).toBe(400);
  });
  it('completes eight correctly scored trials, four feedbacks, and independent preferences', async () => {
    const { session, post, token, s } = await prepared();
    for (let i = 0; i < 8; i++) {
      await post('start', { request_id: randomUUID() });
      const c = challenge(s.assignments[i].task_id);
      if (c.family === 'complete') {
        const ev = {
          id: randomUUID(),
          type: 'completion_action',
          target_id: c.targetId,
          status: 'done',
          client_ms: 50,
        };
        await post('event', ev);
        await post('event', ev);
      }
      const answer = {
        request_id: randomUUID(),
        answer: c.answer,
        outcome: 'submit',
        elapsed_ms: 60,
      };
      const recorded = await post('answer', answer);
      expect(recorded.status).toBe(200);
      expect(recorded.data.trials[i].status).toBe('success');
      expect((await post('answer', answer)).status).toBe(200);
      if (i % 2) {
        const fb = await post('feedback', {
          satisfaction: 4,
          effort: 3,
          clarity: 5,
          reuse_intent: 4,
        });
        expect(fb.status).toBe(200);
      }
    }
    let state = get(db, 'sessions', session.id);
    expect(state.phase).toBe('final');
    await post('choice', {
      ui_variant: 'U02',
      ordering: state.gallery_order,
      viewed_ids: state.gallery_order,
      rationale: 'Prefer lanes',
    });
    await post('mood', { ...mood, mood: 'positive' });
    state = get(db, 'sessions', session.id);
    expect(state.status).toBe('complete');
    expect(all(db, 'trials')).toHaveLength(8);
    expect(all(db, 'variant_feedback')).toHaveLength(4);
    expect(all(db, 'interaction_events')).toHaveLength(5);
    expect(all(db, 'gallery_choices').map((c) => c.ui_variant)).toEqual(['U08', 'U02']);
    const r = await call('/sessions/' + session.id + '/recommendation', undefined, token);
    expect(r.data.state).toBe('insufficient_evidence');
    expect(r.data.ui_variant).toBe('U02');
    await post('recommendation', { decision: 'manual_override', ui_variant: 'U07' });
    await call('/sessions/' + session.id + '/recommendation', undefined, token);
    expect(get(db, 'recommendations', session.id)).toMatchObject({
      decision: 'manual_override',
      chosen_ui: 'U07',
      ui_variant: 'U02',
    });
    const summary = (await call('/research', undefined, 'isolated-test-secret')).data;
    expect(summary.participant_count).toBe(0);
    expect(summary.synthetic_sessions).toBe(1);
    expect((await call('/sessions/' + session.id, undefined, token, 'DELETE')).data.deleted).toBe(
      true,
    );
    for (const table of [
      'sessions',
      'trials',
      'mood_reports',
      'gallery_choices',
      'interaction_events',
      'variant_feedback',
      'allocations',
      'recommendations',
    ] as const)
      expect(all(db, table)).toHaveLength(0);
  });
  it('preserves refresh state, records abandonment on stopping and supports withdrawal', async () => {
    const { session, post, token } = await prepared();
    await post('start', { request_id: randomUUID() });
    const active = (await call('/sessions/' + session.id, undefined, token)).data;
    expect(active.trials[0].status).toBe('active');
    expect((await post('stop', {})).data.status).toBe('stopped');
    expect(all(db, 'trials')[0].status).toBe('abandoned');
    expect((await post('start', { request_id: randomUUID() })).status).toBe(409);
    expect((await post('resume', {})).data.trial_index).toBe(1);
    expect((await call('/sessions/' + session.id, undefined, token, 'DELETE')).status).toBe(200);
    expect(all(db, 'participants')).toHaveLength(0);
  });
  it('distinguishes timeout, give-up and incorrect; never marks them successful', async () => {
    const { session, post } = await prepared();
    await post('start', { request_id: randomUUID() });
    const t = all(db, 'trials')[0];
    t.started_at = new Date(Date.now() - 4000).toISOString();
    put(db, 'trials', t);
    expect(
      (
        await post('answer', {
          request_id: randomUUID(),
          answer: challenge(t.task_id).answer,
          outcome: 'submit',
          elapsed_ms: 1,
        })
      ).data.trials[0].status,
    ).toBe('timeout');
    await post('start', { request_id: randomUUID() });
    expect(
      (
        await post('answer', {
          request_id: randomUUID(),
          answer: '',
          outcome: 'give_up',
          elapsed_ms: 10,
        })
      ).data.trials[1].status,
    ).toBe('give_up');
    await post('feedback', { satisfaction: 3, effort: 4, clarity: 3, reuse_intent: 3 });
    await post('start', { request_id: randomUUID() });
    expect(
      (
        await post('answer', {
          request_id: randomUUID(),
          answer: 'wrong',
          outcome: 'submit',
          elapsed_ms: 10,
        })
      ).data.trials[2].status,
    ).toBe('incorrect');
    expect(get(db, 'sessions', session.id).status).toBe('active');
  });
});
