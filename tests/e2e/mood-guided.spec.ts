import { test, expect } from '@playwright/test';
for (const [mood, ui, name] of [
  ['Positive / Energetic', 'U02', 'Kanban Flow'],
  ['Neutral / Balanced', 'U08', 'Daily Brief'],
  ['Stressed / Overwhelmed', 'U01', 'Quiet Focus'],
])
  test(`${mood} opt-in design rules render ${name}, with all eight alternatives`, async ({
    page,
    request,
  }) => {
    await page.goto('/adapt');
    await page.getByLabel('Workspace record purpose').selectOption('automated_test');
    await page.getByLabel('Try mood-guided design suggestions').check();
    await page.getByLabel('I voluntarily agree').check();
    await page.getByRole('button', { name: 'Assess my current mood' }).click();
    await page.getByRole('radio', { name: new RegExp(mood.replace('/', '\\/')) }).check();
    await page.getByRole('button', { name: 'Find my workspace suggestion' }).click();
    await expect(page.getByText('Mood-guided design demonstration', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(page.getByText(/not evidence that this UI is best/)).toBeVisible();
    await page.getByRole('button', { name: 'Use suggested workspace' }).click();
    await expect(page.locator('.workspace-' + ui)).toBeVisible();
    const c = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('moodspace-adaptive-session')!),
    );
    const report = await (
      await request.get('http://127.0.0.1:3011/api/sessions/' + c.id + '/recommendation', {
        headers: { Authorization: 'Bearer ' + c.token },
      })
    ).json();
    expect(report).toMatchObject({
      selection_source: 'design-heuristic',
      sample_size: 0,
      ui_variant: ui,
    });
    expect(report.candidates).toHaveLength(8);
    await page.getByText('Workspace controls', { exact: true }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete workspace data' }).click();
  });
