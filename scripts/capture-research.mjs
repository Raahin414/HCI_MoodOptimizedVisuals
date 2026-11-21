import { readFile } from 'node:fs/promises';
import { parse } from 'dotenv';
import { chromium } from '@playwright/test';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const config = parse(await readFile('.env'));
const password = config.ADMIN_PASSWORD;
const response = await fetch(base + '/api/research', {
  headers: { Authorization: 'Bearer ' + password },
});
if (!response.ok) throw new Error('Local research authentication is unavailable.');
const data = await response.json();
if (data.sessions.length || data.workspace_sessions)
  throw new Error('Skip automatic research capture when genuine observations exist.');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto(base + '/research');
  await page.getByLabel('Administrator password').fill(password);
  await page.getByRole('button', { name: 'Open research console' }).click();
  await page.getByRole('heading', { name: 'Evidence, as it stands.' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'work/screenshots/research-console.png', fullPage: true });
  await page.screenshot({ path: 'work/screenshots/research-fold.png', fullPage: false });
  console.log('Captured genuine-only empty-state research console; no credentials shown.');
} finally {
  await browser.close();
}
