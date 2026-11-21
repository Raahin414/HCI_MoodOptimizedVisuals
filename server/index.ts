import 'dotenv/config';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const app = createApp(openDb());
if (existsSync('dist/index.html')) {
  const { default: express } = await import('express');
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
}
const port = Number(process.env.PORT || 3001);
app.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(
    `MoodSpace API: http://127.0.0.1:${port}${process.env.TEST_MODE === 'true' ? ' [AUTOMATED TEST MODE]' : ''}`,
  ),
);
