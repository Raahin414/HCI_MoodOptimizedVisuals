import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openDb, tables } from './db.js';
import { exportData, csv } from './exports.js';
const db = openDb();
const includeSynthetic = process.argv.includes('--include-synthetic');
const data = exportData(db, includeSynthetic);
const folder = 'exports/' + new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
mkdirSync(folder, { recursive: true });
writeFileSync(folder + '/study.json', JSON.stringify(data, null, 2));
writeFileSync(folder + '/manifest.json', JSON.stringify(data.manifest, null, 2));
for (const t of tables) writeFileSync(folder + '/' + t + '.csv', csv(data.tables[t]));
console.log(
  'Exported records to ' +
    folder +
    (includeSynthetic
      ? ' (explicit labeled synthetic inclusion; not pure research evidence).'
      : ' (demo/test excluded).'),
);
db.close();
