import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
await mkdir('public/previews', { recursive: true });
await mkdir('work/screenshots', { recursive: true });
for (let i = 1; i <= 8; i++) {
  const id = 'U0' + i;
  await page.goto(base + '/workspace/' + id);
  await page.locator('.workspace').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator('.workspace').boundingBox();
  await page.screenshot({
    path: 'public/previews/' + id + '.png',
    clip: { x: box.x, y: box.y, width: box.width, height: Math.min(590, box.height) },
    animations: 'disabled',
  });
  await page.screenshot({ path: 'work/screenshots/' + id + '-desktop.png', fullPage: false });
}
await page.goto(base + '/');
await page.screenshot({ path: 'work/screenshots/overview-desktop.png', fullPage: true });
for (const width of [1440, 768, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(base + '/gallery');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('img').evaluateAll((images) =>
    Promise.all(
      images.map((image) => {
        image.loading = 'eager';
        return image.decode().catch(() => {});
      }),
    ),
  );
  await page.screenshot({ path: `work/screenshots/gallery-${width}.png`, fullPage: true });
}
await page.setViewportSize({ width: 390, height: 1000 });
for (let i = 1; i <= 8; i++) {
  const id = 'U0' + i;
  await page.goto(base + '/workspace/' + id);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `work/screenshots/${id}-mobile.png`, fullPage: false });
}
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(base + '/adapt');
await page.screenshot({ path: 'work/screenshots/adaptive-entry.png', fullPage: true });
await browser.close();
console.log('Captured eight original previews from the runnable application.');
