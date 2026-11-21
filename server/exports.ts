import { all, tables, type Db } from './db.js';
import { summarize } from './recommendation.js';
import { VERSION } from '../src/domain.js';
import { additionalMetrics } from './researchMetrics.js';
export function exportData(db: Db, includeSynthetic = false) {
  const data = Object.fromEntries(
    tables.map((t) => [
      t,
      all(db, t)
        .filter((r) => includeSynthetic || r.source_type === 'real')
        .map((r) => {
          if (t === 'sessions') {
            const { token_hash, sandbox, ...safe } = r;
            return safe;
          }
          return r;
        }),
    ]),
  );
  return {
    manifest: {
      study_version: VERSION,
      exported_at: new Date().toISOString(),
      row_counts: Object.fromEntries(tables.map((t) => [t, data[t].length])),
      excluded_synthetic: !includeSynthetic,
      scope: includeSynthetic
        ? 'contains_synthetic_software_tests_and_or_rehearsals'
        : 'genuine_only',
      counts_by_source: Object.fromEntries(
        ['real', 'demo', 'automated_test'].map((source) => [
          source,
          data.sessions.filter((s) => s.source_type === source).length,
        ]),
      ),
    },
    tables: data,
    summary: {
      ...summarize(data, includeSynthetic),
      ...additionalMetrics(data),
      scope: includeSynthetic ? 'includes_synthetic_not_research_evidence' : 'genuine_only',
    },
  };
}
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return 'id\r\n';
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const esc = (v: unknown) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    keys.map(esc).join(',') +
    '\r\n' +
    rows.map((r) => keys.map((k) => esc(r[k])).join(',')).join('\r\n') +
    '\r\n'
  );
}
