import { test, expect } from '@playwright/test';
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});
test('actual local expression models load, blank camera abstains, and stop releases the stream', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/adapt');
  await page.getByText('More options', { exact: true }).click();
  await page.getByLabel('Workspace record purpose').selectOption('automated_test');
  await page.getByLabel('I voluntarily agree').check();
  await page.getByRole('button', { name: 'Assess my current mood' }).click();
  await expect(page.getByRole('button', { name: 'Enable camera & scan' })).toBeVisible();
  const credentials = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('moodspace-adaptive-session')!),
  );
  try {
    await expect(page.getByRole('slider')).toHaveCount(0);
    await page.getByRole('button', { name: 'Enable camera & scan' }).click();
    await expect(page.getByText('No face found. Face the camera in good light.')).toBeVisible({
      timeout: 45000,
    });
    await expect(page.getByRole('button', { name: /Use .* suggestion/ })).toHaveCount(0);
    await page.screenshot({ path: 'work/screenshots/camera-desktop.png' });
    await page.getByRole('button', { name: 'Stop camera' }).click();
    expect(
      await page.locator('video').evaluate((v) => (v as HTMLVideoElement).srcObject === null),
    ).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => page.locator('.sidebar').evaluate((e) => e.getBoundingClientRect().right))
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: 'work/screenshots/camera-mobile.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('radio', { name: /Neutral \/ Balanced/ }).check();
    await page.getByRole('button', { name: 'Open my workspace' }).click();
    await expect(page.locator('.workspace-U08')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await request.delete('/api/sessions/' + credentials.id, {
      headers: { Authorization: 'Bearer ' + credentials.token },
    });
  }
});
