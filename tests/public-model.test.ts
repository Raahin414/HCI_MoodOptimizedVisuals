import { it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createApp } from '../server/app';
import { openDb, all } from '../server/db';
const python = process.env.MOOD_PYTHON || 'python';
const available = spawnSync(python, ['--version'], { windowsHide: true }).status === 0;
it.skipIf(!available)(
  'serves the actual public artifact for all three reports, preserves observation provenance, and never creates study evidence',
  async () => {
    vi.stubEnv('PUBLIC_MOOD_MODEL_ENABLED', 'true');
    vi.stubEnv('MOOD_MODEL_DIR', '');
    vi.stubEnv('MOOD_PYTHON', python);
    const db = openDb(':memory:');
    const server = createApp(db, {
      testMode: true,
      adminPassword: 'isolated-public-model-test',
    }).listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    const root = 'http://127.0.0.1:' + (server.address() as any).port + '/api';
    async function post(path: string, b: any, token?: string) {
      const r = await fetch(root + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify(b),
      });
      const data = await r.json();
      expect(r.status).toBeLessThan(300);
      return data;
    }
    try {
      for (const [reference, text] of [
        ['positive', 'Happy and excited about a wonderful day'],
        ['neutral', 'The meeting starts at noon in the office'],
        ['stressed', 'I am scared and nervous about what might happen'],
      ]) {
        const c = await post('/sessions', {
          consent: true,
          source_type: 'automated_test',
          mode: 'workspace',
        });
        const p = await post(
          '/sessions/' + c.session.id + '/predict',
          { text_opt_in: true, text, reference_mood: reference },
          c.token,
        );
        expect(p).toMatchObject({
          available: true,
          method: 'public-corpus-model',
          source_type: 'external_public',
          calibrated_confidence: false,
        });
        expect(['positive', 'neutral', 'stressed']).toContain(p.predicted_mood);
        await post(
          '/sessions/' + c.session.id + '/mood',
          {
            mood: reference,
            valence: 3,
            arousal: 3,
            text_opt_in: true,
            text,
            prediction_id: p.prediction_id,
          },
          c.token,
        );
      }
      expect(all(db, 'mood_predictions')).toHaveLength(3);
      expect(
        all(db, 'mood_predictions').every(
          (p) => p.source_type === 'automated_test' && p.model_source_type === 'external_public',
        ),
      ).toBe(true);
      const result = await (
        await fetch(root + '/research', {
          headers: { Authorization: 'Bearer isolated-public-model-test' },
        })
      ).json();
      expect(result.participant_count).toBe(0);
      expect(result.public_model_status.available).toBe(true);
      expect(result.model_status.available).toBe(false);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
      vi.unstubAllEnvs();
    }
  },
  15000,
);
