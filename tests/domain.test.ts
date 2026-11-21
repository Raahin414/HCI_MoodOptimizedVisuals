import { describe, it, expect } from 'vitest';
import {
  freshTasks,
  fixtureTasks,
  courses,
  milestones,
  taskBank,
  scoreTask,
  challenge,
  courseProgress,
  quadrant,
  updateTask,
  variantIds,
  MOODS,
  ruleMood,
} from '../src/domain';
import { allocate } from '../server/allocation';
import { summarize, recommend } from '../server/recommendation';
import { csv, exportData } from '../server/exports';
import { openDb, put } from '../server/db';
describe('canonical academic domain', () => {
  it('contains 5 courses, 24 tasks, 8 milestones and 24 valid mood/UI cells', () => {
    expect(courses).toHaveLength(5);
    expect(fixtureTasks).toHaveLength(24);
    expect(milestones).toHaveLength(8);
    expect(new Set(MOODS.flatMap((m) => variantIds.map((v) => m.id + '-' + v))).size).toBe(24);
    expect(new Set(fixtureTasks.map((t) => t.id)).size).toBe(24);
  });
  it('scores actions from sandbox state, not a Done assertion', () => {
    const c = challenge('A1');
    expect(scoreTask(c.id, c.answer, freshTasks())).toBe(false);
    const changed = updateTask(freshTasks(), c.targetId, 'done');
    expect(scoreTask(c.id, '', changed)).toBe(true);
    expect(fixtureTasks.find((t) => t.id === c.targetId)?.status).not.toBe('done');
  });
  it('scores all deterministic task examples and maintains unambiguous fixture answers', () => {
    expect(taskBank.length).toBeGreaterThanOrEqual(8);
    for (const c of taskBank.filter((c) => c.family !== 'complete'))
      expect(scoreTask(c.id, c.answer, freshTasks())).toBe(true);
    expect(
      [...courses].sort(
        (a, b) => courseProgress(fixtureTasks, a.id) - courseProgress(fixtureTasks, b.id),
      )[0].id,
    ).toBe('C03');
    expect(
      fixtureTasks
        .filter((t) => t.due < '2026-11-18' && t.priority === 'high' && t.status !== 'done')
        .map((t) => t.id),
    ).toEqual(['T01']);
    expect(quadrant(fixtureTasks[0])).toBe('urgent-important');
  });
  it('phrase matching can abstain and handles a simple negation', () => {
    expect(ruleMood('I am excited').mood).toBe('positive');
    expect(ruleMood('I am not happy').mood).toBe('unclassified');
    expect(ruleMood('stressed and happy').mood).toBe('unclassified');
  });
});
describe('allocation audit', () => {
  it('is reproducible, chooses 4 different variants and 8 distinct matched examples', () => {
    const a = allocate('neutral', 129, []);
    expect(a).toEqual(allocate('neutral', 129, []));
    expect(new Set(a.variants).size).toBe(4);
    expect(new Set(a.trials.map((t) => t.task_id)).size).toBe(8);
    for (const v of a.variants) {
      const trials = a.trials.filter((t) => t.variant === v);
      expect(trials).toHaveLength(2);
      expect(trials.map((t) => challenge(t.task_id).family).sort()).toEqual([
        'complete',
        'deadline',
      ]);
    }
  });
  it('balances exposure within each naturally reported mood', () => {
    const prior: any[] = [];
    for (const mood of ['positive', 'neutral', 'stressed'] as const) {
      for (let seed = 0; seed < 72; seed++) {
        const a = allocate(mood, seed, prior);
        prior.push({ mood, variants: a.variants });
      }
      const counts = variantIds.map(
        (v) => prior.filter((a) => a.mood === mood && a.variants.includes(v)).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });
});
describe('genuine evidence and export', () => {
  it('returns honest 24-cell zero coverage and preference fallback', () => {
    const s = summarize({});
    expect(s.coverage).toHaveLength(24);
    expect(s.participant_count).toBe(0);
    expect(recommend(s, 'positive', 'U08')).toMatchObject({
      state: 'insufficient_evidence',
      ui_variant: 'U08',
      sample_size: 0,
    });
  });
  it('weights participants once, excludes active trials and synthetic records', () => {
    const s = summarize({
      participants: [
        { id: 'P1', source_type: 'real' },
        { id: 'P2', source_type: 'real' },
        { id: 'P3', source_type: 'automated_test' },
      ],
      sessions: [
        {
          id: 'S1',
          participant_id: 'P1',
          source_type: 'real',
          consented_at: '2026-11-18',
          consent_version: '1',
          mood: 'neutral',
        },
        {
          id: 'S2',
          participant_id: 'P2',
          source_type: 'real',
          consented_at: '2026-11-18',
          consent_version: '1',
          mood: 'neutral',
        },
        {
          id: 'S3',
          participant_id: 'P3',
          source_type: 'automated_test',
          consented_at: '2026-11-18',
          consent_version: '1',
          mood: 'neutral',
        },
      ],
      trials: [
        ...Array.from({ length: 8 }, (_, i) => ({
          source_type: 'real',
          session_id: 'S1',
          participant_id: 'P1',
          ui_variant: 'U01',
          status: 'success',
          task_family: 'deadline',
          elapsed_ms: 1000,
          error_count: 0,
        })),
        {
          source_type: 'real',
          session_id: 'S2',
          participant_id: 'P2',
          ui_variant: 'U01',
          status: 'timeout',
          task_family: 'deadline',
          elapsed_ms: 90000,
          error_count: 0,
        },
        {
          source_type: 'real',
          session_id: 'S2',
          participant_id: 'P2',
          ui_variant: 'U02',
          status: 'active',
        },
        {
          source_type: 'automated_test',
          session_id: 'S3',
          participant_id: 'P3',
          ui_variant: 'U01',
          status: 'success',
          elapsed_ms: 1,
          error_count: 0,
        },
      ],
    });
    expect(s.overall[0].success_rate).toBe(0.5);
    expect(s.overall[0].unique_participants).toBe(2);
    expect(s.overall[1].trial_count).toBe(0);
  });
  it('activates only at all-cell support and preserves ties as a preference', () => {
    const data: any = { participants: [], sessions: [], trials: [], variant_feedback: [] };
    for (let p = 0; p < 8; p++) {
      data.participants.push({ id: 'P' + p, source_type: 'real' });
      data.sessions.push({
        id: 'S' + p,
        participant_id: 'P' + p,
        source_type: 'real',
        consented_at: '2026-11-18',
        consent_version: '1',
        mood: 'neutral',
      });
      for (const ui of variantIds)
        data.trials.push({
          source_type: 'real',
          session_id: 'S' + p,
          participant_id: 'P' + p,
          ui_variant: ui,
          status: 'success',
          task_family: 'deadline',
          elapsed_ms: 1000,
          error_count: 0,
        });
    }
    const r = recommend(summarize(data), 'neutral', 'U06');
    expect(r).toMatchObject({
      state: 'exploratory',
      method: 'empirical-mood',
      ui_variant: 'U06',
      sample_size: 8,
      h3: 'unverified',
    });
    data.trials.pop();
    expect(recommend(summarize(data), 'neutral', 'U06').state).toBe('insufficient_evidence');
  });
  it('escapes CSV newlines/quotes and neutralizes spreadsheet formulas', () => {
    const output = csv([{ id: '1', comment: 'A, "quote"\nand line', danger: '=cmd()' }]);
    expect(output).toContain('"A, ""quote""\nand line"');
    expect(output).toContain('"\'=cmd()"');
  });
  it('exports genuine records without session secret hashes or sandboxes', () => {
    const db = openDb(':memory:');
    put(db, 'sessions', {
      id: 'real',
      source_type: 'real',
      participant_id: 'p',
      token_hash: 'private',
      sandbox: [],
      mood: 'neutral',
    });
    put(db, 'sessions', { id: 'test', source_type: 'automated_test' });
    const data = exportData(db);
    expect(data.manifest.row_counts.sessions).toBe(1);
    expect(JSON.stringify(data)).not.toContain('private');
    expect(data.tables.sessions[0]).not.toHaveProperty('sandbox');
    expect(data.manifest.excluded_synthetic).toBe(true);
    db.close();
  });
});
