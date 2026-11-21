import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export const tables = [
  'participants',
  'sessions',
  'mood_reports',
  'gallery_choices',
  'trials',
  'interaction_events',
  'variant_feedback',
  'recommendations',
  'allocations',
  'mood_predictions',
  'workspace_feedback',
] as const;
export type Table = (typeof tables)[number];
export function openDb(path = process.env.DATABASE_PATH || 'data/moodspace.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  for (const t of tables)
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${t}(id TEXT PRIMARY KEY, session_id TEXT, participant_id TEXT, source_type TEXT NOT NULL CHECK(source_type IN ('real','demo','automated_test')), data TEXT NOT NULL CHECK(json_valid(data))); CREATE INDEX IF NOT EXISTS ${t}_session ON ${t}(session_id);`,
    );
  return db;
}
export type Db = ReturnType<typeof openDb>;
export function all(db: Db, t: Table): any[] {
  return (db.prepare(`SELECT data FROM ${t}`).all() as { data: string }[]).map((r) =>
    JSON.parse(r.data),
  );
}
export function get(db: Db, t: Table, id: string): any {
  const r = db.prepare(`SELECT data FROM ${t} WHERE id=?`).get(id) as { data: string } | undefined;
  return r ? JSON.parse(r.data) : undefined;
}
export function put(db: Db, t: Table, row: any) {
  db.prepare(
    `INSERT INTO ${t}(id,session_id,participant_id,source_type,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
  ).run(
    row.id,
    row.session_id || null,
    row.participant_id || null,
    row.source_type,
    JSON.stringify(row),
  );
}
export function atomic<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
export function deleteParticipant(db: Db, id: string) {
  return atomic(db, () => {
    for (const t of tables)
      db.prepare(`DELETE FROM ${t} WHERE participant_id=? OR id=?`).run(id, id);
  });
}
