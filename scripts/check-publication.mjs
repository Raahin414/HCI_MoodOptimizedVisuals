import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { parse } from 'dotenv';
import { createHash } from 'node:crypto';
const files = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const secrets = existsSync('.env')
  ? Object.entries(parse(readFileSync('.env')))
      .filter(([key, value]) => /PASSWORD|SECRET|TOKEN/.test(key) && value.length >= 12)
      .map(([, value]) => value)
  : [];
for (const file of files) {
  if (
    /(^|\/)(work|data|exports|node_modules|\.venv[^/]*|test-results|dist)\//.test(file) ||
    /\.sqlite|\.joblib|\.log$/.test(file) ||
    (/(^|\/)\.env($|\.)/.test(file) && file !== '.env.example')
  )
    throw new Error('Private/runtime path staged: ' + file);
  if (!existsSync(file)) continue;
  const content = execFileSync('git', ['show', ':' + file], { maxBuffer: 10_000_000 });
  if (content.length > 8_000_000) throw new Error('Unexpected large publication file: ' + file);
  if (content.subarray(0, 16).toString().startsWith('SQLite format'))
    throw new Error('SQLite database staged: ' + file);
  const text = content.toString('utf8');
  if (
    secrets.some((secret) => text.includes(secret)) ||
    /gh[pousr]_[A-Za-z0-9]{30,}/.test(text) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)
  )
    throw new Error('Secret material staged: ' + file);
}
if (files.includes('models/public-corpus-demo/model.json')) {
  const model = execFileSync('git', ['show', ':models/public-corpus-demo/model.json'], {
    maxBuffer: 10_000_000,
  });
  const report = JSON.parse(
    execFileSync('git', ['show', ':models/public-corpus-demo/evaluation.json'], {
      encoding: 'utf8',
    }),
  );
  if (createHash('sha256').update(model).digest('hex') !== report.model_artifact.sha256)
    throw new Error('Staged public model bytes do not match evaluation hash.');
}
console.log(
  'Publication check passed for ' +
    files.length +
    ' staged files: no configured secrets, databases, raw-data/cache/runtime paths or private keys.',
);
