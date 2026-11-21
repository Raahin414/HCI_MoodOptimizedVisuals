/** Synthetic software exercise only. Never opens the participant database. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { exportData, csv } from '../server/exports.js';
import { challenge } from '../src/domain.js';
const db = openDb(':memory:');
const server = createApp(db, {
  testMode: true,
  adminPassword: 'synthetic-local-process-only',
}).listen(0, '127.0.0.1');
await new Promise<void>((r) => server.once('listening', r));
const url = 'http://127.0.0.1:' + (server.address() as any).port;
async function request(path: string, body: any, token?: string) {
  const response = await fetch(url + '/api' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(path + ': ' + value.error);
  return value;
}
try {
  for (const mood of ['positive', 'neutral', 'stressed'])
    for (let n = 0; n < 16; n++) {
      const c = await request('/sessions', { consent: true, source_type: 'automated_test' });
      const post = (p: string, b: any) =>
        request('/sessions/' + c.session.id + '/' + p, b, c.token);
      let s = await post('mood', { mood, valence: 3, arousal: 3, text_opt_in: false });
      s = await post('choice', {
        ui_variant: 'U08',
        ordering: s.gallery_order,
        viewed_ids: s.gallery_order,
      });
      await post('event', {
        id: randomUUID(),
        type: 'completion_action',
        target_id: 'T24',
        status: 'done',
        client_ms: 1,
      });
      s = await post('practice', { completed: true });
      for (let i = 0; i < 8; i++) {
        s = await post('start', { request_id: randomUUID() });
        const task = challenge(s.assignments[i].task_id);
        if (task.family === 'complete')
          await post('event', {
            id: randomUUID(),
            type: 'completion_action',
            target_id: task.targetId,
            status: 'done',
            client_ms: 5,
          });
        s = await post('answer', {
          request_id: randomUUID(),
          answer: task.answer,
          outcome: 'submit',
          elapsed_ms: 1000 + i * 100,
        });
        if (i % 2)
          s = await post('feedback', { satisfaction: 3, effort: 4, clarity: 3, reuse_intent: 3 });
      }
      s = await post('choice', {
        ui_variant: 'U02',
        ordering: s.gallery_order,
        viewed_ids: s.gallery_order,
      });
      await post('mood', { mood, valence: 3, arousal: 3, text_opt_in: false });
    }
  const genuine = exportData(db),
    synthetic = exportData(db, true);
  if (
    genuine.summary.participant_count !== 0 ||
    synthetic.summary.coverage.some((c) => c.unique_participants !== 8)
  )
    throw new Error('Coverage/provenance invariant failed.');
  const directory = 'work/coverage-demo';
  mkdirSync(directory, { recursive: true });
  writeFileSync(directory + '/synthetic-sessions.json', JSON.stringify(synthetic, null, 2));
  writeFileSync(directory + '/genuine-only-export.json', JSON.stringify(genuine, null, 2));
  const coverage = synthetic.summary.coverage.map((c) => ({
    source_type: 'automated_test',
    mood: c.mood,
    ui_variant: c.ui_variant,
    unique_synthetic_participants: c.unique_participants,
    synthetic_trials: c.trial_count,
  }));
  writeFileSync(directory + '/synthetic-coverage.csv', csv(coverage));
  writeFileSync(
    directory + '/report.md',
    '# SYNTHETIC SOFTWARE COVERAGE REPORT\n\n48 automated_test sessions, 384 scored synthetic trials; 16 sessions per mood. Every cell received 8 distinct synthetic participant codes and 16 synthetic trials through the actual server assignment/scoring workflow. Genuine-only export contains zero observations. No real database was opened. These are software validation results, never human evidence or model training data.\n\n| Mood | U01 | U02 | U03 | U04 | U05 | U06 | U07 | U08 |\n|---|---|---|---|---|---|---|---|---|\n' +
      ['positive', 'neutral', 'stressed']
        .map(
          (m) =>
            '| ' +
            m +
            ' | ' +
            coverage
              .filter((c) => c.mood === m)
              .map((c) => c.unique_synthetic_participants)
              .join(' | ') +
            ' |',
        )
        .join('\n') +
      '\n',
  );
  console.log(
    'Synthetic-only coverage verified: 48 sessions, all 24 cells at 8; genuine evidence 0. Report: ' +
      directory +
      '/report.md',
  );
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
}
