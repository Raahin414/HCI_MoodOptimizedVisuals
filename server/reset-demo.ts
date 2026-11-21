import 'dotenv/config';
import { openDb, all, deleteParticipant } from './db.js';
const db = openDb();
const demo = all(db, 'participants').filter((p) => p.source_type === 'demo');
for (const p of demo) deleteParticipant(db, p.id);
console.log(`Removed ${demo.length} demo participants. Real participant records were preserved.`);
db.close();
